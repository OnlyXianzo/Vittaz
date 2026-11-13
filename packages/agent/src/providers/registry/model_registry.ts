import {
  declare_capabilities,
  UNKNOWN_CAPABILITIES,
} from "../contracts/capabilities.js";
import type { ModelCapabilities } from "../contracts/capabilities.js";
import type { ProviderKind } from "../contracts/provider.js";

/**
 * Model capability registry.
 *
 * Nothing here is verified yet. Vittaz has never run a capability probe against
 * a live provider, so the shipped table is intentionally empty and every model
 * reports `"unknown"` for every capability. Filling this in requires a live,
 * opt-in probe run; guessing would violate the rule that an unverified
 * capability must not be reported as supported.
 *
 * Callers may supply their own verified table (tests, or a future probe
 * result) through `create_model_registry`.
 */
export type CapabilityTable = Readonly<
  Record<string, Readonly<Partial<ModelCapabilities>>>
>;

const key_for = (kind: ProviderKind, model: string) => `${kind}:${model}`;

export interface ModelRegistry {
  capabilities(kind: ProviderKind, model: string): ModelCapabilities;
  /** Number of models with at least one verified capability. */
  verified_count(): number;
}

export function create_model_registry(
  table: CapabilityTable = {},
): ModelRegistry {
  const entries = new Map<string, ModelCapabilities>();
  for (const [key, declared] of Object.entries(table))
    entries.set(key, declare_capabilities(declared));
  return {
    capabilities(kind, model) {
      const known = entries.get(key_for(kind, model));
      // Unknown stays unknown; a partial entry cannot imply the rest.
      return known ? { ...known } : { ...UNKNOWN_CAPABILITIES };
    },
    verified_count() {
      return entries.size;
    },
  };
}

const default_registry = create_model_registry({});

/** Capability metadata for a model, defaulting to fully unknown. */
export function capabilities_for_model(
  kind: ProviderKind,
  model: string,
): ModelCapabilities {
  return default_registry.capabilities(kind, model);
}

/** True only when a capability is positively verified. */
export function is_supported(
  state: ModelCapabilities[keyof ModelCapabilities],
) {
  return state === true;
}
