import { afterEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PrivacyRedactor,
  checkSensitiveMessage,
  createManualTransaction,
  getWalletSummary,
  scrubOutboundText,
} from "@vittaz/core";
import {
  openLedgerStore,
  openReadOnlyLedgerStore,
} from "../../storage/src/repositories.js";
import { startFakeOpenAIServer } from "../../../tests/helpers/fake_openai_server.js";
import { SharedAssistantService } from "./assistant.js";
import { ReadOnlyQaLoop } from "./qa_loop.js";
import { OpenAICompatibleClient } from "./provider_client.js";
import { KeyPool } from "./key_pool.js";
import { ValidatedLocalModelTasks } from "./local_tasks.js";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

const origin = {
  source: "app",
  authenticated: true,
  paired_telegram: false,
} as const;

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "vittaz_privacy_boundary_"));
  cleanup.push(async () => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "synthetic.sqlite");
  const writer = openLedgerStore(file);
  cleanup.push(() => writer.close());
  const reader = openReadOnlyLedgerStore(file);
  cleanup.push(() => reader.close());
  const server = await startFakeOpenAIServer((request) =>
    request.index === 0
      ? {
          toolCalls: [
            {
              id: "synthetic_query",
              type: "function",
              function: { name: "query_transactions", arguments: "{}" },
            },
          ],
        }
      : { content: "Person_1 spent 45000 paise." },
  );
  cleanup.push(() => server.close());
  const redactor = new PrivacyRedactor(["SynthPerson"]);
  const local = new ValidatedLocalModelTasks({
    run: vi.fn(async () => null),
  });
  const qa = new ReadOnlyQaLoop({
    client: new OpenAICompatibleClient({
      baseUrl: server.baseUrl,
      keyPool: new KeyPool([{ nickname: "synthetic", apiKey: "" }]),
    }),
    data: {
      listTransactions: () => reader.read((r) => r.transactions.list()),
      getWalletSummary: (id) => getWalletSummary(reader, id),
    },
    redactor,
  });
  const service = new SharedAssistantService({
    ledger: writer,
    history: writer.history,
    preferences: writer.preferences,
    rules: writer.rules,
    qa,
    local,
    redactor,
  });
  return { writer, reader, server, service, redactor };
}

function assertSafeWire(rawBody: string) {
  expect(checkSensitiveMessage(rawBody).sensitive).toBe(false);
  expect(scrubOutboundText(rawBody)).toBe(rawBody);
  for (const marker of [
    "SynthPerson",
    "synthetic_local_note",
    "630811112222",
    "XX1234",
    "1234",
  ])
    expect(rawBody).not.toContain(marker);
}

test("privacy_provider_boundary_service_question_history_and_tool_roundtrip_are_filtered_redacted_scrubbed", async () => {
  const f = await fixture();
  await createManualTransaction(f.writer, {
    amountPaise: 45000,
    direction: "debit",
    counterpartyName: "SynthPerson",
    accountLast4: "1234",
    note: "synthetic_local_note UPI Ref 630811112222 Account XX1234",
  });
  await f.writer.history.ensureConversation({
    id: "chat",
    created_at: "2026-11-05T00:00:00.000Z",
  });
  await f.writer.history.appendMessage({
    id: "old",
    conversation_id: "chat",
    source: "telegram",
    role: "user",
    content: "SynthPerson UPI Ref 630811112222 Account XX1234",
    created_at: "2026-11-05T00:00:00.000Z",
  });
  const result = await f.service.handle(
    {
      request_id: "boundary",
      conversation_id: "chat",
      action: "question",
      text: "How much did SynthPerson spend? UPI Ref 630811112222 Account XX1234",
    },
    origin,
  );
  expect(result.status).toBe("answered");
  expect(f.server.recordedRequests.length).toBeGreaterThanOrEqual(2);
  for (const request of f.server.recordedRequests)
    assertSafeWire(request.rawBody);
  expect(f.server.recordedRequests[0]!.rawBody).toContain("Person_1");
  expect(f.server.recordedRequests[0]!.rawBody).toContain("untrusted_history");
  expect(f.server.recordedRequests[1]!.rawBody).toContain("tool");
});

test("privacy_provider_boundary_sensitive_question_and_sensitive_history_never_reach_transport", async () => {
  const f = await fixture();
  const before = f.server.recordedRequests.length;
  expect(
    (
      await f.service.handle(
        {
          request_id: "secret",
          conversation_id: "chat",
          action: "question",
          text: "Your OTP is 123456",
        },
        origin,
      )
    ).status,
  ).toBe("sensitive_dropped");
  expect(f.server.recordedRequests).toHaveLength(before);
  await f.writer.history.ensureConversation({
    id: "chat",
    created_at: "2026-11-05T00:00:00.000Z",
  });
  await expect(
    f.writer.history.appendMessage({
      id: "secret_old",
      conversation_id: "chat",
      source: "app",
      role: "user",
      content: "Your OTP is 123456",
      created_at: "2026-11-05T00:00:00.000Z",
    }),
  ).rejects.toThrow("Conversation history operation failed");
  // History persistence rejects sensitive content; direct QA options must also filter it.
  const qa = new ReadOnlyQaLoop({
    client: new OpenAICompatibleClient({
      baseUrl: f.server.baseUrl,
      keyPool: new KeyPool([{ nickname: "synthetic", apiKey: "" }]),
    }),
    data: {
      listTransactions: () => f.reader.read((r) => r.transactions.list()),
      getWalletSummary: (id) => getWalletSummary(f.reader, id),
    },
    redactor: f.redactor,
  });
  await qa.answerQuestion("Show spend", {
    history: [{ role: "user", content: "Your OTP is 123456" }],
  });
  const last = f.server.recordedRequests.at(-1)!;
  assertSafeWire(last.rawBody);
  expect(last.rawBody).not.toContain("123456");
});

test("privacy_provider_boundary_low_level_sensitive_wire_is_rejected_before_fetch", async () => {
  const transport = vi.fn();
  const client = new OpenAICompatibleClient({
    baseUrl: "https://example.invalid",
    keyPool: new KeyPool([{ nickname: "synthetic", apiKey: "" }]),
    fetch: transport as unknown as typeof fetch,
  });
  await expect(
    client.chatCompletion({
      messages: [{ role: "user", content: "Your OTP is 123456" }],
    }),
  ).rejects.toThrow("Sensitive provider input rejected");
  expect(transport).not.toHaveBeenCalled();
});
