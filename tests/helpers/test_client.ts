import { PrivacyRedactor } from "@vittaz/core";
import { create_ai_sdk_provider } from "../../packages/agent/src/providers/adapters/ai_sdk.js";
import type { KeyPool } from "../../packages/agent/src/key_pool.js";

/**
 * Test-only client factory with the same call shape the deleted
 * `OpenAICompatibleClient` constructor had, so existing suites keep driving the
 * real transport through the SDK adapter without rewriting their setup.
 *
 * The key pool is passed through as-is: multi-key rotation and cooldown remain
 * the pool's responsibility, exactly as before.
 */
export function test_client(params: {
  baseUrl: string;
  keyPool: KeyPool;
  fetch?: typeof fetch;
  timeoutMs?: number;
  redactor?: PrivacyRedactor;
}) {
  const model =
    params.keyPool.getStatusSnapshot()[0]?.model ?? "synthetic-model";
  return create_ai_sdk_provider(
    {
      id: "test_client",
      kind: "openai_compatible",
      credential_ref: "",
      base_url: params.baseUrl,
      default_model: model,
    },
    {
      resolve_credential: async () => null,
      key_pool: params.keyPool,
      ...(params.fetch ? { fetch: params.fetch } : {}),
      ...(params.timeoutMs !== undefined
        ? { timeout_ms: params.timeoutMs }
        : {}),
      ...(params.redactor ? { redactor: params.redactor } : {}),
    },
  );
}
