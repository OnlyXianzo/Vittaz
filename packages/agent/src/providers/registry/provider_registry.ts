import type { ModelCapabilities } from "../contracts/capabilities.js";
import {
  InvalidProviderConfigError,
  ProviderNotConfiguredError,
} from "../contracts/errors.js";
import { validate_provider_config } from "../contracts/provider.js";
import type {
  ProviderAdapter,
  ProviderConfig,
  ProviderDependencies,
} from "../contracts/provider.js";
import { create_anthropic_provider } from "../adapters/anthropic.js";
import { create_openai_compatible_provider } from "../adapters/openai_compatible.js";
import { capabilities_for_model } from "./model_registry.js";

export interface RegistryOptions {
  /** Model override per configuration id. Absent entries use the default model. */
  readonly models?: Readonly<Record<string, string>>;
  /** Model selected for the active configuration. */
  readonly active_model?: string;
}

function create_adapter(
  config: ProviderConfig,
  deps: ProviderDependencies,
  model: string | undefined,
): ProviderAdapter {
  return config.kind === "anthropic"
    ? create_anthropic_provider(config, deps, { model })
    : create_openai_compatible_provider(config, deps, { model });
}

/**
 * Holds every configured provider account/endpoint for the process and exposes
 * exactly one active adapter at a time.
 *
 * There is no implicit fallback anywhere in this class. `active()` either
 * returns the explicitly selected configuration or throws; it never substitutes
 * another account, endpoint or model because a request failed.
 */
export class ProviderRegistry {
  readonly #configs: readonly ProviderConfig[];
  readonly #deps: ProviderDependencies;
  readonly #options: RegistryOptions;
  /** Per-configuration model overrides, normalised once so lookups stay total. */
  readonly #models: Readonly<Record<string, string>>;
  #active_id: string | undefined;

  constructor(
    configs: readonly ProviderConfig[],
    deps: ProviderDependencies,
    options: RegistryOptions = {},
  ) {
    if (!Array.isArray(configs) || configs.length === 0)
      throw new InvalidProviderConfigError();
    const validated = configs.map((config) => validate_provider_config(config));
    if (new Set(validated.map((config) => config.id)).size !== validated.length)
      throw new InvalidProviderConfigError();
    this.#configs = validated;
    this.#deps = deps;
    this.#options = options;
    this.#models = options.models ?? {};
    // A single configured provider is unambiguous. With several, the caller
    // must select explicitly; guessing would be silent provider selection.
    this.#active_id = validated.length === 1 ? validated[0]!.id : undefined;
  }

  /** All configurations, in registration order. Safe to render or persist. */
  list(): readonly ProviderConfig[] {
    return this.#configs.map((config) => ({ ...config }));
  }

  /** The explicitly selected configuration id, if any. */
  get active_id(): string | undefined {
    return this.#active_id;
  }

  /** Explicit selection only. */
  select(id: string): void {
    if (!this.#configs.some((config) => config.id === id))
      throw new ProviderNotConfiguredError();
    this.#active_id = id;
  }

  #config(id: string): ProviderConfig {
    const config = this.#configs.find((entry) => entry.id === id);
    if (!config) throw new ProviderNotConfiguredError();
    return config;
  }

  /** Adapter for a specific configuration, regardless of the active selection. */
  adapter(id: string): ProviderAdapter {
    const config = this.#config(id);
    return create_adapter(
      config,
      this.#deps,
      this.#models[id] ?? config.default_model,
    );
  }

  /** The active adapter. Throws rather than falling back. */
  active(): ProviderAdapter {
    if (!this.#active_id) throw new ProviderNotConfiguredError();
    const model = this.#options.active_model ?? this.#models[this.#active_id];
    return create_adapter(this.#config(this.#active_id), this.#deps, model);
  }

  /** Capability metadata for a configuration without touching credentials. */
  capabilities(id: string, model?: string): ModelCapabilities {
    const config = this.#config(id);
    return capabilities_for_model(
      config.kind,
      model ?? this.#models[id] ?? config.default_model,
    );
  }
}
