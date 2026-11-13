import { z } from "zod";
import type { PrivacyRedactor } from "@vittaz/core";
import type {
  ChatCompletionParams,
  ChatCompletionResult,
  CompletionClient,
} from "../../provider_client.js";
import type { KeyPool } from "../../key_pool.js";
import type { ModelCapabilities } from "./capabilities.js";
import {
  credential_ref_schema,
  has_forbidden_characters,
  InvalidProviderConfigError,
  model_id_schema,
  provider_id_schema,
} from "./errors.js";

/**
 * Provider kinds Vittaz can talk to.
 *
 * Both are served by transports that already exist in this package. A new kind
 * becomes a new adapter around a transport, not a rewrite of the QA loop.
 */
export type ProviderKind = "anthropic" | "openai_compatible";

/**
 * Ordinary provider configuration.
 *
 * It holds a *reference* to a credential, never the credential. This object is
 * safe to persist, render and log, which is what lets configuration live in
 * ordinary storage while keys stay in platform secure storage.
 */
export interface ProviderConfig {
  /** Stable, user-visible id. Also usable as a key-pool nickname. */
  readonly id: string;
  readonly kind: ProviderKind;
  /**
   * Secure-storage reference for the API key. The empty string means the
   * endpoint is deliberately keyless (the keyless Kilo Auto Free gateway).
   */
  readonly credential_ref: string;
  /** Required for `openai_compatible`; validated strictly by the transport. */
  readonly base_url?: string;
  readonly default_model: string;
  /** Optional key-pool nickname override; defaults to `id`. */
  readonly key_nickname?: string;
  /**
   * Opt-in app-attribution headers. Absent means no attribution headers are
   * sent at all; see `attribution_schema` for why this is never inferred.
   */
  readonly attribution?: ProviderAttribution;
  /** API path appended to `base_url`; defaults to `/v1`. */
  readonly api_suffix?: string;
  /** How the key is presented on the wire; defaults to `Authorization: Bearer`. */
  readonly auth?: ProviderAuth;
  /** Static extra request headers (API versions etc.). Never credentials. */
  readonly extra_headers?: Readonly<Record<string, string>>;
}

/** Wire format for the credential. Carries no provider identity. */
export interface ProviderAuth {
  readonly header?:
    "authorization" | "api-key" | "x-api-key" | "x-goog-api-key";
  readonly scheme?: string;
}

/** App name and optional app URL for gateway dashboards. Never user data. */
export interface ProviderAttribution {
  readonly title: string;
  readonly referer?: string;
}

export type CredentialResolver = (
  credential_ref: string,
) => Promise<string | null>;

/** Everything an adapter needs that is not part of the configuration. */
export interface ProviderDependencies {
  readonly resolve_credential: CredentialResolver;
  /**
   * Optional pre-built key pool. When supplied it is authoritative and
   * `resolve_credential` is not consulted, so multi-key rotation and cooldown
   * stay exactly the key pool's business. Mobile and CLI pass a single key via
   * `credential_ref` instead.
   */
  readonly key_pool?: KeyPool;
  readonly fetch?: typeof fetch;
  readonly timeout_ms?: number;
  readonly redactor?: PrivacyRedactor;
}

/**
 * The provider contract the assistant executes against.
 *
 * It extends the existing `CompletionClient` so the QA loop keeps receiving
 * exactly the request/result types it already validates; there is no parallel
 * request shape and no framework type in this surface.
 */
export interface ProviderAdapter extends CompletionClient {
  readonly id: string;
  readonly kind: ProviderKind;
  /** Model this adapter instance was built for. */
  readonly model: string;
  capabilities(): ModelCapabilities;
}

const base_url_schema = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => !has_forbidden_characters(value));

/**
 * Optional app-attribution headers (`X-Title`, `HTTP-Referer`).
 *
 * Some gateways — OpenRouter is the documented one — name the calling app in
 * their dashboards from these two headers; without them every request is filed
 * under "Unknown". They are **opt-in and per configuration**, deliberately not
 * auto-detected from the hostname: inferring them would mean a provider-specific
 * branch, and it would silently fingerprint every request to every endpoint.
 *
 * Neither value may identify a person. `title` is the app name; `referer` is a
 * public URL that the owner of the deployment controls, never a user or device
 * identifier.
 */
const attribution_schema = z.strictObject({
  title: z
    .string()
    .min(1)
    .max(80)
    .refine((value) => !has_forbidden_characters(value)),
  // A public https URL that the deployment owner controls. Rejected otherwise:
  // a referer is shown in a third party's dashboard, so a typo or a
  // user-identifying URL must fail loudly rather than be sent.
  referer: base_url_schema
    .refine((value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    })
    .optional(),
});

/**
 * The API path the transport appends to `base_url`.
 *
 * Default `/v1` matches OpenAI and most gateways. It is configurable because
 * "OpenAI-compatible" servers genuinely disagree here: Gemini's compatibility
 * layer lives under `/v1beta/openai`, Azure has no `/v1` at all, and some
 * self-hosted servers expose `/chat/completions` at the root. Hard-coding `/v1`
 * silently produced 404s for those, which looked like a broken key.
 */
const api_suffix_schema = z
  .string()
  .max(64)
  .refine(
    (value) =>
      (value === "" || value.startsWith("/")) &&
      !value.includes("..") &&
      !/[?#\s]/.test(value) &&
      !has_forbidden_characters(value),
  );

/**
 * How the key is presented on the wire.
 *
 * Most servers want `Authorization: Bearer <key>`. Some want the key in a bare
 * header instead (`api-key` for Azure, `x-goog-api-key` for Google's native
 * API). This is a *format* choice, not a provider branch: nothing here knows
 * the provider's name.
 */
const auth_schema = z.strictObject({
  header: z
    .enum(["authorization", "api-key", "x-api-key", "x-goog-api-key"])
    .optional(),
  /** Empty string means the bare key with no scheme. */
  scheme: z
    .string()
    .max(32)
    .refine((value) => !has_forbidden_characters(value))
    .optional(),
});

/** Static extra headers, e.g. a required API version. Never credentials. */
const extra_headers_schema = z
  .record(
    z.string().min(1).max(64),
    z
      .string()
      .max(512)
      .refine((value) => !has_forbidden_characters(value)),
  )
  .refine((value) => Object.keys(value).length <= 8)
  .refine((value) =>
    Object.keys(value).every((key) => {
      const name = key.toLowerCase();
      return (
        !has_forbidden_characters(key) &&
        // Credentials and transport framing can never come from configuration.
        ![
          "authorization",
          "api-key",
          "x-api-key",
          "x-goog-api-key",
          "host",
          "content-length",
          "content-type",
          "user-agent",
        ].includes(name)
      );
    }),
  );

const provider_config_schema = z.strictObject({
  id: provider_id_schema,
  kind: z.enum(["anthropic", "openai_compatible"]),
  credential_ref: credential_ref_schema,
  base_url: base_url_schema.optional(),
  default_model: model_id_schema,
  key_nickname: provider_id_schema.optional(),
  attribution: attribution_schema.optional(),
  /** Defaults to `/v1`. `""` means the base URL is already complete. */
  api_suffix: api_suffix_schema.optional(),
  auth: auth_schema.optional(),
  extra_headers: extra_headers_schema.optional(),
});

/**
 * Validates configuration shape only. Endpoint and key *content* rules stay in
 * the transports (`OpenAICompatibleClient`, `AnthropicMessagesClient`) so there
 * is exactly one authority for them.
 */
export function validate_provider_config(value: unknown): ProviderConfig {
  const parsed = provider_config_schema.safeParse(value);
  if (!parsed.success) throw new InvalidProviderConfigError();
  if (parsed.data.kind === "openai_compatible" && !parsed.data.base_url)
    throw new InvalidProviderConfigError();
  return parsed.data;
}

/** Key-pool nickname for a configuration; explicit values win. */
export function key_nickname_for(config: ProviderConfig): string {
  return config.key_nickname ?? config.id;
}

/**
 * `base_url` as validation proved it.
 *
 * `validate_provider_config` rejects an `openai_compatible` config without a
 * base URL, but the type still allows `undefined`. Call sites use this rather
 * than inventing a `?? ""` fallback no real request could reach.
 */
export function require_base_url(config: ProviderConfig): string {
  if (!config.base_url) throw new InvalidProviderConfigError();
  return config.base_url;
}

/** The model an adapter should use: explicit selection, else the default. */
export function resolve_model(
  config: ProviderConfig,
  selected?: string,
): string {
  const model = selected ?? config.default_model;
  if (!model_id_schema.safeParse(model).success)
    throw new InvalidProviderConfigError();
  return model;
}

export type { ChatCompletionParams, ChatCompletionResult };
