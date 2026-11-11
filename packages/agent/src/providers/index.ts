/**
 * Vittaz-owned provider architecture.
 *
 * Layout:
 *   contracts/  provider configuration, capability metadata, normalized errors
 *   adapters/   thin wrappers over the existing `provider_client.ts` and
 *               `anthropic_messages_client.ts` transports
 *   registry/   explicit provider selection and model capability metadata
 *
 * No provider framework type crosses this boundary. The transports remain the
 * only authority for wire formats, HTTP classification and credentials.
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

export { create_anthropic_provider } from "./adapters/anthropic.js";
export { create_openai_compatible_provider } from "./adapters/openai_compatible.js";

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
