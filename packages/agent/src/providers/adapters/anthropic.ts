import type { ModelCapabilities } from "../contracts/capabilities.js";
import { capabilities_for_model } from "../registry/model_registry.js";
import {
  InvalidProviderConfigError,
  MissingCredentialError,
} from "../contracts/errors.js";
import {
  resolve_model,
  validate_provider_config,
} from "../contracts/provider.js";
import type {
  ProviderAdapter,
  ProviderConfig,
  ProviderDependencies,
} from "../contracts/provider.js";
import { AnthropicMessagesClient } from "../../anthropic_messages_client.js";

/**
 * Anthropic adapter.
 *
 * This is a wrapper, not a transport. Authentication, the Messages API request
 * mapping, SSE state machine, zod response validation, HTTP error
 * classification and cancellation all remain in `AnthropicMessagesClient`.
 */
export function create_anthropic_provider(
  config: ProviderConfig,
  deps: ProviderDependencies,
  options: { model?: string } = {},
): ProviderAdapter {
  const validated = validate_provider_config(config);
  if (validated.kind !== "anthropic") throw new InvalidProviderConfigError();
  const model = resolve_model(validated, options.model);
  let client: AnthropicMessagesClient | undefined;

  async function resolve_client(): Promise<AnthropicMessagesClient> {
    if (client) return client;
    // Fail closed: Anthropic is never called without an API key.
    if (!validated.credential_ref) throw new MissingCredentialError();
    const api_key = await deps.resolve_credential(validated.credential_ref);
    if (!api_key) throw new MissingCredentialError();
    try {
      client = new AnthropicMessagesClient({
        apiKey: api_key,
        model,
        fetch: deps.fetch,
        timeoutMs: deps.timeout_ms,
        redactor: deps.redactor,
      });
    } catch {
      // The transport owns key shape rules; a rejection is a config problem.
      throw new InvalidProviderConfigError();
    }
    return client;
  }

  return {
    id: validated.id,
    kind: "anthropic",
    model,
    capabilities: (): ModelCapabilities =>
      capabilities_for_model("anthropic", model),
    async chatCompletion(params) {
      return (await resolve_client()).chatCompletion(params);
    },
  };
}
