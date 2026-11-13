import { afterEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PrivacyRedactor,
  createManualTransaction,
  getWalletSummary,
} from "@vittaz/core";
import {
  openLedgerStore,
  openReadOnlyLedgerStore,
} from "../../storage/src/repositories.js";
import { startFakeOpenAIServer } from "../../../tests/helpers/fake_openai_server.js";
import { AllKeysFailedError, BadRequestNoFallbackError } from "./key_pool.js";
import { ReadOnlyQaLoop } from "./qa_loop.js";
import {
  create_ai_sdk_provider,
  normalize_failure_reason,
} from "./providers/index.js";

/**
 * Behavioural equivalence for the assistant execution path after the LangChain
 * decorator was removed.
 *
 * These assertions used to live in `langchain_adapter.test.ts` and ran through
 * the `BaseChatModel` wrapper. The wrapper was a pass-through, so the same
 * guarantees are now asserted against the real path: `ProviderAdapter` →
 * transport → `fetch` → `ReadOnlyQaLoop`. Nothing was relaxed; cases whose only
 * subject was LangChain's own callback/ambient-context machinery are gone
 * because that surface no longer exists.
 */
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
});

const result = {
  content: "Synthetic reply",
  toolCalls: [],
  usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  keyNickname: "synthetic",
};
const request = {
  messages: [{ role: "user" as const, content: "Synthetic question" }],
};

function provider_for(base_url: string, api_key = "synthetic_key") {
  return create_ai_sdk_provider(
    {
      id: "pipeline_check",
      kind: "openai_compatible",
      credential_ref: api_key,
      base_url,
      default_model: "synthetic-model",
    },
    {
      resolve_credential: async () => api_key,
      redactor: new PrivacyRedactor([]),
    },
  );
}

test("pipeline_actual_http_and_readonly_sqlite_loop_preserve_projections_and_financial_state", async () => {
  const directory = mkdtempSync(join(tmpdir(), "vittaz_pipeline_"));
  cleanup.push(() => rmSync(directory, { force: true, recursive: true }));
  const filename = join(directory, "ledger.sqlite");
  const writer = openLedgerStore(filename);
  cleanup.push(() => writer.close());
  await createManualTransaction(writer, {
    amountPaise: 1234,
    direction: "debit",
    category: "food",
    counterpartyName: "SynthPerson",
    note: "synthetic_private_note",
  });
  const reader = openReadOnlyLedgerStore(filename);
  cleanup.push(() => reader.close());
  const before = await writer.exportSnapshot();
  const server = await startFakeOpenAIServer((r) =>
    r.index === 0
      ? {
          toolCalls: [
            {
              type: "function",
              function: { name: "query_transactions", arguments: "{}" },
            },
          ],
        }
      : { content: "Person_1 spent 1234 paise" },
  );
  cleanup.push(() => server.close());

  const agent = new ReadOnlyQaLoop({
    client: provider_for(server.baseUrl),
    redactor: new PrivacyRedactor(["SynthPerson"]),
    data: {
      listTransactions: () => reader.read((r) => r.transactions.list()),
      getWalletSummary: (id) => getWalletSummary(reader, id),
    },
  });

  expect(
    await agent.answerQuestion("How much did SynthPerson spend?"),
  ).toMatchObject({
    answered: true,
    answer: "SynthPerson spent 1234 paise",
    stepsUsed: 2,
  });

  const wire = JSON.stringify(server.recordedRequests.map((r) => r.parsedBody));
  expect(wire).toContain("1234");
  expect(wire).not.toContain("SynthPerson");
  expect(wire).not.toContain("synthetic_private_note");
  expect(wire).not.toContain("propose_transaction");
  // The assistant never writes: the ledger snapshot is byte-identical.
  expect(await writer.exportSnapshot()).toEqual(before);
});

test("pipeline_adapter_adds_no_retries_and_preserves_400_and_exhausted_keys", async () => {
  const server = await startFakeOpenAIServer(() => ({ status: 400 }));
  cleanup.push(() => server.close());
  const provider = provider_for(server.baseUrl);

  await expect(provider.chatCompletion(request)).rejects.toBeInstanceOf(
    BadRequestNoFallbackError,
  );
  expect(server.recordedRequests).toHaveLength(1);

  server.clearRequests();
  server.setResponder(() => ({ status: 429 }));
  await expect(provider.chatCompletion(request)).rejects.toMatchObject({
    name: "AllKeysFailedError",
  });
  // A single configured key is never retried or swapped by the adapter.
  expect(server.recordedRequests).toHaveLength(1);
});

test("pipeline_keeps_system_and_tool_protocol_wire_exact_and_never_caches", async () => {
  const calls: unknown[] = [];
  const provider = create_ai_sdk_provider(
    {
      id: "wire_check",
      kind: "openai_compatible",
      credential_ref: "synthetic_key",
      base_url: "https://synthetic.invalid/v1",
      default_model: "synthetic-model",
    },
    {
      resolve_credential: async () => "synthetic_key",
      fetch: async (_input, init) => {
        calls.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  );
  const messages = [
    { role: "developer" as const, content: "Synthetic instruction" },
    {
      role: "assistant" as const,
      content: null,
      tool_calls: [
        {
          id: "synthetic_call",
          type: "function" as const,
          function: { name: "get_balance", arguments: "{}" },
        },
      ],
    },
    { role: "tool" as const, content: "{}", tool_call_id: "synthetic_call" },
  ];

  await provider.chatCompletion({ messages, maxCompletionTokens: 50 });
  await provider.chatCompletion({ messages, maxCompletionTokens: 50 });
  expect(calls).toHaveLength(2);
  // Deliberate wire change with the SDK: `developer` (and `system`) text is
  // carried as a system message the SDK is allowed to send, because this SDK
  // version rejects those roles inside `messages`. The text is preserved
  // verbatim, and the assistant tool call plus the tool result still travel as
  // protocol messages rather than being flattened into prose.
  const body = calls[0] as {
    messages: { role: string; content: unknown }[];
    max_tokens?: number;
    max_completion_tokens?: number;
  };
  const wire = JSON.stringify(body.messages);
  expect(wire).toContain("Synthetic instruction");
  expect(wire).toContain("synthetic_call");
  expect(wire).toContain("get_balance");
  expect(body.messages.some((m) => m.role === "developer")).toBe(false);
  expect(
    body.messages.some(
      (m) => m.role === "system" && m.content === "Synthetic instruction",
    ),
  ).toBe(true);
  expect(body.max_tokens ?? body.max_completion_tokens).toBe(50);
  // Identical input produces an identical request: nothing is cached.
  expect(calls[1]).toEqual(calls[0]);
});

test("pipeline_rejects_tools_outside_the_read_only_allowlist_without_querying", async () => {
  const store = openLedgerStore(":memory:");
  cleanup.push(() => store.close());
  const list = vi.fn(() => store.read((r) => r.transactions.list()));
  const agent = new ReadOnlyQaLoop({
    client: {
      chatCompletion: vi.fn(async () => ({
        ...result,
        toolCalls: [
          { function: { name: "approve_proposal", arguments: "{}" } },
        ],
      })),
    },
    redactor: new PrivacyRedactor(),
    data: {
      listTransactions: list,
      getWalletSummary: (id) => getWalletSummary(store, id),
    },
  });
  expect(await agent.answerQuestion("Synthetic")).toMatchObject({
    stopReason: "tool_rejected",
  });
  expect(list).not.toHaveBeenCalled();
});

test("pipeline_unknown_provider_errors_stay_static_and_hide_the_abort_reason", async () => {
  const server = await startFakeOpenAIServer(() => {
    throw new Error("synthetic_private_provider_error");
  });
  cleanup.push(() => server.close());
  const provider = provider_for(server.baseUrl);
  const failure = await provider
    .chatCompletion(request)
    .catch((error) => error);
  expect(failure).toBeInstanceOf(AllKeysFailedError);
  expect(JSON.stringify((failure as Error).message)).not.toContain(
    "synthetic_private_provider_error",
  );

  const controller = new AbortController();
  controller.abort();
  const aborted = await provider
    .chatCompletion({ ...request, signal: controller.signal })
    .catch((error) => error);
  expect(aborted).toMatchObject({
    name: "AbortError",
    message: "Provider request cancelled or timed out",
  });
});

test("pipeline_normalizes_every_failure_category_exactly_as_before", () => {
  // The reason table that previously lived on the LangChain decorator.
  const cases = [
    ["unauthorized", "unauthorized"],
    ["rate_limited", "rate_limited"],
    ["connection_error", "connection_error"],
    ["access_denied", "access_denied"],
    ["provider_unavailable", "provider_unavailable"],
    ["provider_http_error", "provider_http_error"],
    ["protocol_error", "protocol_error"],
    ["provider_error", "provider_error"],
    ["disabled", "provider_error"],
    ["cooldown", "provider_error"],
    [undefined, "provider_error"],
  ] as const;
  for (const [reason, expected] of cases)
    expect(normalize_failure_reason(reason)).toBe(expected);
});

test("pipeline_mixed_key_failures_never_echo_key_nicknames", async () => {
  const failure = new AllKeysFailedError([
    { nickname: "synthetic_alpha", reason: "unauthorized" },
    { nickname: "synthetic_bravo", reason: "rate_limited" },
  ]);
  const agent = new ReadOnlyQaLoop({
    client: {
      chatCompletion: vi.fn(async () => {
        throw failure;
      }),
    },
    redactor: new PrivacyRedactor(),
    data: {
      listTransactions: vi.fn(async () => []),
      getWalletSummary: vi.fn(),
    },
  });
  const answer = await agent.answerQuestion("Synthetic");
  expect(answer.stopReason).toBe("provider_error");
  expect(JSON.stringify(answer)).not.toContain("synthetic_alpha");
  expect(JSON.stringify(answer)).not.toContain("synthetic_bravo");
});

test("pipeline_read_only_transport_never_receives_a_write_capability", async () => {
  const server = await startFakeOpenAIServer(() => ({ content: "Synthetic" }));
  cleanup.push(() => server.close());
  const store = openLedgerStore(":memory:");
  cleanup.push(() => store.close());
  const agent = new ReadOnlyQaLoop({
    client: provider_for(server.baseUrl),
    redactor: new PrivacyRedactor(),
    data: {
      listTransactions: () => store.read((r) => r.transactions.list()),
      getWalletSummary: (id) => getWalletSummary(store, id),
    },
  });
  await agent.answerQuestion("Synthetic");
  const sent = JSON.stringify(server.recordedRequests[0]!.parsedBody);
  expect(sent).toContain("query_transactions");
  expect(sent).not.toContain("propose_transaction");
});
