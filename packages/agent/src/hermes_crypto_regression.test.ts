import { afterEach, expect, test } from "vitest";
import { startFakeOpenAIServer } from "../../../tests/helpers/fake_openai_server.js";
import { KeyPool } from "./key_pool.js";
import { OpenAICompatibleClient } from "./provider_client.js";
import { LangChainCompletionClient } from "./langchain_adapter.js";

/**
 * Hermes regression guard for the historical S36 "KILO_UNKNOWN" failure.
 *
 * Root cause (recorded in DECISIONS.md): `@langchain/core` mints a run id with
 * UUID v7, whose randomness comes from the global `crypto.getRandomValues`.
 * Hermes ships no Web Crypto global, so `BaseChatModel.invoke` threw before any
 * provider HTTP request and every question failed at the `provider_call` stage.
 * Node and jest-expo both provide a global `crypto`, which is why unit tests
 * stayed green while the device failed.
 *
 * These tests pin the two properties that must survive any provider migration:
 *   1. the transport that actually talks to providers does not need Web Crypto;
 *   2. if the framework layer loses the global anyway, the failure stays a
 *      classified diagnostic instead of an unclassified crash.
 */
const servers: Awaited<ReturnType<typeof startFakeOpenAIServer>>[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

async function open(responder?: Parameters<typeof startFakeOpenAIServer>[0]) {
  const server = await startFakeOpenAIServer(responder);
  servers.push(server);
  return server;
}

const messages = [
  { role: "user" as const, content: "Synthetic spending summary" },
];

function without_global_crypto<T>(run: () => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", {
    value: undefined,
    configurable: true,
    writable: true,
  });
  return run().finally(() => {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else Reflect.deleteProperty(globalThis, "crypto");
  });
}

test("hermes_no_web_crypto_transport_still_reaches_the_provider", async () => {
  const server = await open(() => ({ content: "Synthetic answer" }));
  const client = new OpenAICompatibleClient({
    baseUrl: server.baseUrl,
    keyPool: new KeyPool([{ nickname: "alpha", apiKey: "synthetic_alpha" }]),
  });
  const result = await without_global_crypto(() =>
    client.chatCompletion({ messages }),
  );
  expect(result).toMatchObject({
    content: "Synthetic answer",
    keyNickname: "alpha",
  });
  expect(server.recordedRequests).toHaveLength(1);
});

test("hermes_missing_web_crypto_in_framework_layer_stays_a_classified_failure", async () => {
  const server = await open(() => ({ content: "Synthetic answer" }));
  const client = new LangChainCompletionClient(
    new OpenAICompatibleClient({
      baseUrl: server.baseUrl,
      keyPool: new KeyPool([{ nickname: "alpha", apiKey: "synthetic_alpha" }]),
    }),
  );
  const events: { reason_code?: string; failure_stage?: string }[] = [];
  await expect(
    without_global_crypto(() =>
      client.chatCompletion({
        messages,
        onDiagnostic: (event) => events.push(event),
      }),
    ),
  ).rejects.toBeInstanceOf(Error);
  // Either the request succeeds outright (a future runtime that no longer needs
  // the global) or it fails with the codebook-only diagnostic that made the
  // device symptom explainable. An unclassified crash with no diagnostic fails.
  const failed = events.find(
    (event) =>
      event.reason_code !== undefined && event.failure_stage !== undefined,
  );
  expect(failed?.failure_stage).toBe("provider_call");
});
