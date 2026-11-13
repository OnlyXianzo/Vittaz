import { afterEach, expect, test, vi } from "vitest";
import { PrivacyRedactor } from "@vittaz/core";
import {
  startFakeAnthropicServer,
  type RecordedAnthropicRequest,
} from "../../../tests/helpers/fake_anthropic_server.js";
import { AllKeysFailedError, BadRequestNoFallbackError } from "./key_pool.js";
import {
  ANTHROPIC_API_VERSION,
  create_anthropic_provider,
} from "./providers/index.js";
import type { ChatMessage, ToolSpec } from "./provider_client.js";

/**
 * Anthropic transport guarantees, exercised through `@ai-sdk/anthropic` — the
 * transport that replaced `AnthropicMessagesClient`.
 *
 * Everything here is a *contract* assertion: request mapping, the failure
 * vocabulary, preflight, cancellation. What is deliberately **not** re-tested is
 * the SSE framing minutiae the deleted 1,248-line suite covered (fragmented
 * frames, out-of-order frames, unknown events, unterminated final frames,
 * `thinking` deltas): that is now the SDK's job, and it has its own tests. If
 * we keep testing our own copy of it we have not removed the maintenance.
 */

const real_fetch = globalThis.fetch;
const servers: Awaited<ReturnType<typeof startFakeAnthropicServer>>[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

/**
 * The endpoint is pinned to `https://api.anthropic.com` in the adapter (it is
 * never configuration). To exercise real HTTP and real SSE, the injected fetch
 * rewrites that origin to the local fake server and nothing else.
 */
async function open(
  responder?: Parameters<typeof startFakeAnthropicServer>[0],
  deps: {
    timeout_ms?: number;
    redactor?: PrivacyRedactor;
    key?: string | null;
  } = {},
) {
  const server = await startFakeAnthropicServer(responder);
  servers.push(server);
  const fetch_impl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace(
      "https://api.anthropic.com",
      server.baseUrl,
    );
    return real_fetch(url, init);
  }) as typeof fetch;
  const provider = create_anthropic_provider(
    {
      id: "anthropic_byok",
      kind: "anthropic",
      credential_ref: "anthropic_api_key",
      default_model: "claude-sonnet-5-5",
    },
    {
      resolve_credential: async () =>
        "key" in deps ? deps.key! : "sk-ant-synthetic",
      fetch: fetch_impl,
      ...(deps.timeout_ms ? { timeout_ms: deps.timeout_ms } : {}),
      ...(deps.redactor ? { redactor: deps.redactor } : {}),
    },
  );
  return { server, provider };
}

const ask = (content = "Synthetic question") => ({
  messages: [{ role: "user" as const, content }],
});
const text = (value: string) => [{ type: "text" as const, text: value }];

test("anthropic_sends_the_messages_api_request_with_the_pinned_version", async () => {
  const { server, provider } = await open(() => ({
    content: text("Synthetic answer"),
    usage: { input_tokens: 11, output_tokens: 5 },
  }));
  const result = await provider.chatCompletion(ask());
  expect(result.content).toBe("Synthetic answer");
  expect(result.usage).toEqual({
    prompt_tokens: 11,
    completion_tokens: 5,
    total_tokens: 16,
  });
  expect(result.keyNickname).toBe("anthropic_byok");

  const request = server.recordedRequests[0]!;
  expect(request.apiKey).toBe("sk-ant-synthetic");
  // The project verifies against this version; the SDK default differs.
  expect(request.version).toBe(ANTHROPIC_API_VERSION);
  expect(request.parsedBody).toMatchObject({
    model: "claude-sonnet-5-5",
    messages: [
      { role: "user", content: [{ type: "text", text: "Synthetic question" }] },
    ],
  });
  expect(request.rawBody).not.toContain("sk-ant-synthetic");
});

test("anthropic_defaults_the_reply_budget_to_1024_tokens", async () => {
  const { server, provider } = await open(() => ({ content: text("ok") }));
  await provider.chatCompletion(ask());
  // The SDK's own default is the model maximum (128000); that would multiply
  // the worst-case cost of every un-capped request.
  expect(server.recordedRequests[0]!.parsedBody).toMatchObject({
    max_tokens: 1024,
  });
});

test("anthropic_passes_a_caller_supplied_budget_through", async () => {
  const { server, provider } = await open(() => ({ content: text("ok") }));
  await provider.chatCompletion({ ...ask(), maxCompletionTokens: 50 });
  expect(server.recordedRequests[0]!.parsedBody).toMatchObject({
    max_tokens: 50,
  });
});

test("anthropic_maps_system_text_and_tool_results", async () => {
  const { server, provider } = await open(() => ({ content: text("ok") }));
  const messages: ChatMessage[] = [
    { role: "system", content: "You are Vittaz." },
    { role: "user", content: "what is my balance?" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "toolu_1",
          type: "function",
          function: { name: "get_balance", arguments: "{}" },
        },
      ],
    },
    { role: "tool", content: '{"balance":1}', tool_call_id: "toolu_1" },
  ];
  await provider.chatCompletion({ messages });
  const body = server.recordedRequests[0]!.parsedBody as {
    system: { text: string }[];
    messages: { role: string; content: unknown[] }[];
  };
  // `system` is lifted out of `messages` by the shared mapping.
  expect(body.system).toEqual([{ type: "text", text: "You are Vittaz." }]);
  expect(body.messages.map((message) => message.role)).toEqual([
    "user",
    "assistant",
    "user",
  ]);
  expect(JSON.stringify(body.messages)).toContain("tool_result");
  expect(JSON.stringify(body.messages)).toContain("toolu_1");
});

test("anthropic_returns_tool_use_as_tool_calls_that_the_harness_must_run", async () => {
  const tools: ToolSpec[] = [
    {
      type: "function",
      function: {
        name: "query_transactions",
        description: "Read only query",
        parameters: {
          type: "object",
          properties: { limit: { type: "number" } },
        },
      },
    },
  ];
  const plan = {
    content: [
      {
        type: "tool_use" as const,
        id: "toolu_1",
        name: "query_transactions",
        input: { limit: 2 },
      },
    ],
    stop_reason: "tool_use",
  };
  const { server, provider } = await open(() => plan);
  const result = await provider.chatCompletion({ ...ask(), tools });
  expect(result.toolCalls).toEqual([
    {
      id: "toolu_1",
      type: "function",
      function: { name: "query_transactions", arguments: '{"limit":2}' },
    },
  ]);
  // Definitions only, no execution: the tool ran nowhere, and the harness is
  // still the only thing that can run it.
  const body = server.recordedRequests[0]!.parsedBody as { tools: unknown[] };
  expect(body.tools).toEqual([
    {
      name: "query_transactions",
      description: "Read only query",
      input_schema: {
        type: "object",
        properties: { limit: { type: "number" } },
      },
    },
  ]);
});

test("anthropic_streams_text_and_usage_over_real_sse", async () => {
  const { provider } = await open(() => ({
    content: text("Streamed answer"),
    usage: { input_tokens: 3, output_tokens: 4 },
  }));
  const deltas: string[] = [];
  const result = await provider.chatCompletion({
    ...ask(),
    stream: true,
    onStreamDelta: (delta) => deltas.push(delta),
  });
  expect(result.content).toBe("Streamed answer");
  expect(deltas.join("")).toBe("Streamed answer");
  expect(result.usage.total_tokens).toBe(7);
});

test("anthropic_stream_assembles_fragmented_tool_json", async () => {
  const { provider } = await open(() => ({
    content: [
      {
        type: "tool_use" as const,
        id: "toolu_2",
        name: "get_balance",
        input: { wallet_id: "bank_default" },
      },
    ],
  }));
  const result = await provider.chatCompletion({ ...ask(), stream: true });
  expect(JSON.parse(result.toolCalls[0]!.function.arguments)).toEqual({
    wallet_id: "bank_default",
  });
});

test("anthropic_in_band_error_discards_the_partial_answer", async () => {
  const { provider } = await open(() => ({
    content: text("Partial answer"),
    streamErrorAfterFrames: 4,
  }));
  const reset = vi.fn();
  const failure = await provider
    .chatCompletion({ ...ask(), stream: true, onStreamReset: reset })
    .catch((error) => error);
  // The historical bug was a truncated answer reported as success.
  expect(failure).toBeInstanceOf(AllKeysFailedError);
  expect(failure.failures).toEqual([
    { nickname: "anthropic_byok", reason: "protocol_error" },
  ]);
  expect(reset).toHaveBeenCalled();
});

test("anthropic_http_failures_map_to_static_reasons_without_response_text", async () => {
  for (const [status, reason] of [
    [401, "unauthorized"],
    [403, "access_denied"],
    [429, "rate_limited"],
    [500, "provider_unavailable"],
    [503, "provider_unavailable"],
    [418, "provider_http_error"],
  ] as const) {
    const { provider } = await open(() => ({ status }));
    const failure = await provider
      .chatCompletion(ask())
      .catch((error) => error);
    expect(failure).toBeInstanceOf(AllKeysFailedError);
    expect(failure.failures).toEqual([{ nickname: "anthropic_byok", reason }]);
    // Nothing from the provider body leaks into the error.
    expect(JSON.stringify(failure.message)).not.toMatch(
      /synthetic|error|http/i,
    );
  }
});

test("anthropic_400_never_falls_back_and_never_retries", async () => {
  const { server, provider } = await open(() => ({ status: 400 }));
  await expect(provider.chatCompletion(ask())).rejects.toBeInstanceOf(
    BadRequestNoFallbackError,
  );
  expect(server.recordedRequests).toHaveLength(1);
});

test("anthropic_malformed_response_is_a_protocol_failure_not_a_200", async () => {
  // A 200 body that is not a message. The SDK reports this as an API call error
  // carrying HTTP 200, which must never be read as a successful HTTP response.
  const { provider } = await open(() => ({ rawBody: { hello: "world" } }));
  const failure = await provider.chatCompletion(ask()).catch((error) => error);
  expect(failure).toBeInstanceOf(AllKeysFailedError);
  expect(failure.failures[0].reason).toBe("protocol_error");
});

test("anthropic_empty_completion_is_never_returned_as_an_answer", async () => {
  const { provider } = await open(() => ({ content: text("") }));
  const failure = await provider.chatCompletion(ask()).catch((error) => error);
  expect(failure.failures).toEqual([
    { nickname: "anthropic_byok", reason: "protocol_error" },
  ]);
});

test("anthropic_rejects_unknown_tool_names_from_the_provider", async () => {
  const { provider } = await open(() => ({
    content: [
      {
        type: "tool_use" as const,
        id: "toolu_3",
        name: "Not A Tool",
        input: {},
      },
    ],
    stop_reason: "tool_use",
  }));
  const failure = await provider.chatCompletion(ask()).catch((error) => error);
  expect(failure.failures[0].reason).toBe("protocol_error");
});

test("anthropic_tolerates_thinking_blocks", async () => {
  const { provider } = await open(() => ({
    content: [
      {
        type: "thinking" as const,
        thinking: "private reasoning",
        signature: "sig_synthetic",
      },
      { type: "text" as const, text: "Answer" },
    ],
  }));
  const result = await provider.chatCompletion(ask());
  // Reasoning is not an answer; it is neither surfaced nor treated as failure.
  expect(result.content).toBe("Answer");
  expect(JSON.stringify(result)).not.toContain("private reasoning");
});

test("anthropic_sensitive_or_invalid_requests_never_reach_the_network", async () => {
  const { server, provider } = await open(() => ({ content: text("ok") }));
  await expect(
    provider.chatCompletion({
      messages: [{ role: "user", content: "my OTP is 123456" }],
    }),
  ).rejects.toThrow();
  await expect(
    provider.chatCompletion({ messages: [{ role: "tool", content: "{}" }] }),
  ).rejects.toThrow();
  expect(server.recordedRequests).toHaveLength(0);
});

test("anthropic_preflight_redacts_registered_counterparties", async () => {
  const redactor = new PrivacyRedactor();
  redactor.registerCounterparty("SynthPerson");
  const { server, provider } = await open(() => ({ content: text("ok") }), {
    redactor,
  });
  await provider.chatCompletion(ask("Did SynthPerson pay?"));
  expect(server.recordedRequests[0]!.rawBody).not.toContain("SynthPerson");
});

test("anthropic_missing_credential_fails_closed_without_a_request", async () => {
  const { server, provider } = await open(() => ({ content: text("ok") }), {
    key: null,
  });
  await expect(provider.chatCompletion(ask())).rejects.toThrow();
  expect(server.recordedRequests).toHaveLength(0);
});

test("anthropic_rejects_invalid_configuration", async () => {
  for (const key of ["", "has space", "bad\nnewline", "x".repeat(4097)]) {
    const { provider } = await open(() => ({ content: text("ok") }), { key });
    await expect(provider.chatCompletion(ask())).rejects.toThrow();
  }
  expect(() =>
    create_anthropic_provider(
      {
        id: "anthropic_byok",
        kind: "anthropic",
        credential_ref: "anthropic_api_key",
        default_model: "claude-sonnet-5-5",
        // The endpoint is pinned; a supplied one is a configuration mistake.
        base_url: "https://evil.invalid",
      },
      { resolve_credential: async () => "sk-ant-synthetic" },
    ),
  ).toThrow(/Invalid provider configuration/i);
  expect(() =>
    create_anthropic_provider(
      {
        id: "anthropic_byok",
        kind: "anthropic",
        credential_ref: "anthropic_api_key",
        default_model: "claude-sonnet-5-5",
      },
      { resolve_credential: async () => "k", timeout_ms: 0 },
    ),
  ).toThrow(/Invalid provider configuration/i);
});

test("anthropic_caller_cancellation_is_static_and_never_retried", async () => {
  const { server, provider } = await open(() => ({
    content: text("late"),
    delayMs: 50,
  }));
  const controller = new AbortController();
  const pending = provider.chatCompletion({
    ...ask(),
    signal: controller.signal,
  });
  controller.abort();
  const failure = await pending.catch((error) => error);
  expect(failure.name).toBe("AbortError");
  expect(failure.message).toBe("Provider request cancelled or timed out");
  expect(server.recordedRequests.length).toBeLessThanOrEqual(1);
});

test("anthropic_callback_errors_stop_cleanly_and_stay_static", async () => {
  const { server, provider } = await open(() => ({
    content: text("Streamed"),
  }));
  await expect(
    provider.chatCompletion({
      ...ask(),
      stream: true,
      onStreamDelta: () => {
        throw new Error("private_ui_error");
      },
    }),
  ).rejects.toThrow(/callback/i);
  expect(server.recordedRequests).toHaveLength(1);
});

test("anthropic_error_messages_never_contain_the_key_or_endpoint", async () => {
  const { provider } = await open(() => ({ status: 401 }));
  const failure = await provider.chatCompletion(ask()).catch((error) => error);
  const serialised = JSON.stringify({ message: failure.message, ...failure });
  expect(serialised).not.toContain("sk-ant-synthetic");
  expect(serialised).not.toContain("api.anthropic.com");
});

export type { RecordedAnthropicRequest };
