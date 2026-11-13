import { afterEach, expect, test } from "vitest";
import { PrivacyRedactor } from "@vittaz/core";
import { startFakeOpenAIServer } from "../../../tests/helpers/fake_openai_server.js";
import {
  AllKeysFailedError,
  BadRequestNoFallbackError,
  KeyPool,
} from "./key_pool.js";
import { validateCompletionRequest } from "./provider_client.js";
import { test_client } from "../../../tests/helpers/test_client.js";

/**
 * Transport guarantees, now exercised through the Vercel AI SDK adapter that
 * replaced `OpenAICompatibleClient`. Every assertion here was previously made
 * against the hand-written client and still holds; the ones that could not hold
 * are marked with the reason.
 */
const servers: Awaited<ReturnType<typeof startFakeOpenAIServer>>[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});
async function open(
  responder?: Parameters<typeof startFakeOpenAIServer>[0],
  keys: { nickname: string; apiKey: string; model?: string }[] = [
    { nickname: "alpha", apiKey: "synthetic_key" },
  ],
) {
  const server = await startFakeOpenAIServer(responder);
  servers.push(server);
  return {
    server,
    client: test_client({
      baseUrl: server.baseUrl,
      keyPool: new KeyPool(keys),
    }),
  };
}
const ask = (content = "Synthetic question") => ({
  messages: [{ role: "user" as const, content }],
});

test("transport_400_never_falls_back_and_adds_no_retries", async () => {
  const { server, client } = await open(
    () => ({ status: 400 }),
    [
      { nickname: "alpha", apiKey: "synthetic_key" },
      { nickname: "bravo", apiKey: "synthetic_key_two" },
    ],
  );
  await expect(client.chatCompletion(ask())).rejects.toBeInstanceOf(
    BadRequestNoFallbackError,
  );
  // One request, and not the second key: the SDK's default retries are off.
  expect(server.recordedRequests).toHaveLength(1);
});

test("transport_401_disables_the_key_and_switches_to_the_next", async () => {
  const { server, client } = await open(
    (request) =>
      request.apiKey === "synthetic_key"
        ? { status: 401 }
        : { content: "Second key answered" },
    [
      { nickname: "alpha", apiKey: "synthetic_key" },
      { nickname: "bravo", apiKey: "synthetic_key_two" },
    ],
  );
  const result = await client.chatCompletion(ask());
  expect(result.content).toBe("Second key answered");
  expect(result.keyNickname).toBe("bravo");
  expect(server.recordedRequests).toHaveLength(2);
});

test("transport_429_exhausts_all_keys_with_the_existing_reason", async () => {
  const { client } = await open(() => ({ status: 429 }));
  const failure = await client.chatCompletion(ask()).catch((error) => error);
  expect(failure.name).toBe("AllKeysFailedError");
  expect(failure.failures).toEqual([
    { nickname: "alpha", reason: "rate_limited" },
  ]);
});

test("transport_classifies_http_statuses_into_the_eight_known_reasons", async () => {
  for (const [status, reason] of [
    [401, "unauthorized"],
    [403, "access_denied"],
    [429, "rate_limited"],
    [500, "provider_unavailable"],
    [418, "provider_http_error"],
  ] as const) {
    const { client } = await open(() => ({ status }));
    const failure = await client.chatCompletion(ask()).catch((error) => error);
    expect(failure.name).toBe("AllKeysFailedError");
    expect(failure.failures[0].reason).toBe(reason);
  }
});

test("transport_keyless_configuration_sends_no_authorization_header", async () => {
  const { server, client } = await open(
    () => ({ content: "Keyless answer" }),
    [{ nickname: "keyless_free", apiKey: "" }],
  );
  const result = await client.chatCompletion(ask());
  expect(result.content).toBe("Keyless answer");
  expect(server.recordedRequests[0]!.apiKey).toBeNull();
});

test("transport_streams_text_and_usage_over_sse", async () => {
  const { client } = await open(() => ({ content: "Streamed answer" }));
  const deltas: string[] = [];
  const result = await client.chatCompletion({
    ...ask(),
    stream: true,
    onStreamDelta: (delta) => deltas.push(delta),
  });
  expect(result.content).toBe("Streamed answer");
  expect(result.usage.total_tokens).toBeGreaterThan(0);
  expect(deltas.join("")).toBe("Streamed answer");
});

test("transport_returns_tool_calls_with_parsed_arguments", async () => {
  const { client } = await open(() => ({
    toolCalls: [
      {
        type: "function",
        function: { name: "query_transactions", arguments: '{"limit":2}' },
      },
    ],
  }));
  const result = await client.chatCompletion(ask());
  expect(result.content).toBe("");
  expect(result.toolCalls).toHaveLength(1);
  expect(result.toolCalls[0]!.function.name).toBe("query_transactions");
  expect(JSON.parse(result.toolCalls[0]!.function.arguments)).toEqual({
    limit: 2,
  });
});

test("transport_in_band_sse_error_never_becomes_an_empty_success", async () => {
  const { client } = await open(() => ({
    wireChunks: ['data: {"error":{"message":"synthetic failure"}}\n\n'],
  }));
  const failure = await client
    .chatCompletion({ ...ask(), stream: true })
    .catch((error) => error);
  // The single most important mapping in this adapter: the SDK resolves an
  // in-band error with empty text and finishReason "error". Reporting that as
  // success is the historical KILO_UNKNOWN symptom.
  expect(failure.name).toBe("AllKeysFailedError");
  expect(failure.failures[0].reason).toBe("protocol_error");
});

test("transport_cancellation_is_static_and_tries_no_other_key", async () => {
  const { server, client } = await open(
    () => ({ status: 200, content: "never seen", delayMs: 2000 }),
    [
      { nickname: "alpha", apiKey: "synthetic_key" },
      { nickname: "bravo", apiKey: "synthetic_key_two" },
    ],
  );
  const controller = new AbortController();
  const pending = client.chatCompletion({
    ...ask(),
    signal: controller.signal,
  });
  controller.abort();
  const failure = await pending.catch((error) => error);
  expect(failure.name).toBe("AbortError");
  expect(failure.message).toBe("Provider request cancelled or timed out");
  expect(server.recordedRequests.length).toBeLessThanOrEqual(1);
});

test("transport_sensitive_or_invalid_requests_never_reach_the_network", async () => {
  const { server, client } = await open(() => ({ content: "unused" }));
  await expect(
    client.chatCompletion(
      ask("my card number is 4111 1111 1111 1111 and cvv 123"),
    ),
  ).rejects.toBeTruthy();
  await expect(
    client.chatCompletion({ messages: [] as never }),
  ).rejects.toBeTruthy();
  await expect(
    client.chatCompletion({
      ...ask(),
      maxCompletionTokens: 99999,
    }),
  ).rejects.toBeTruthy();
  expect(server.recordedRequests).toHaveLength(0);
});

test("preflight_redacts_outbound_names_and_enforces_the_body_limit", () => {
  const redactor = new PrivacyRedactor(["SynthPerson"]);
  const { wire } = validateCompletionRequest(
    {
      messages: [{ role: "user", content: "How much did SynthPerson spend?" }],
    },
    redactor,
  );
  expect(JSON.stringify(wire)).not.toContain("SynthPerson");

  const huge = "x".repeat(70000);
  expect(() =>
    validateCompletionRequest({ messages: [{ role: "user", content: huge }] }),
  ).toThrow();
});

test("transport_never_leaks_the_key_or_the_endpoint_through_errors", async () => {
  const { client } = await open(() => ({ status: 401 }));
  const failure = await client.chatCompletion(ask()).catch((error) => error);
  const serialized = JSON.stringify({
    name: failure.name,
    message: failure.message,
    failures: failure.failures,
  });
  expect(serialized).not.toContain("synthetic_key");
  expect(serialized).not.toContain("http");
});

// Ported from the deleted `provider_client.test.ts`: these two guarantees live in
// Vittaz code (the key pool and the callback boundary), not in the SDK, so they
// must keep a test even though the transport underneath changed.
test("transport_empty_key_pool_reports_a_static_exhaustion_reason", async () => {
  const events: unknown[] = [];
  const pool = new KeyPool([{ nickname: "alpha", apiKey: "synthetic_key" }]);
  pool.markUnauthorized("alpha");
  const client = test_client({
    baseUrl: "https://example.invalid",
    keyPool: pool,
  });
  await expect(
    client.chatCompletion({
      ...ask(),
      onDiagnostic: (event) => events.push(event),
    }),
  ).rejects.toBeInstanceOf(AllKeysFailedError);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event_code: "provider_failure_classified",
        source: "provider_protocol",
        outcome: "failed",
        reason_code: "provider_error",
      }),
    ]),
  );
  expect(JSON.stringify(events)).not.toMatch(
    /synthetic_alpha|synthetic_key|prompt|api_key|stack/i,
  );
});

test("transport_callback_errors_stop_without_retry_and_stay_static", async () => {
  const { server, client } = await open(() => ({ content: "Synthetic" }));
  await expect(
    client.chatCompletion({
      ...ask(),
      stream: true,
      onStreamDelta: () => {
        throw new Error("private_ui_error");
      },
    }),
  ).rejects.toThrow(/callback/i);
  expect(server.recordedRequests).toHaveLength(1);
});

// App attribution (`X-Title` / `HTTP-Referer`) is opt-in per configuration.
// It exists because OpenRouter files unattributed traffic under "Unknown", and
// it is never inferred from the hostname: that would be a provider-specific
// branch and would fingerprint every request to every endpoint.
test("transport_sends_attribution_headers_only_when_configured", async () => {
  const server = await startFakeOpenAIServer(() => ({ content: "Synthetic" }));
  servers.push(server);
  const provider = await import("./providers/adapters/ai_sdk.js");
  const config = {
    id: "or",
    kind: "openai_compatible" as const,
    credential_ref: "OPENROUTER_KEY",
    base_url: server.baseUrl,
    default_model: "synthetic/model",
  };
  const deps = { resolve_credential: async () => "synthetic_key" };

  // Unset: the wire must be byte-identical to before this option existed.
  await provider.create_ai_sdk_provider(config, deps).chatCompletion(ask());
  expect(server.recordedRequests[0]!.headers["x-title"]).toBeUndefined();
  expect(server.recordedRequests[0]!.headers["http-referer"]).toBeUndefined();

  // Configured: both reach the wire.
  await provider
    .create_ai_sdk_provider(
      {
        ...config,
        attribution: { title: "Vittaz", referer: "https://vittaz.example" },
      },
      deps,
    )
    .chatCompletion(ask());
  const sent = server.recordedRequests[1]!.headers;
  expect(sent["x-title"]).toBe("Vittaz");
  expect(sent["http-referer"]).toBe("https://vittaz.example");

  // Title without a referer is allowed; the header is simply omitted.
  await provider
    .create_ai_sdk_provider(
      { ...config, attribution: { title: "Vittaz" } },
      deps,
    )
    .chatCompletion(ask());
  expect(server.recordedRequests[2]!.headers["x-title"]).toBe("Vittaz");
  expect(server.recordedRequests[2]!.headers["http-referer"]).toBeUndefined();
});

test("attribution_rejects_unsafe_values", async () => {
  const provider = await import("./providers/adapters/ai_sdk.js");
  const base = {
    id: "or",
    kind: "openai_compatible" as const,
    credential_ref: "OPENROUTER_KEY",
    base_url: "https://openrouter.ai/api",
    default_model: "synthetic/model",
  };
  const deps = { resolve_credential: async () => "synthetic_key" };
  for (const attribution of [
    { title: "" },
    { title: "x".repeat(81) },
    { title: "bad\nheader" },
    { title: "Vittaz", referer: "not-a-url" },
    { title: "Vittaz", referer: "ftp://example.invalid" },
  ])
    expect(() =>
      provider.create_ai_sdk_provider({ ...base, attribution }, deps),
    ).toThrow(/Invalid provider configuration/i);
});

// "OpenAI-compatible" servers disagree about the API path. These three tests
// pin that the path is configuration, not a hard-coded `/v1`.
test("transport_defaults_to_the_v1_api_path", async () => {
  const server = await startFakeOpenAIServer(() => ({ content: "Synthetic" }));
  servers.push(server);
  const provider = await import("./providers/adapters/ai_sdk.js");
  await provider
    .create_ai_sdk_provider(
      {
        id: "p",
        kind: "openai_compatible",
        credential_ref: "K",
        base_url: server.baseUrl,
        default_model: "synthetic/model",
      },
      { resolve_credential: async () => "synthetic_key" },
    )
    .chatCompletion(ask());
  expect(server.recordedRequests[0]!.path).toBe("/v1/chat/completions");
});

test("transport_honours_a_configured_api_path", async () => {
  const server = await startFakeOpenAIServer(() => ({ content: "Synthetic" }));
  servers.push(server);
  const provider = await import("./providers/adapters/ai_sdk.js");
  const deps = { resolve_credential: async () => "synthetic_key" };
  const base = {
    id: "p",
    kind: "openai_compatible" as const,
    credential_ref: "K",
    base_url: server.baseUrl,
    default_model: "synthetic/model",
  };
  // Gemini's compatibility layer, and a server with no version segment.
  await provider
    .create_ai_sdk_provider({ ...base, api_suffix: "/v1beta/openai" }, deps)
    .chatCompletion(ask());
  expect(server.recordedRequests[0]!.path).toBe(
    "/v1beta/openai/chat/completions",
  );
  await provider
    .create_ai_sdk_provider({ ...base, api_suffix: "" }, deps)
    .chatCompletion(ask());
  expect(server.recordedRequests[1]!.path).toBe("/chat/completions");
});

test("transport_places_the_key_in_the_configured_auth_header", async () => {
  const server = await startFakeOpenAIServer(() => ({ content: "Synthetic" }));
  servers.push(server);
  const provider = await import("./providers/adapters/ai_sdk.js");
  const base = {
    id: "p",
    kind: "openai_compatible" as const,
    credential_ref: "K",
    base_url: server.baseUrl,
    default_model: "synthetic/model",
  };
  const deps = { resolve_credential: async () => "synthetic_key" };
  // Bare key in a provider-specific header, and a scheme-prefixed variant.
  await provider
    .create_ai_sdk_provider(
      { ...base, auth: { header: "x-goog-api-key" } },
      deps,
    )
    .chatCompletion(ask());
  expect(server.recordedRequests[0]!.headers["x-goog-api-key"]).toBe(
    "synthetic_key",
  );
  expect(server.recordedRequests[0]!.headers["authorization"]).toBeUndefined();
  await provider
    .create_ai_sdk_provider(
      { ...base, auth: { header: "api-key", scheme: "" } },
      deps,
    )
    .chatCompletion(ask());
  expect(server.recordedRequests[1]!.headers["api-key"]).toBe("synthetic_key");
  expect(server.recordedRequests[1]!.headers["authorization"]).toBeUndefined();
});

test("transport_sends_configured_extra_headers_only", async () => {
  const server = await startFakeOpenAIServer(() => ({ content: "Synthetic" }));
  servers.push(server);
  const provider = await import("./providers/adapters/ai_sdk.js");
  const base = {
    id: "p",
    kind: "openai_compatible" as const,
    credential_ref: "K",
    base_url: server.baseUrl,
    default_model: "synthetic/model",
  };
  const deps = { resolve_credential: async () => "synthetic_key" };
  await provider
    .create_ai_sdk_provider(
      { ...base, extra_headers: { "anthropic-version": "2026-10-21" } },
      deps,
    )
    .chatCompletion(ask());
  expect(server.recordedRequests[0]!.headers["anthropic-version"]).toBe(
    "2026-10-21",
  );
  // Credentials can never be smuggled through `extra_headers`.
  expect(() =>
    provider.create_ai_sdk_provider(
      { ...base, extra_headers: { authorization: "Bearer stolen" } },
      deps,
    ),
  ).toThrow(/Invalid provider configuration/i);
});

test("transport_rejects_unsafe_api_paths_and_auth_overrides", async () => {
  const provider = await import("./providers/adapters/ai_sdk.js");
  const base = {
    id: "p",
    kind: "openai_compatible" as const,
    credential_ref: "K",
    base_url: "https://example.invalid",
    default_model: "synthetic/model",
  };
  const deps = { resolve_credential: async () => "synthetic_key" };
  for (const api_suffix of ["v1", "/../admin", "/v1?x=1", "/v1#f", "/a b"])
    expect(() =>
      provider.create_ai_sdk_provider({ ...base, api_suffix }, deps),
    ).toThrow(/Invalid provider configuration/i);
  expect(() =>
    provider.create_ai_sdk_provider(
      { ...base, auth: { header: "cookie" as never } },
      deps,
    ),
  ).toThrow(/Invalid provider configuration/i);
});
