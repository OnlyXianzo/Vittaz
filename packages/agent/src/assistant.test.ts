import { afterEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrivacyRedactor, getWalletSummary } from "@vittaz/core";
import {
  openLedgerStore,
  openReadOnlyLedgerStore,
} from "../../storage/src/repositories.js";
import { startFakeOpenAIServer } from "../../../tests/helpers/fake_openai_server.js";
import { LangChainQaAgent } from "./langchain_adapter.js";
import { OpenAICompatibleClient } from "./provider_client.js";
import { KeyPool } from "./key_pool.js";
import { ValidatedLocalModelTasks } from "./local_tasks.js";
import { SharedAssistantService, createPendingDraft } from "./assistant.js";
const clean: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const f of clean.splice(0).reverse()) await f();
});
const origin = {
  source: "app",
  authenticated: true,
  paired_telegram: false,
} as const;
const request = (
  id = "req",
  action: "question" | "draft_entry" | "improve_note" = "question",
  text = "Show monthly spend",
) => ({ request_id: id, conversation_id: "chat", action, text });
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "vittaz_service_"));
  clean.push(async () => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "synthetic.sqlite");
  const writer = openLedgerStore(file);
  clean.push(() => writer.close());
  const reader = openReadOnlyLedgerStore(file);
  clean.push(() => reader.close());
  const server = await startFakeOpenAIServer();
  clean.push(() => server.close());
  const redactor = new PrivacyRedactor(["SynthPerson"]);
  const qa = new LangChainQaAgent({
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
  const runner = {
    run: vi.fn(async (task: string) =>
      task === "parse_entry"
        ? {
            draft: {
              amount_paise: 45000,
              direction: "debit",
              category: "food",
              counterparty_name: "SynthPerson",
              note: "local synthetic note",
              split_owed_paise: 0,
            },
          }
        : { improved_note: "A clearer local note" },
    ),
  };
  const local = new ValidatedLocalModelTasks(runner);
  const params = {
    ledger: writer,
    history: writer.history,
    preferences: writer.preferences,
    rules: writer.rules,
    qa,
    local,
    redactor,
  };
  return {
    writer,
    reader,
    server,
    runner,
    params,
    service: new SharedAssistantService(params),
  };
}
test("assistant_shared_sources_persist_history_and_send_filtered_recent_context_with_preferences", async () => {
  const f = await fixture();
  await f.writer.preferences.set({
    tone: "friendly",
    language: "hindi",
    detail: "concise",
  });
  for (const source of ["app", "cli", "telegram"] as const) {
    const result = await f.service.handle(request(source), {
      ...origin,
      source,
      paired_telegram: source === "telegram",
    });
    expect(result.status).toBe("answered");
  }
  expect(
    (await f.writer.history.listMessages("chat")).map((m) => m.source),
  ).toEqual(["app", "app", "cli", "cli", "telegram", "telegram"]);
  expect(f.server.recordedRequests).toHaveLength(3);
  expect(
    JSON.stringify(f.server.recordedRequests[2]!.parsedBody!.messages),
  ).toContain("untrusted_history");
  expect(
    JSON.stringify(f.server.recordedRequests[2]!.parsedBody!.messages),
  ).toContain("Hindi");
  expect(f.runner.run).not.toHaveBeenCalled();
});
test("assistant_drafts_are_pending_only_and_note_suggestions_never_write_ledger", async () => {
  const f = await fixture();
  const before = await f.writer.read((r) => r.transactions.list());
  const draft = await f.service.handle(
    request("draft", "draft_entry", "Paid450 to SynthPerson"),
    origin,
  );
  expect(draft.status).toBe("pending_proposal");
  expect(
    await f.writer.read((r) => r.proposals.get(draft.proposal_id!)),
  ).toMatchObject({
    status: "pending",
    committed_tx_id: null,
    counterparty_name: "SynthPerson",
    note: "local synthetic note",
  });
  expect(
    (
      await f.service.handle(
        request("note", "improve_note", "A local note"),
        origin,
      )
    ).status,
  ).toBe("note_suggestion");
  expect(await f.writer.read((r) => r.transactions.list())).toEqual(before);
  expect(f.server.recordedRequests).toHaveLength(0);
});
test("assistant_auth_sensitive_conditions_invalid_and_replay_make_no_model_or_unwanted_history", async () => {
  const f = await fixture();
  expect(
    (await f.service.handle(request(), { ...origin, source: "telegram" }))
      .status,
  ).toBe("rejected");
  expect(
    (await f.service.handle(request(), { ...origin, authenticated: false }))
      .status,
  ).toBe("rejected");
  expect(
    (
      await f.service.handle(
        request("secret", "question", "Your OTP is 123456"),
        origin,
      )
    ).status,
  ).toBe("sensitive_dropped");
  expect(await f.writer.history.listConversations()).toEqual([]);
  expect((await f.service.handle({}, origin)).status).toBe("invalid_request");
  await f.writer.rules.set([
    { kind: "message_condition", rule: "allowed_sources", sources: ["cli"] },
  ]);
  expect((await f.service.handle(request(), origin)).status).toBe("rejected");
  expect(await f.writer.history.listConversations()).toEqual([]);
  await f.writer.rules.set([]);
  expect((await f.service.handle(request(), origin)).status).toBe("answered");
  expect((await f.service.handle(request(), origin)).status).toBe(
    "unavailable",
  );
  expect(f.server.recordedRequests).toHaveLength(1);
  expect(f.runner.run).not.toHaveBeenCalled();
});

test("assistant_local_null_and_failed_or_unsafe_answers_fail_closed_without_cloud_fallback", async () => {
  const f = await fixture();
  const local = new ValidatedLocalModelTasks({
    run: async (task) =>
      task === "parse_entry" ? { draft: null } : { improved_note: null },
  });
  const s = new SharedAssistantService({ ...f.params, local });
  expect(
    (await s.handle(request("null_draft", "draft_entry"), origin)).status,
  ).toBe("not_understood");
  expect(
    (await s.handle(request("null_note", "improve_note"), origin)).status,
  ).toBe("not_understood");
  for (const [i, answer] of [
    null,
    "Your OTP is 123456",
    "x".repeat(8193),
  ].entries()) {
    const qa = {
      answerQuestion: async () => ({
        answered: true,
        answer,
        stepsUsed: 0,
        tokensUsed: 0,
        stopReason: "completed" as const,
      }),
    };
    const service = new SharedAssistantService({ ...f.params, qa });
    expect((await service.handle(request(`bad${i}`), origin)).status).toBe(
      "unavailable",
    );
  }
  expect(f.server.recordedRequests).toHaveLength(0);
  expect(await f.writer.read((r) => r.proposals.list())).toHaveLength(0);
});
test("assistant_abort_timeout_cpu_deadline_and_queue_recovery", async () => {
  const f = await fixture();
  const aborted = new AbortController();
  aborted.abort();
  expect(
    (await f.service.handle(request("pre"), origin, { signal: aborted.signal }))
      .status,
  ).toBe("aborted");
  const ctrl = new AbortController();
  const qa = {
    answerQuestion: async () => {
      ctrl.abort();
      throw new Error("synthetic_private");
    },
  };
  expect(
    (
      await new SharedAssistantService({ ...f.params, qa }).handle(
        request("mid"),
        origin,
        { signal: ctrl.signal },
      )
    ).status,
  ).toBe("aborted");
  let calls = 0;
  const rules = {
    get: async () => {
      if (calls++ === 0)
        await new Promise((resolve) => setTimeout(resolve, 25));
      return [];
    },
    set: f.writer.rules.set,
  };
  const service = new SharedAssistantService({ ...f.params, rules });
  expect(
    (await service.handle(request("late"), origin, { timeout_ms: 5 })).status,
  ).toBe("timeout");
  expect(
    (await service.handle(request("recovered"), origin, { timeout_ms: 1000 }))
      .status,
  ).toBe("answered");
  const blocked = {
    get: async () => {
      const start = performance.now();
      while (performance.now() - start < 10) {
        /* trusted synchronous work cannot be preempted */
      }
      return [];
    },
    set: f.writer.rules.set,
  };
  expect(
    (
      await new SharedAssistantService({ ...f.params, rules: blocked }).handle(
        request("cpu"),
        origin,
        { timeout_ms: 1 },
      )
    ).status,
  ).toBe("timeout");
  expect(
    (await f.writer.history.listMessages("chat")).map((m) => m.id),
  ).not.toContain("late_u");
});
test("assistant_recent_context_is_untrusted_redacted_and_sensitive_history_never_leaves", async () => {
  const f = await fixture();
  await f.writer.history.ensureConversation({
    id: "chat",
    created_at: "2026-11-05T00:00:00.000Z",
  });
  await f.writer.history.appendMessage({
    id: "old",
    conversation_id: "chat",
    source: "telegram",
    role: "assistant",
    content: "SynthPerson UPI Ref 630811112222 Account XX1234",
    created_at: "2026-11-05T00:00:00.000Z",
  });
  expect((await f.service.handle(request("context"), origin)).status).toBe(
    "answered",
  );
  const body = f.server.recordedRequests[0]!.rawBody;
  for (const raw of ["SynthPerson", "630811112222", "1234"])
    expect(body).not.toContain(raw);
  await f.params.qa.answerQuestion("Show spend", {
    history: [{ role: "user", content: "Your OTP is 123456" }],
  });
  expect(f.server.recordedRequests[1]!.rawBody).not.toContain("123456");
});

test("assistant_pending_guard_rolls_back_cancelled_writes_inside_the_native_queue", async () => {
  const f = await fixture();
  const draft = {
    amount_paise: 100,
    direction: "debit" as const,
    category: "food",
    counterparty_name: null,
    note: null,
    split_owed_paise: 0,
  };
  let checks = 0;
  await expect(
    createPendingDraft(f.writer, draft, f.params.redactor, () => {
      if (++checks === 2) throw new Error("synthetic_cancelled");
    }),
  ).rejects.toThrow("Tool execution failed");
  expect(await f.writer.read((r) => r.proposals.list())).toEqual([]);
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((r) => {
    entered = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const holding = f.writer.transaction(async () => {
    entered();
    await gate;
  });
  await ready;
  let cancelled = false;
  const queued = createPendingDraft(f.writer, draft, f.params.redactor, () => {
    if (cancelled) throw new Error("synthetic_cancelled");
  });
  const checked = expect(queued).rejects.toThrow("Tool execution failed");
  cancelled = true;
  release();
  await holding;
  await checked;
  expect(await f.writer.read((r) => r.proposals.list())).toEqual([]);
});
