import { z } from "zod";
import type { PrivacyRedactor } from "@vittaz/core";
import type {
  ChatCompletionParams,
  ChatCompletionResult,
  CompletionClient,
} from "../../provider_client.js";
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
}

export type CredentialResolver = (
  credential_ref: string,
) => Promise<string | null>;

/** Everything an adapter needs that is not part of the configuration. */
export interface ProviderDependencies {
  readonly resolve_credential: CredentialResolver;
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

const provider_config_schema = z.strictObject({
  id: provider_id_schema,
  kind: z.enum(["anthropic", "openai_compatible"]),
  credential_ref: credential_ref_schema,
  base_url: base_url_schema.optional(),
  default_model: model_id_schema,
  key_nickname: provider_id_schema.optional(),
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
