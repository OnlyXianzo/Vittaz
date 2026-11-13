import { afterEach, expect, test, vi } from "vitest";
import { PrivacyRedactor } from "@vittaz/core";
import { startFakeOpenAIServer } from "../../../../tests/helpers/fake_openai_server.js";
import { AllKeysFailedError, BadRequestNoFallbackError } from "../key_pool.js";
import { create_anthropic_provider } from "./adapters/anthropic.js";
import { create_ai_sdk_provider } from "./adapters/ai_sdk.js";
import {
  declare_capabilities,
  UNKNOWN_CAPABILITIES,
} from "./contracts/capabilities.js";
import {
  has_forbidden_characters,
  InvalidProviderConfigError,
  MissingCredentialError,
  normalize_failure_reason,
  ProviderNotConfiguredError,
  type ProviderFailureReason,
} from "./contracts/errors.js";
import {
  key_nickname_for,
  resolve_model,
  validate_provider_config,
} from "./contracts/provider.js";
import { ProviderRegistry } from "./registry/provider_registry.js";
import {
  capabilities_for_model,
  create_model_registry,
  is_supported,
} from "./registry/model_registry.js";

const servers: Awaited<ReturnType<typeof startFakeOpenAIServer>>[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});
async function open(responder?: Parameters<typeof startFakeOpenAIServer>[0]) {
  const server = await startFakeOpenAIServer(responder);
  servers.push(server);
  return server;
}

const messages = [{ role: "user" as const, content: "Synthetic question" }];

const openai_config = (overrides: Record<string, unknown> = {}) => ({
  id: "work_laptop",
  kind: "openai_compatible" as const,
  credential_ref: "openai_compatible_api_key",
  base_url: "https://synthetic.invalid/v1",
  default_model: "synthetic-model",
  ...overrides,
});

test("capabilities_are_unknown_by_default_and_partial_knowledge_is_not_widened", () => {
  expect(capabilities_for_model("openai_compatible", "any-model")).toEqual(
    UNKNOWN_CAPABILITIES,
  );
  expect(declare_capabilities({ streaming: true })).toEqual({
    streaming: true,
    tool_calling: "unknown",
    structured_output: "unknown",
    max_context_tokens: null,
  });
  expect(is_supported("unknown")).toBe(false);
  expect(is_supported(true)).toBe(true);

  const registry = create_model_registry({
    "anthropic:claude-known": { tool_calling: true, structured_output: false },
  });
  expect(registry.capabilities("anthropic", "claude-known")).toEqual({
    streaming: "unknown",
    tool_calling: true,
    structured_output: false,
    max_context_tokens: null,
  });
  // A model is not assumed to share another model's capabilities.
  expect(registry.capabilities("anthropic", "claude-other")).toEqual(
    UNKNOWN_CAPABILITIES,
  );
  // The same model id under another provider is a different entry.
  expect(registry.capabilities("openai_compatible", "claude-known")).toEqual(
    UNKNOWN_CAPABILITIES,
  );
  expect(registry.verified_count()).toBe(1);
});

test("config_rejects_unknown_kind_missing_endpoint_and_unstable_ids", () => {
  expect(() => validate_provider_config({})).toThrow(
    InvalidProviderConfigError,
  );
  expect(() =>
    validate_provider_config({ ...openai_config(), kind: "google" }),
  ).toThrow(InvalidProviderConfigError);
  expect(() =>
    validate_provider_config(openai_config({ base_url: undefined })),
  ).toThrow(InvalidProviderConfigError);
  expect(() =>
    validate_provider_config(openai_config({ id: "Not Stable" })),
  ).toThrow(InvalidProviderConfigError);
  expect(() =>
    validate_provider_config(openai_config({ default_model: "bad model\n" })),
  ).toThrow(InvalidProviderConfigError);
  // A raw key is never a configuration field.
  expect(() =>
    validate_provider_config({ ...openai_config(), api_key: "sk-synthetic" }),
  ).toThrow(InvalidProviderConfigError);
  // Anthropic needs no endpoint.
  expect(
    validate_provider_config({
      id: "personal_anthropic",
      kind: "anthropic",
      credential_ref: "anthropic_api_key",
      default_model: "claude-synthetic",
    }),
  ).toMatchObject({ kind: "anthropic" });
});

test("model_and_nickname_resolution_prefer_explicit_values", () => {
  const config = validate_provider_config(openai_config());
  expect(resolve_model(config)).toBe("synthetic-model");
  expect(resolve_model(config, "selected-model")).toBe("selected-model");
  expect(key_nickname_for(config)).toBe("work_laptop");
  expect(key_nickname_for({ ...config, key_nickname: "k" })).toBe("k");
  expect(() => resolve_model(config, "bad model")).toThrow(
    InvalidProviderConfigError,
  );
});

test("openai_compatible_adapter_sends_the_configured_endpoint_key_and_model", async () => {
  const server = await open(() => ({ content: "Synthetic answer" }));
  const provider = create_ai_sdk_provider(openai_config(), {
    resolve_credential: async () => "synthetic_key_value",
    base_url: server.baseUrl,
    redactor: new PrivacyRedactor([]),
  } as never);
  // The endpoint comes from configuration, not from the dependency bag.
  const configured = create_ai_sdk_provider(
    openai_config({ base_url: server.baseUrl }),
    { resolve_credential: async () => "synthetic_key_value" },
    { model: "synthetic-model" },
  );
  const answer = await configured.chatCompletion({ messages });
  expect(answer).toMatchObject({ content: "Synthetic answer" });
  expect(server.recordedRequests[0]).toMatchObject({
    apiKey: "synthetic_key_value",
    parsedBody: expect.objectContaining({ model: "synthetic-model" }),
  });
  expect(provider.id).toBe("work_laptop");
  expect(provider.kind).toBe("openai_compatible");
});

test("openai_compatible_adapter_is_keyless_only_when_no_reference_is_configured", async () => {
  const server = await open(() => ({ content: "Synthetic answer" }));
  const keyless = create_ai_sdk_provider(
    openai_config({ credential_ref: "", base_url: server.baseUrl }),
    { resolve_credential: async () => "should_never_be_read" },
  );
  await keyless.chatCompletion({ messages });
  expect(server.recordedRequests[0]!.apiKey).toBeNull();

  const resolve = vi.fn(async () => null);
  const missing = create_ai_sdk_provider(
    openai_config({ base_url: server.baseUrl }),
    { resolve_credential: resolve },
  );
  server.clearRequests();
  await expect(missing.chatCompletion({ messages })).rejects.toBeInstanceOf(
    MissingCredentialError,
  );
  // Fail closed: no request is sent without the configured credential.
  expect(server.recordedRequests).toHaveLength(0);
});

test("openai_compatible_adapter_maps_http_and_protocol_failures_to_existing_categories", async () => {
  const cases: [number, ProviderFailureReason][] = [
    [401, "unauthorized"],
    [403, "access_denied"],
    [429, "rate_limited"],
    [500, "provider_unavailable"],
    [418, "provider_http_error"],
  ];
  for (const [status, reason] of cases) {
    const server = await open(() => ({ status }));
    const provider = create_ai_sdk_provider(
      openai_config({ base_url: server.baseUrl }),
      { resolve_credential: async () => "synthetic_key_value" },
    );
    const failure = await provider
      .chatCompletion({ messages })
      .catch((error) => error);
    expect(failure).toBeInstanceOf(AllKeysFailedError);
    expect((failure as AllKeysFailedError).failures).toEqual([
      { nickname: "work_laptop", reason },
    ]);
    expect(normalize_failure_reason(reason)).toBe(reason);
  }

  const malformed = await open(() => ({ wireChunks: ["data: {oops}\n\n"] }));
  const provider = create_ai_sdk_provider(
    openai_config({ base_url: malformed.baseUrl }),
    { resolve_credential: async () => "synthetic_key_value" },
  );
  const failure = await provider
    .chatCompletion({ messages, stream: true })
    .catch((error) => error);
  expect((failure as AllKeysFailedError).failures[0]!.reason).toBe(
    "protocol_error",
  );

  const bad = await open(() => ({ status: 400 }));
  const rejects = create_ai_sdk_provider(
    openai_config({ base_url: bad.baseUrl }),
    { resolve_credential: async () => "synthetic_key_value" },
  );
  await expect(rejects.chatCompletion({ messages })).rejects.toBeInstanceOf(
    BadRequestNoFallbackError,
  );
});

test("anthropic_adapter_fails_closed_and_uses_the_existing_messages_transport", async () => {
  const config = {
    id: "personal_anthropic",
    kind: "anthropic" as const,
    credential_ref: "anthropic_api_key",
    default_model: "claude-synthetic",
  };

  const resolve = vi.fn(async () => null);
  const missing = create_anthropic_provider(config, {
    resolve_credential: resolve,
  });
  await expect(missing.chatCompletion({ messages })).rejects.toBeInstanceOf(
    MissingCredentialError,
  );
  expect(resolve).toHaveBeenCalledTimes(1);

  // No credential reference at all: never even consulted.
  const empty = vi.fn(async () => "synthetic_key_value");
  const keyless_anthropic = create_anthropic_provider(
    { ...config, credential_ref: "" },
    { resolve_credential: empty },
  );
  await expect(
    keyless_anthropic.chatCompletion({ messages }),
  ).rejects.toBeInstanceOf(MissingCredentialError);
  expect(empty).not.toHaveBeenCalled();

  // An unusable key shape is a configuration error, not a silent send.
  const invalid = create_anthropic_provider(config, {
    resolve_credential: async () => "has whitespace",
  });
  await expect(invalid.chatCompletion({ messages })).rejects.toBeInstanceOf(
    InvalidProviderConfigError,
  );

  expect(missing.id).toBe("personal_anthropic");
  expect(missing.model).toBe("claude-synthetic");
  expect(missing.capabilities()).toEqual(UNKNOWN_CAPABILITIES);
});

test("provider_registry_never_falls_back_and_cannot_guess_the_active_account", async () => {
  const server = await open(() => ({ content: "Synthetic answer" }));
  const deps = { resolve_credential: async () => "synthetic_key_value" };
  const configs = [
    openai_config({ id: "primary", base_url: server.baseUrl }),
    openai_config({ id: "secondary", base_url: server.baseUrl }),
  ];

  const registry = new ProviderRegistry(configs, deps);
  // Several configurations, none selected: asking for the active one must fail.
  expect(registry.active_id).toBeUndefined();
  expect(() => registry.active()).toThrow(ProviderNotConfiguredError);
  expect(server.recordedRequests).toHaveLength(0);

  registry.select("secondary");
  expect(registry.active_id).toBe("secondary");
  expect(registry.active().id).toBe("secondary");
  expect(() => registry.select("unknown_account")).toThrow(
    ProviderNotConfiguredError,
  );
  // Selection is unchanged by a rejected request.
  expect(registry.active_id).toBe("secondary");

  // A single configuration is unambiguous and needs no explicit selection.
  const single = new ProviderRegistry([configs[0]!], deps);
  expect(single.active().id).toBe("primary");

  expect(registry.list().map((config) => config.id)).toEqual([
    "primary",
    "secondary",
  ]);
  expect(registry.capabilities("primary")).toEqual(UNKNOWN_CAPABILITIES);
});

test("provider_registry_rejects_duplicate_ids_and_empty_configuration", () => {
  const deps = { resolve_credential: async () => "k" };
  expect(() => new ProviderRegistry([], deps)).toThrow(
    InvalidProviderConfigError,
  );
  expect(
    () =>
      new ProviderRegistry(
        [openai_config({ id: "same" }), openai_config({ id: "same" })],
        deps,
      ),
  ).toThrow(InvalidProviderConfigError);
  expect(
    () => new ProviderRegistry([openai_config({ id: "bad id" })], deps),
  ).toThrow(InvalidProviderConfigError);
});

test("provider_registry_applies_per_configuration_and_active_model_overrides", async () => {
  const server = await open(() => ({ content: "Synthetic answer" }));
  const deps = { resolve_credential: async () => "synthetic_key_value" };
  const registry = new ProviderRegistry(
    [openai_config({ id: "primary", base_url: server.baseUrl })],
    deps,
    { active_model: "override-model" },
  );
  await registry.active().chatCompletion({ messages });
  expect(server.recordedRequests[0]!.parsedBody).toMatchObject({
    model: "override-model",
  });

  const per_config = new ProviderRegistry(
    [openai_config({ id: "primary", base_url: server.baseUrl })],
    deps,
    { models: { primary: "mapped-model" } },
  );
  await per_config.adapter("primary").chatCompletion({ messages });
  expect(server.recordedRequests[1]!.parsedBody).toMatchObject({
    model: "mapped-model",
  });
});

test("adapters_reject_a_config_of_the_wrong_kind_and_close_credential_gaps", async () => {
  // An unsafe endpoint is rejected when the adapter is built, before any
  // request can be attempted. Stronger than the previous transport, which only
  // rejected it on first use.
  for (const base_url of [
    "http://plaintext.example/v1", // https is required outside loopback
    "https://user:pass@host.example/v1", // no embedded credentials
    "https://host.example/v1?x=1", // no query string
    "https://host.example/v1#frag", // no fragment
    "not-a-url",
  ])
    expect(() =>
      create_ai_sdk_provider(openai_config({ base_url }), {
        resolve_credential: async () => "synthetic_key_value",
      }),
    ).toThrow(InvalidProviderConfigError);
  // Loopback over http stays allowed for local model servers.
  expect(() =>
    create_ai_sdk_provider(
      openai_config({ base_url: "http://127.0.0.1:11434/v1" }),
      { resolve_credential: async () => "synthetic_key_value" },
    ),
  ).not.toThrow();

  // A kind mismatch is caught when the adapter is built, before any request.
  expect(() =>
    create_ai_sdk_provider(
      { ...openai_config(), kind: "anthropic" as never },
      { resolve_credential: async () => "synthetic_key_value" },
    ),
  ).toThrow(InvalidProviderConfigError);
  expect(() =>
    create_anthropic_provider(
      { ...openai_config(), kind: "openai_compatible" as never },
      { resolve_credential: async () => "synthetic_key_value" },
    ),
  ).toThrow(InvalidProviderConfigError);
});

test("credential_references_reject_whitespace_and_control_characters", () => {
  const base = {
    id: "primary",
    kind: "openai_compatible" as const,
    base_url: "https://synthetic.invalid/v1",
    default_model: "synthetic-model",
  };
  for (const credential_ref of [
    "has space",
    "tab\there",
    "nul\u0000here",
    "del\u007fhere",
  ]) {
    expect(() => validate_provider_config({ ...base, credential_ref })).toThrow(
      InvalidProviderConfigError,
    );
  }
  for (const base_url of [
    "https://syn thetic.invalid",
    "https://x.invalid/\u0001",
  ]) {
    expect(() =>
      validate_provider_config({
        ...base,
        credential_ref: "openai_compatible_api_key",
        base_url,
      }),
    ).toThrow(InvalidProviderConfigError);
  }
  expect(has_forbidden_characters("plain_ref-1")).toBe(false);
  expect(has_forbidden_characters("nl\nref")).toBe(true);
});

test("registry_adapter_by_id_uses_the_default_model_and_never_the_active_one", async () => {
  const server = await open(() => ({ content: "Synthetic answer" }));
  const deps = { resolve_credential: async () => "synthetic_key_value" };
  const registry = new ProviderRegistry(
    [
      openai_config({ id: "primary", base_url: server.baseUrl }),
      openai_config({
        id: "secondary",
        base_url: server.baseUrl,
        default_model: "secondary-model",
      }),
    ],
    deps,
    { active_model: "override-model" },
  );
  registry.select("primary");
  await registry.active().chatCompletion({ messages });
  await registry.adapter("secondary").chatCompletion({ messages });
  expect(server.recordedRequests[0]!.parsedBody).toMatchObject({
    model: "override-model",
  });
  expect(server.recordedRequests[1]!.parsedBody).toMatchObject({
    model: "secondary-model",
  });
  expect(() => registry.adapter("missing")).toThrow(ProviderNotConfiguredError);
  expect(registry.active_id).toBe("primary");
});

test("anthropic_adapter_runs_the_real_messages_transport_end_to_end", async () => {
  const calls: { url: string; headers: Headers; body: unknown }[] = [];
  const provider = create_anthropic_provider(
    {
      id: "personal_anthropic",
      kind: "anthropic",
      credential_ref: "anthropic_api_key",
      default_model: "claude-synthetic",
    },
    {
      resolve_credential: async () => "synthetic_key_value",
      redactor: new PrivacyRedactor([]),
      fetch: async (input, init) => {
        calls.push({
          url: String(input),
          headers: new Headers(init?.headers),
          body: JSON.parse(String(init?.body)),
        });
        return new Response(
          JSON.stringify({
            id: "msg_synthetic",
            type: "message",
            role: "assistant",
            model: "claude-synthetic",
            stop_reason: "end_turn",
            content: [{ type: "text", text: "Synthetic answer" }],
            usage: { input_tokens: 10, output_tokens: 10 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  );

  const answer = await provider.chatCompletion({ messages });
  expect(answer).toMatchObject({
    content: "Synthetic answer",
    toolCalls: [],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
  expect(calls[0]!.headers.get("x-api-key")).toBe("synthetic_key_value");
  expect(calls[0]!.body).toMatchObject({ model: "claude-synthetic" });
  // The client is built once and reused; a second call reuses the transport.
  await provider.chatCompletion({ messages });
  expect(calls).toHaveLength(2);
});

test("capabilities_are_reported_per_adapter_and_never_inferred_from_success", async () => {
  const server = await open(() => ({ content: "Synthetic answer" }));
  const provider = create_ai_sdk_provider(
    openai_config({ base_url: server.baseUrl }),
    { resolve_credential: async () => "synthetic_key_value" },
  );
  // A successful request does not promote unknown capabilities to supported.
  await provider.chatCompletion({ messages });
  expect(provider.capabilities()).toEqual(UNKNOWN_CAPABILITIES);
  expect(provider.model).toBe("synthetic-model");

  const anthropic = create_anthropic_provider(
    {
      id: "personal_anthropic",
      kind: "anthropic",
      credential_ref: "anthropic_api_key",
      default_model: "claude-synthetic",
    },
    { resolve_credential: async () => "synthetic_key_value" },
  );
  expect(anthropic.capabilities()).toEqual(UNKNOWN_CAPABILITIES);
});

test("registry_builds_an_anthropic_adapter_without_touching_credentials", () => {
  const resolve = vi.fn(async () => "synthetic_key_value");
  const registry = new ProviderRegistry(
    [
      {
        id: "personal_anthropic",
        kind: "anthropic",
        credential_ref: "anthropic_api_key",
        default_model: "claude-synthetic",
      },
    ],
    { resolve_credential: resolve },
  );
  const adapter = registry.active();
  expect(adapter.kind).toBe("anthropic");
  expect(adapter.model).toBe("claude-synthetic");
  expect(adapter.capabilities()).toEqual(UNKNOWN_CAPABILITIES);
  // Building and introspecting an adapter never reads the secure store.
  expect(resolve).not.toHaveBeenCalled();
});
