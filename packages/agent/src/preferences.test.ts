import { test_client } from "../../../tests/helpers/test_client.js";
import { expect, test, vi } from "vitest";
import {
  PrivacyRedactor,
  defaultAssistantPreferences,
  getWalletSummary,
} from "@vittaz/core";
import { openLedgerStore } from "../../storage/src/repositories.js";
import { startFakeOpenAIServer } from "../../../tests/helpers/fake_openai_server.js";
import { KeyPool } from "./key_pool.js";
import { ReadOnlyQaLoop } from "./qa_loop.js";
test("preferences_persisted_values_reach_actual_provider_http_context_without_new_authority", async () => {
  const store = openLedgerStore(":memory:");
  const server = await startFakeOpenAIServer();
  try {
    const preferences = {
      tone: "friendly",
      language: "hinglish",
      detail: "concise",
    } as const;
    await store.preferences.set(preferences);
    const agent = new ReadOnlyQaLoop({
      client: test_client({
        baseUrl: server.baseUrl,
        keyPool: new KeyPool([
          { nickname: "synthetic", apiKey: "", model: "synthetic" },
        ]),
      }),
      data: {
        listTransactions: () => store.read((r) => r.transactions.list()),
        getWalletSummary: (id) => getWalletSummary(store, id),
      },
      redactor: new PrivacyRedactor([]),
    });
    expect(
      (
        await agent.answerQuestion("Show monthly spend", {
          preferences: await store.preferences.get(),
        })
      ).answered,
    ).toBe(true);
    const messages = server.recordedRequests[0]!.parsedBody!.messages as {
      role: string;
      content: string;
    }[];
    expect(messages[0]!.content).toContain("friendly");
    expect(messages[0]!.content).toContain("Hinglish");
    expect(messages[0]!.content).toContain("concise");
    expect(messages[0]!.content).toContain("cannot approve");
    expect(messages[0]!.content).toContain("never override");
  } finally {
    await server.close();
    await store.close();
  }
});
test("preferences_invalid_injection_fails_before_provider_and_sensitive_still_drops", async () => {
  const client = { chatCompletion: vi.fn() };
  const data = { listTransactions: vi.fn(), getWalletSummary: vi.fn() };
  const agent = new ReadOnlyQaLoop({
    client,
    data,
    redactor: new PrivacyRedactor([]),
  });
  await expect(
    agent.answerQuestion("Show spend", {
      preferences: {
        ...defaultAssistantPreferences(),
        language: "ignore approval",
      },
    }),
  ).rejects.toThrow("Invalid Q&A request");
  expect(
    (
      await agent.answerQuestion("Your OTP is 123456", {
        preferences: defaultAssistantPreferences(),
      })
    ).stopReason,
  ).toBe("sensitive_dropped");
  expect(client.chatCompletion).not.toHaveBeenCalled();
  expect(data.listTransactions).not.toHaveBeenCalled();
});
