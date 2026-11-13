import { test_client } from "../../../tests/helpers/test_client.js";
import { afterEach, expect, test } from "vitest";
import { PrivacyRedactor, getWalletSummary } from "@vittaz/core";
import { startFakeOpenAIServer } from "../../../tests/helpers/fake_openai_server.js";
import { KeyPool } from "./key_pool.js";
import { ReadOnlyQaLoop } from "./qa_loop.js";
import { create_ai_sdk_provider } from "./providers/adapters/ai_sdk.js";
import { openLedgerStore } from "../../storage/src/repositories.js";

/**
 * Hermes regression guard for the historical S36 "KILO_UNKNOWN" failure.
 *
 * Root cause (recorded in DECISIONS.md): the removed LangChain decorator minted
 * a UUID v7 run id through the global `crypto.getRandomValues` before any
 * provider request, and Hermes ships no Web Crypto global. Every question then
 * failed at the `provider_call` stage. Node and jest-expo both provide a global
 * `crypto`, which is why unit tests stayed green while the device failed.
 *
 * The decorator is gone, but the invariant must outlive it: no layer between the
 * assistant and the transport may reintroduce a Web Crypto dependency. These
 * tests pin that with `globalThis.crypto` removed.
 */
const servers: Awaited<ReturnType<typeof startFakeOpenAIServer>>[] = [];
const stores: ReturnType<typeof openLedgerStore>[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const store of stores.splice(0)) store.close();
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
  const client = test_client({
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

test("hermes_no_web_crypto_provider_contract_path_answers_without_an_unclassified_failure", async () => {
  const server = await open(() => ({ content: "Synthetic answer" }));
  const store = openLedgerStore(":memory:");
  stores.push(store);
  const provider = create_ai_sdk_provider(
    {
      id: "hermes_check",
      kind: "openai_compatible",
      credential_ref: "synthetic_alpha",
      base_url: server.baseUrl,
      default_model: "synthetic-model",
    },
    {
      resolve_credential: async () => "synthetic_alpha",
      redactor: new PrivacyRedactor([]),
    },
  );
  const events: { reason_code?: string; failure_stage?: string }[] = [];
  const result = await without_global_crypto(() =>
    new ReadOnlyQaLoop({
      client: provider,
      redactor: new PrivacyRedactor([]),
      onDiagnostic: (event) => events.push(event),
      data: {
        listTransactions: () =>
          store.read((repos) => repos.transactions.list()),
        getWalletSummary: (wallet_id) => getWalletSummary(store, wallet_id),
      },
    }).answerQuestion("Show monthly spend"),
  );

  expect(result.answered).toBe(true);
  expect(result.stopReason).toBe("completed");
  expect(server.recordedRequests).toHaveLength(1);
  // Nothing on this path may report an unclassified catch-all failure, which is
  // what the device symptom surfaced, and no diagnostic may carry exception text.
  expect(
    events.some(
      (event) =>
        event.reason_code === "provider_error" ||
        event.reason_code === "callback_error",
    ),
  ).toBe(false);
  expect(JSON.stringify(events)).not.toContain("Synthetic answer");
});
