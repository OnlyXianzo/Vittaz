/**
 * Vittaz-owned provider architecture.
 *
 * Layout:
 *   contracts/  provider configuration, capability metadata, normalized errors
 *   adapters/   `ai_sdk.ts` speaks OpenAI-compatible wire formats through the
 *               Vercel AI SDK; `anthropic.ts` wraps the Anthropic Messages
 *               transport, which is a different protocol the SDK's
 *               openai-compatible package cannot serve
 *   registry/   explicit provider selection and model capability metadata
 *
 * No SDK type crosses this boundary: `ProviderAdapter` is exactly what the QA
 * loop already consumed. Vittaz keeps the preflight, key pool, error contract
 * and diagnostics; the SDK owns only wire encoding and SSE decoding.
 */
export {
  declare_capabilities,
  UNKNOWN_CAPABILITIES,
} from "./contracts/capabilities.js";
export type {
  CapabilityState,
  ModelCapabilities,
} from "./contracts/capabilities.js";

export {
  InvalidProviderConfigError,
  MissingCredentialError,
  normalize_failure_reason,
  ProviderNotConfiguredError,
} from "./contracts/errors.js";
export type { ProviderFailureReason } from "./contracts/errors.js";

export {
  key_nickname_for,
  resolve_model,
  validate_provider_config,
} from "./contracts/provider.js";
export type {
  CredentialResolver,
  ProviderAdapter,
  ProviderConfig,
  ProviderDependencies,
  ProviderKind,
} from "./contracts/provider.js";

export {
  ANTHROPIC_API_VERSION,
  ANTHROPIC_DEFAULT_MODEL,
  ANTHROPIC_MESSAGES_URL,
  create_anthropic_provider,
} from "./adapters/anthropic.js";
export { create_ai_sdk_provider } from "./adapters/ai_sdk.js";

export { ProviderRegistry } from "./registry/provider_registry.js";
export type { RegistryOptions } from "./registry/provider_registry.js";
export {
  capabilities_for_model,
  create_model_registry,
  is_supported,
} from "./registry/model_registry.js";
export type {
  CapabilityTable,
  ModelRegistry,
} from "./registry/model_registry.js";
