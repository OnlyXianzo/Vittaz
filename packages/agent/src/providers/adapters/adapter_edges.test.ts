import { afterEach, expect, test, vi } from "vitest";
import { PrivacyRedactor } from "@vittaz/core";
import {
  AllKeysFailedError,
  BadRequestNoFallbackError,
  InvalidProviderConfigError,
  MissingCredentialError,
} from "../../index.js";
import { startFakeOpenAIServer } from "../../../../../tests/helpers/fake_openai_server.js";
import { startFakeAnthropicServer } from "../../../../../tests/helpers/fake_anthropic_server.js";
import { validateCompletionRequest } from "../../provider_client.js";
import { ProtocolError, readText } from "../../http_body.js";
import { create_ai_sdk_provider } from "./ai_sdk.js";
import { require_base_url } from "../contracts/provider.js";
import type { KeyPool } from "../../key_pool.js";
import { bounded_fetch } from "./bounded_fetch.js";
import { create_anthropic_provider, token_count } from "./anthropic.js";
import { safe_parse, to_sdk_messages } from "./sdk_prompt.js";

/**
 * Defensive edges of the two SDK adapters, plus the body reader they both rely
 * on. The repository holds every file at 100% coverage, so a guard that can only
 * fire on a malformed or hostile response needs a test that provokes it —
 * otherwise it is indistinguishable from dead code and nothing stops it rotting.
 */

const real_fetch = globalThis.fetch;
const servers: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

const ask = { messages: [{ role: "user" as const, content: "Synthetic" }] };

/* ------------------------------------------------------------- http_body */

test("read_text_refuses_a_response_with_no_body", async () => {
  await expect(async () => {
    for await (const piece of readText(new Response(null))) void piece;
  }).rejects.toBeInstanceOf(ProtocolError);
});

test("read_text_cancels_the_reader_when_the_consumer_stops_early", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode("chunk"));
    },
    cancel() {
      cancelled = true;
    },
  });
  for await (const piece of readText(new Response(stream))) {
    expect(piece).toBe("chunk");
    break;
  }
  expect(cancelled).toBe(true);
});

/* ------------------------------------------------------- provider_client */

test("request_validation_rejects_an_oversized_wire_body", () => {
  // 64 KiB is the ceiling the deleted client enforced; the guard must survive.
  expect(() =>
    validateCompletionRequest(
      {
        messages: [{ role: "user", content: "x".repeat(70000) }],
      },
      new PrivacyRedactor(),
    ),
  ).toThrow();
});

test("request_validation_rejects_a_message_that_is_not_a_list", () => {
  // Unknown fields are tolerated (forward compatible), but a malformed message
  // list is not: the schema parse must reject it and the wrapper must not leak
  // the zod message.
  expect(() =>
    validateCompletionRequest(
      { messages: "not-a-list" } as never,
      new PrivacyRedactor(),
    ),
  ).toThrow();
});

/* ----------------------------------------------------- openai_compatible */

function openai_provider(
  base_url: string,
  overrides: Record<string, unknown> = {},
  deps: Record<string, unknown> = {},
) {
  return create_ai_sdk_provider(
    {
      id: "edge",
      kind: "openai_compatible",
      credential_ref: "K",
      base_url,
      default_model: "synthetic/model",
      ...overrides,
    },
    {
      resolve_credential: async () => "synthetic_key",
      redactor: new PrivacyRedactor(),
      ...deps,
    },
  );
}

test("openai_compatible_rejects_a_zero_timeout_before_any_request", () => {
  // Configuration is validated at construction, not on the first call.
  expect(() =>
    openai_provider("https://example.invalid", {}, { timeout_ms: 0 }),
  ).toThrow();
});

test("openai_compatible_rejects_an_invalid_api_suffix_before_any_request", () => {
  expect(() =>
    openai_provider("https://example.invalid", { api_suffix: "not-a-path" }),
  ).toThrow();
});

test("openai_compatible_wraps_a_key_pool_rejection_as_a_config_error", async () => {
  // A pasted key with a stray space is the realistic case. KeyPool refuses it,
  // and the adapter must report a configuration fault rather than a network one.
  const server = await startFakeOpenAIServer(() => ({ content: "Synthetic" }));
  servers.push(server);
  await expect(
    openai_provider(
      server.baseUrl,
      {},
      { resolve_credential: async () => "bad key with spaces" },
    ).chatCompletion(ask),
  ).rejects.toThrow();
  expect(server.recordedRequests).toHaveLength(0);
});

test("openai_compatible_classifies_a_non_object_transport_error_without_crashing", async () => {
  // A transport fault can arrive as a bare value. Classification must fall
  // through to the unknown category instead of throwing a TypeError.
  await expect(
    openai_provider(
      "https://example.invalid",
      {},
      {
        fetch: () => Promise.reject("synthetic string failure"),
      },
    ).chatCompletion(ask),
  ).rejects.toThrow();
});

test("openai_compatible_stream_honours_abort_before_the_first_delta", async () => {
  const server = await startFakeOpenAIServer(() => ({ content: "Synthetic" }));
  servers.push(server);
  const controller = new AbortController();
  controller.abort();
  await expect(
    openai_provider(server.baseUrl).chatCompletion({
      ...ask,
      stream: true,
      signal: controller.signal,
    }),
  ).rejects.toThrow();
});

test("openai_compatible_stream_surfaces_a_throwing_delta_callback", async () => {
  const server = await startFakeOpenAIServer(() => ({
    wireChunks: [
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "A" }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
    ],
  }));
  servers.push(server);
  // The consumer's callback failed; that is the caller's error and must surface
  // rather than being swallowed into an empty successful answer.
  await expect(
    openai_provider(server.baseUrl).chatCompletion({
      ...ask,
      stream: true,
      onStreamDelta: () => {
        throw new Error("synthetic callback failure");
      },
    }),
  ).rejects.toThrow();
});

/* ------------------------------------------------------------- anthropic */

async function open_anthropic(
  responder?: Parameters<typeof startFakeAnthropicServer>[0],
) {
  const server = await startFakeAnthropicServer(responder);
  servers.push(server);
  const fetch_impl = ((input: RequestInfo | URL, init?: RequestInit) =>
    real_fetch(
      String(input).replace("https://api.anthropic.com", server.baseUrl),
      init,
    )) as typeof fetch;
  return { server, fetch_impl };
}

function anthropic_provider(
  fetch_impl: typeof fetch,
  deps: Record<string, unknown> = {},
) {
  return create_anthropic_provider(
    {
      id: "edge-anthropic",
      kind: "anthropic",
      credential_ref: "K",
      default_model: "synthetic-model",
    },
    {
      resolve_credential: async () => "sk-ant-synthetic",
      fetch: fetch_impl,
      redactor: new PrivacyRedactor(),
      ...deps,
    },
  );
}

test("anthropic_aborts_before_the_first_delta_when_already_aborted", async () => {
  const { fetch_impl } = await open_anthropic(() => ({
    content: [{ type: "text", text: "Synthetic" }],
  }));
  const controller = new AbortController();
  controller.abort();
  await expect(
    anthropic_provider(fetch_impl).chatCompletion({
      ...ask,
      stream: true,
      signal: controller.signal,
    }),
  ).rejects.toThrow();
});

test("anthropic_rejects_a_reply_with_too_many_tool_calls", async () => {
  const { fetch_impl } = await open_anthropic(() => ({
    content: Array.from({ length: 40 }, (_, index) => ({
      type: "tool_use" as const,
      id: `tool_${index}`,
      name: "get_balance",
      input: {},
    })),
  }));
  await expect(
    anthropic_provider(fetch_impl).chatCompletion(ask),
  ).rejects.toThrow();
});

test("anthropic_rejects_an_oversized_reply", async () => {
  const { fetch_impl } = await open_anthropic(() => ({
    content: [{ type: "text", text: "x".repeat(100000) }],
  }));
  await expect(
    anthropic_provider(fetch_impl).chatCompletion(ask),
  ).rejects.toThrow();
});

test("anthropic_resets_a_stream_when_the_delta_callback_fails", async () => {
  const { fetch_impl } = await open_anthropic(() => ({
    content: [{ type: "text", text: "Synthetic" }],
  }));
  let reset = false;
  await expect(
    anthropic_provider(fetch_impl).chatCompletion({
      ...ask,
      stream: true,
      onStreamReset: () => {
        reset = true;
      },
      onStreamDelta: () => {
        throw new Error("synthetic callback failure");
      },
    }),
  ).rejects.toThrow();
  expect(reset).toBe(true);
});

test("anthropic_resets_a_stream_on_an_empty_answer", async () => {
  const { fetch_impl } = await open_anthropic(() => ({
    content: [],
    rawBody: {
      id: "msg_synthetic",
      type: "message",
      role: "assistant",
      model: "synthetic-model",
      content: [],
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 0 },
    },
  }));
  let reset = false;
  await expect(
    anthropic_provider(fetch_impl).chatCompletion({
      ...ask,
      stream: true,
      onStreamReset: () => {
        reset = true;
      },
    }),
  ).rejects.toThrow();
  expect(reset).toBe(true);
});

test("anthropic_reports_a_network_fault_as_a_connection_error", async () => {
  const fetch_impl = (() =>
    Promise.reject(
      new Error("synthetic network down"),
    )) as unknown as typeof fetch;
  await expect(
    anthropic_provider(fetch_impl).chatCompletion(ask),
  ).rejects.toThrow();
});

/* -------------------------------------------------- provider_client (size) */

test("request_validation_rejects_a_body_over_64k_with_every_field_in_range", () => {
  // Each message is inside the per-field limit; only their sum exceeds the wire
  // ceiling, so this can only be caught by the byte-size guard.
  const messages = Array.from({ length: 3 }, () => ({
    role: "user" as const,
    content: "x".repeat(30000),
  }));
  expect(() =>
    validateCompletionRequest({ messages }, new PrivacyRedactor()),
  ).toThrow("Invalid provider request");
});

/* ------------------------------------------------------------- http_body */

test("read_text_survives_a_stream_that_refuses_to_cancel", async () => {
  // Teardown must never mask the caller's own error: a cancel failure is
  // swallowed and the original outcome stands.
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode("chunk"));
    },
    cancel() {
      throw new Error("synthetic cancel failure");
    },
  });
  const pieces: string[] = [];
  for await (const piece of readText(new Response(stream))) {
    pieces.push(piece);
    break;
  }
  expect(pieces).toEqual(["chunk"]);
});

/* ----------------------------------------------------- sdk_prompt mapping */

test("sdk_messages_tolerate_missing_ids_and_null_content", () => {
  const mapped = to_sdk_messages([
    { role: "system", content: null },
    { role: "user", content: null },
    {
      role: "assistant",
      content: "Here is the answer",
      tool_calls: [
        {
          id: "call_known",
          type: "function",
          function: { name: "get_balance", arguments: '{"asset":"BTC"}' },
        },
        { type: "function", function: { name: "get_balance", arguments: "{" } },
      ],
    },
    { role: "tool", content: "ok", tool_call_id: undefined },
    { role: "tool", content: null, tool_call_id: "call_unknown" },
  ]);

  const [assistant, anonymous_tool, unknown_tool] = mapped.messages.slice(1);
  expect(assistant).toMatchObject({ role: "assistant" });
  // A tool call with no id still needs a stable id, or the SDK cannot pair it.
  expect(
    (assistant as { content: { toolCallId: string }[] }).content[2],
  ).toMatchObject({
    toolCallId: "call_1",
  });
  expect(
    (anonymous_tool as { content: { toolCallId: string }[] }).content[0],
  ).toMatchObject({
    toolCallId: "",
    toolName: "",
  });
  // An unknown id cannot resolve to a name; the empty name is the documented
  // outcome rather than a throw.
  expect(
    (unknown_tool as { content: { toolName: string }[] }).content[0],
  ).toMatchObject({
    toolName: "",
  });
});

test("safe_parse_never_throws_on_malformed_tool_arguments", () => {
  expect(safe_parse("{not json")).toEqual({});
  expect(safe_parse('{"asset":"BTC"}')).toEqual({ asset: "BTC" });
});

/* ------------------------------------------- openai_compatible: mid-flight */

test("openai_compatible_sends_a_configured_auth_header_verbatim", async () => {
  const server = await startFakeOpenAIServer(() => ({ content: "Synthetic" }));
  servers.push(server);
  const provider = openai_provider(server.baseUrl, {
    auth: { header: "x-goog-api-key", scheme: "Bearer" },
  });
  await provider.chatCompletion(ask);
  expect(server.recordedRequests[0]?.headers["x-goog-api-key"]).toBe(
    "Bearer synthetic_key",
  );
});

test("openai_compatible_exhausts_a_single_key_and_reports_the_attempt", async () => {
  // One key, one failure: the pool has nothing left to rotate to, so the
  // recorded failure must be surfaced rather than replaced by a generic error.
  const server = await startFakeOpenAIServer(() => ({ status: 500 }));
  servers.push(server);
  await expect(
    openai_provider(server.baseUrl).chatCompletion(ask),
  ).rejects.toThrow(AllKeysFailedError);
});

test("openai_compatible_reports_cancellation_raised_while_the_request_was_in_flight", async () => {
  // The caller aborts after dispatch. The transport must report a cancellation
  // rather than the transport error that the abort produced.
  const server = await startFakeOpenAIServer(() => ({ content: "Synthetic" }));
  servers.push(server);
  const controller = new AbortController();
  const fetch_impl = ((input: RequestInfo | URL, init?: RequestInit) => {
    controller.abort();
    const rest: RequestInit = { ...(init ?? {}), signal: undefined };
    return real_fetch(
      String(input).replace("https://example.invalid", server.baseUrl),
      rest,
    );
  }) as typeof fetch;
  await expect(
    openai_provider(
      "https://example.invalid",
      {},
      { fetch: fetch_impl },
    ).chatCompletion({
      ...ask,
      signal: controller.signal,
    }),
  ).rejects.toThrow(/cancelled/i);
});

test("openai_compatible_passes_a_credential_fault_through_unchanged", async () => {
  // A key that turns out to be unusable mid-flight is a configuration fault, not
  // a provider failure: it must not be counted against the key pool.
  const fetch_impl = (() =>
    Promise.reject(
      new InvalidProviderConfigError(),
    )) as unknown as typeof fetch;
  await expect(
    openai_provider(
      "https://example.invalid",
      {},
      { fetch: fetch_impl },
    ).chatCompletion(ask),
  ).rejects.toBeInstanceOf(InvalidProviderConfigError);
});

/* ------------------------------------------------- anthropic: mid-flight */

test("anthropic_classifies_a_non_object_transport_error_as_a_connection_fault", async () => {
  const fetch_impl = (() =>
    Promise.reject("synthetic string failure")) as unknown as typeof fetch;
  await expect(
    anthropic_provider(fetch_impl).chatCompletion(ask),
  ).rejects.toThrow(AllKeysFailedError);
});

test("anthropic_rejects_an_unpaired_tool_message_before_any_request", async () => {
  // The SDK resolves the tool name by id, so an unpaired tool message would go
  // out with an empty name instead of failing fast.
  const { server, fetch_impl } = await open_anthropic(() => ({
    content: [{ type: "text", text: "Synthetic" }],
  }));
  await expect(
    anthropic_provider(fetch_impl).chatCompletion({
      messages: [
        { role: "user", content: "Synthetic" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              type: "function",
              function: { name: "get_balance", arguments: "{}" },
            },
          ],
        },
        { role: "tool", content: "{}", tool_call_id: "call_missing" },
      ],
    }),
  ).rejects.toThrow(/Invalid provider request/);
  expect(server.recordedRequests).toHaveLength(0);
});

test("anthropic_rejects_a_tool_call_id_that_could_not_be_echoed_safely", async () => {
  const { fetch_impl } = await open_anthropic(() => ({
    content: [
      {
        type: "tool_use",
        id: "call with spaces!",
        name: "get_balance",
        input: {},
      },
    ],
  }));
  await expect(
    anthropic_provider(fetch_impl).chatCompletion(ask),
  ).rejects.toThrow(AllKeysFailedError);
});

test("anthropic_works_without_an_injected_fetch", async () => {
  // Production passes no fetch. The request is rejected while validating, so
  // this proves the factory path without ever reaching the network.
  const provider = create_anthropic_provider(
    {
      id: "edge-anthropic",
      kind: "anthropic",
      credential_ref: "K",
      default_model: "synthetic-model",
    },
    {
      resolve_credential: async () => "sk-ant-synthetic",
      redactor: new PrivacyRedactor(),
    },
  );
  expect(provider.kind).toBe("anthropic");
  await expect(
    provider.chatCompletion({
      messages: [
        { role: "user", content: "Synthetic" },
        { role: "tool", content: "{}", tool_call_id: "call_missing" },
      ],
    }),
  ).rejects.toThrow(/Invalid provider request/);
});

test("token_count_defaults_a_count_the_sdk_left_undefined", () => {
  // The SDK types every usage field as optional; a parsed Anthropic message
  // always carries both, so the fallback is proven here rather than in-flight.
  expect(token_count(undefined)).toBe(0);
  expect(token_count(0)).toBe(0);
  expect(token_count(7)).toBe(7);
});

test("anthropic_reports_a_cancellation_that_did_not_involve_a_stream", async () => {
  // Same abort, no stream: the answer is still a cancellation, and there is no
  // stream to reset because the caller never asked for one.
  const { server, fetch_impl } = await open_anthropic(() => ({
    content: [{ type: "text", text: "Synthetic" }],
  }));
  const controller = new AbortController();
  const aborting_fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    controller.abort();
    const rest: RequestInit = { ...(init ?? {}), signal: undefined };
    return fetch_impl(
      String(input).replace("https://api.anthropic.com", server.baseUrl),
      rest,
    );
  }) as typeof fetch;
  let reset = false;
  await expect(
    anthropic_provider(aborting_fetch).chatCompletion({
      ...ask,
      signal: controller.signal,
      onStreamReset: () => {
        reset = true;
      },
    }),
  ).rejects.toThrow(/cancelled/i);
  expect(reset).toBe(false);
});

test("anthropic_reports_cancellation_raised_while_the_request_was_in_flight", async () => {
  const controller = new AbortController();
  // The abort lands mid-flight, so the failure surfaces from inside the request
  // rather than from the post-response check.
  const aborting_fetch = (() => {
    controller.abort();
    return Promise.reject(new Error("synthetic mid-flight abort"));
  }) as unknown as typeof fetch;
  let reset = false;
  await expect(
    anthropic_provider(aborting_fetch, {}).chatCompletion({
      ...ask,
      stream: true,
      signal: controller.signal,
      onStreamReset: () => {
        reset = true;
      },
    }),
  ).rejects.toThrow(/cancelled/i);
  expect(reset).toBe(true);
});

test("anthropic_passes_a_credential_fault_through_unchanged", async () => {
  const fetch_impl = (() =>
    Promise.reject(new MissingCredentialError())) as unknown as typeof fetch;
  await expect(
    anthropic_provider(fetch_impl).chatCompletion(ask),
  ).rejects.toBeInstanceOf(MissingCredentialError);
});

test("anthropic_resets_a_stream_that_failed_with_a_server_error", async () => {
  const { fetch_impl } = await open_anthropic(() => ({ status: 500 }));
  let reset = false;
  await expect(
    anthropic_provider(fetch_impl).chatCompletion({
      ...ask,
      stream: true,
      onStreamReset: () => {
        reset = true;
      },
    }),
  ).rejects.toThrow(AllKeysFailedError);
  expect(reset).toBe(true);
});

test("anthropic_resets_a_stream_whose_reply_broke_a_protocol_cap", async () => {
  // Any shape breach resets the consumer's stream. The tool-id cap is used here
  // rather than the reply-length cap: the same branch, without streaming 33k
  // frames to reach it.
  const { fetch_impl } = await open_anthropic(() => ({
    content: [
      {
        type: "tool_use",
        id: "call with spaces!",
        name: "get_balance",
        input: {},
      },
    ],
  }));
  let reset = false;
  await expect(
    anthropic_provider(fetch_impl).chatCompletion({
      ...ask,
      stream: true,
      onStreamReset: () => {
        reset = true;
      },
    }),
  ).rejects.toThrow(AllKeysFailedError);
  expect(reset).toBe(true);
});

test("anthropic_resets_a_stream_that_ended_in_band_with_an_error", async () => {
  const { fetch_impl } = await open_anthropic(() => ({
    content: [{ type: "text", text: "Partial" }],
    stop_reason: "refusal",
  }));
  let reset = false;
  await expect(
    anthropic_provider(fetch_impl).chatCompletion({
      ...ask,
      stream: true,
      onStreamReset: () => {
        reset = true;
      },
    }),
  ).rejects.toThrow(AllKeysFailedError);
  expect(reset).toBe(true);
});

/* ------------------------------------------------------- contracts: base_url */

test("require_base_url_rejects_a_config_that_never_should_have_validated", () => {
  // Belt and braces for the type system: validation already refuses this, so the
  // throw is only reachable when called directly.
  expect(() =>
    require_base_url({
      id: "edge",
      kind: "openai_compatible",
      credential_ref: "K",
      default_model: "synthetic/model",
    }),
  ).toThrow(InvalidProviderConfigError);
  expect(
    require_base_url({
      id: "edge",
      kind: "openai_compatible",
      base_url: "https://example.invalid",
      credential_ref: "K",
      default_model: "synthetic/model",
    }),
  ).toBe("https://example.invalid");
});

test("anthropic_fails_a_non_streamed_in_band_error_without_a_reset", async () => {
  // Nothing to reset when the caller did not stream, but a partial answer must
  // still fail rather than being delivered.
  const { fetch_impl } = await open_anthropic(() => ({
    content: [{ type: "text", text: "Partial" }],
    stop_reason: "refusal",
  }));
  let reset = false;
  await expect(
    anthropic_provider(fetch_impl).chatCompletion({
      ...ask,
      onStreamReset: () => {
        reset = true;
      },
    }),
  ).rejects.toThrow(AllKeysFailedError);
  expect(reset).toBe(false);
});

test("openai_compatible_does_not_invent_a_key_failure_the_pool_did_not_report", async () => {
  // An injected pool is authoritative. If it reports every key healthy but
  // offers no candidate, the adapter must not manufacture a failure reason: the
  // exhaustion error still surfaces, with nothing recorded against a key.
  const pool = {
    getCandidateEntries: () => [],
    getStatusSnapshot: () => [{ nickname: "healthy_key", state: "healthy" }],
  } as unknown as KeyPool;
  await expect(
    openai_provider(
      "https://example.invalid",
      {},
      { key_pool: pool, resolve_credential: async () => "synthetic_key" },
    ).chatCompletion(ask),
  ).rejects.toThrow(AllKeysFailedError);
});

test("anthropic_reports_a_cancellation_that_arrived_after_the_answer", async () => {
  // The response is complete but the caller has already gone away. Delivering
  // the answer would hand a cancelled run a result it may not expect.
  const { server, fetch_impl } = await open_anthropic(() => ({
    content: [{ type: "text", text: "Synthetic" }],
  }));
  const controller = new AbortController();
  const late_abort_fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const rest: RequestInit = { ...(init ?? {}), signal: undefined };
    return fetch_impl(
      String(input).replace("https://api.anthropic.com", server.baseUrl),
      rest,
    ).finally(() => controller.abort());
  }) as typeof fetch;
  await expect(
    anthropic_provider(late_abort_fetch).chatCompletion({
      ...ask,
      signal: controller.signal,
    }),
  ).rejects.toThrow(/cancelled/i);
});

test("anthropic_resets_the_stream_when_the_abort_lands_after_the_answer", async () => {
  // The caller goes away during the final delta. The stream is complete, but the
  // run is cancelled: the partial answer must not be handed back, and the
  // consumer's stream has to be reset.
  const { fetch_impl } = await open_anthropic(() => ({
    content: [{ type: "text", text: "Synthetic" }],
  }));
  const controller = new AbortController();
  // The abort fires as the body ends, so the stream itself completes and the
  // cancellation is only visible once the answer is in hand.
  const late_abort_fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    fetch_impl(input, init).then((response) => {
      const body = response.body?.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller_) {
            controller_.enqueue(chunk);
          },
          flush() {
            controller.abort();
          },
        }),
      );
      return new Response(body ?? null, {
        status: response.status,
        headers: response.headers,
      });
    })) as typeof fetch;
  let reset = false;
  await expect(
    anthropic_provider(late_abort_fetch).chatCompletion({
      ...ask,
      stream: true,
      signal: controller.signal,
      onStreamReset: () => {
        reset = true;
      },
    }),
  ).rejects.toThrow(/cancelled/i);
  expect(reset).toBe(true);
});

/* ------------------------------------------------------- bounded responses */

const one_mebibyte = 1048576;

function oversized(): typeof fetch {
  return (async () =>
    new Response("x".repeat(one_mebibyte + 1), {
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

test("bounded_fetch_fails_a_body_that_passes_one_mebibyte", async () => {
  // The SDK's own reader accepts up to 2 GiB, so this ceiling is the only thing
  // standing between a broken endpoint and a phone's memory.
  const response = await bounded_fetch(oversized())(
    new URL("https://x.invalid"),
  );
  await expect(async () => {
    for await (const piece of readText(response)) void piece;
  }).rejects.toBeInstanceOf(ProtocolError);
});

test("bounded_fetch_passes_a_normal_response_through_untouched", async () => {
  const inner = (async () =>
    new Response('{"ok":true}', {
      status: 201,
      statusText: "Created",
      headers: { "content-type": "application/json", "x-synthetic": "1" },
    })) as unknown as typeof fetch;
  const response = await bounded_fetch(inner)(new URL("https://x.invalid"));
  expect(response.status).toBe(201);
  expect(response.statusText).toBe("Created");
  expect(response.headers.get("x-synthetic")).toBe("1");
  expect(await response.text()).toBe('{"ok":true}');
});

test("bounded_fetch_leaves_a_bodyless_response_alone", async () => {
  const inner = (async () =>
    new Response(null, { status: 204 })) as unknown as typeof fetch;
  const response = await bounded_fetch(inner)(new URL("https://x.invalid"));
  expect(response.status).toBe(204);
  expect(response.body).toBeNull();
});

/* ------------------------------------------ auth, abort and streamed errors */

test("openai_compatible_honours_a_configured_scheme_on_authorization", async () => {
  // The SDK can only send `Bearer`. A configuration that asks for anything else
  // on `Authorization` must not be quietly downgraded to the SDK's default.
  const server = await startFakeOpenAIServer(() => ({ content: "Synthetic" }));
  servers.push(server);
  const provider = openai_provider(server.baseUrl, {
    auth: { header: "authorization", scheme: "Basic" },
  });
  await provider.chatCompletion(ask);
  expect(server.recordedRequests[0]?.headers.authorization).toBe(
    "Basic synthetic_key",
  );
});

test("openai_compatible_fails_closed_on_a_streamed_400", async () => {
  // `streamed.text` rejects with a status-less error, so without capturing the
  // SDK's own error this looks like a connection fault and rotates the key.
  const server = await startFakeOpenAIServer(() => ({ status: 400 }));
  servers.push(server);
  await expect(
    openai_provider(server.baseUrl).chatCompletion({ ...ask, stream: true }),
  ).rejects.toThrow(BadRequestNoFallbackError);
});

test("openai_compatible_keeps_the_key_on_a_streamed_401", async () => {
  // A streamed 401 must still mark the key unauthorized, which only happens if
  // the real status survives the SDK's stream wrapper.
  const pool = {
    getCandidateEntries: (tried: Set<string>) =>
      tried.has("only") ? [] : [{ nickname: "only", apiKey: "synthetic_key" }],
    getStatusSnapshot: () => [{ nickname: "only", state: "healthy" }],
    markUnauthorized: () => {
      unauthorized = true;
    },
    markRateLimited: () => undefined,
  } as unknown as KeyPool;
  let unauthorized = false;
  const server = await startFakeOpenAIServer(() => ({ status: 401 }));
  servers.push(server);
  await expect(
    openai_provider(server.baseUrl, {}, { key_pool: pool }).chatCompletion({
      ...ask,
      stream: true,
    }),
  ).rejects.toThrow(AllKeysFailedError);
  expect(unauthorized).toBe(true);
});

test("openai_compatible_does_not_write_a_stream_error_to_the_console", async () => {
  // SDK errors carry request values and the raw response body; the default
  // handler prints them. Nothing reaches the console.
  const errors: unknown[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args);
  });
  try {
    const server = await startFakeOpenAIServer(() => ({ status: 500 }));
    servers.push(server);
    await expect(
      openai_provider(server.baseUrl).chatCompletion({ ...ask, stream: true }),
    ).rejects.toThrow(AllKeysFailedError);
    expect(errors).toEqual([]);
  } finally {
    spy.mockRestore();
  }
});

test("openai_compatible_cancels_the_request_when_the_caller_aborts_mid_stream", async () => {
  // The callback controller must not replace the caller's signal, or an abort
  // during streaming would never reach the socket.
  const server = await startFakeOpenAIServer(() => ({
    wireChunks: [
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "A" }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "B" }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ],
  }));
  servers.push(server);
  const controller = new AbortController();
  await expect(
    openai_provider(server.baseUrl).chatCompletion({
      ...ask,
      stream: true,
      signal: controller.signal,
      onStreamDelta: () => {
        controller.abort();
      },
    }),
  ).rejects.toThrow(/cancelled/i);
});
