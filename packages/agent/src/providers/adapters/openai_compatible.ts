import type { ModelCapabilities } from "../contracts/capabilities.js";
import { capabilities_for_model } from "../registry/model_registry.js";
import {
  InvalidProviderConfigError,
  MissingCredentialError,
} from "../contracts/errors.js";
import {
  key_nickname_for,
  resolve_model,
  validate_provider_config,
} from "../contracts/provider.js";
import type {
  ProviderAdapter,
  ProviderConfig,
  ProviderDependencies,
} from "../contracts/provider.js";
import { KeyPool } from "../../key_pool.js";
import { OpenAICompatibleClient } from "../../provider_client.js";

/**
 * OpenAI-compatible adapter.
 *
 * This is a wrapper, not a transport. Base-URL policy, SSE parsing, zod
 * request/response validation, the key pool and its cooldown/disable policy,
 * HTTP error classification and cancellation all remain in
 * `OpenAICompatibleClient`.
 *
 * A configuration with an empty `credential_ref` is deliberately keyless; the
 * keyless Kilo Auto Free gateway is configured that way today.
 */
export function create_openai_compatible_provider(
  config: ProviderConfig,
  deps: ProviderDependencies,
  options: { model?: string } = {},
): ProviderAdapter {
  const validated = validate_provider_config(config);
  // Kind and endpoint presence are enforced by `validate_provider_config`.
  if (validated.kind !== "openai_compatible")
    throw new InvalidProviderConfigError();
  const model = resolve_model(validated, options.model);
  let client: OpenAICompatibleClient | undefined;

  async function resolve_client(): Promise<OpenAICompatibleClient> {
    if (client) return client;
    let api_key = "";
    if (validated.credential_ref) {
      const resolved = await deps.resolve_credential(validated.credential_ref);
      // Fail closed: never send an empty key for a configuration that expects one.
      if (!resolved) throw new MissingCredentialError();
      api_key = resolved;
    }
    try {
      client = new OpenAICompatibleClient({
        baseUrl: validated.base_url!,
        keyPool: new KeyPool([
          {
            nickname: key_nickname_for(validated),
            apiKey: api_key,
            provider: validated.kind,
            model,
          },
        ]),
        fetch: deps.fetch,
        timeoutMs: deps.timeout_ms,
        redactor: deps.redactor,
      });
    } catch {
      // The transport owns endpoint and key shape rules.
      throw new InvalidProviderConfigError();
    }
    return client;
  }

  return {
    id: validated.id,
    kind: "openai_compatible",
    model,
    capabilities: (): ModelCapabilities =>
      capabilities_for_model("openai_compatible", model),
    async chatCompletion(params) {
      return (await resolve_client()).chatCompletion(params);
    },
  };
}
