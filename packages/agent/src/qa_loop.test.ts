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
import { ReadOnlyQaLoop, QaValidationError } from "./qa_loop.js";
import { AllKeysFailedError, BadRequestNoFallbackError } from "./key_pool.js";
import type { ChatCompletionResult } from "./provider_client.js";
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
const call = (
  name = "get_month_summary",
  args: unknown = { year_month: "2026-11" },
) => ({
  type: "function" as const,
  function: { name, arguments: JSON.stringify(args) },
});
function completion(
  extra: Partial<ChatCompletionResult> = {},
): ChatCompletionResult {
  return {
    content: "Synthetic answer",
    toolCalls: [],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    keyNickname: "synthetic",
    ...extra,
  };
}
test("qa_classifies_provider_failures_without_returning_raw_error_text", async () => {
  const cases = [
    {
      error: new AllKeysFailedError([
        { nickname: "kilo_free", reason: "unauthorized" },
      ]),
      stopReason: "provider_auth_failed",
    },
    {
      error: new AllKeysFailedError([
        { nickname: "kilo_free", reason: "rate_limited" },
      ]),
      stopReason: "provider_rate_limited",
    },
    {
      error: new AllKeysFailedError([
        { nickname: "kilo_free", reason: "rate_limited" },
        { nickname: "secondary", reason: "unauthorized" },
      ]),
      stopReason: "provider_error",
    },
    {
      error: new BadRequestNoFallbackError(),
      stopReason: "provider_request_rejected",
    },
  ] as const;
  const f = await fixture();

  for (const { error, stopReason } of cases) {
    const qa = new ReadOnlyQaLoop({
      client: {
        chatCompletion: vi.fn(async () => {
          throw error;
        }),
      },
      data: f.source,
      redactor: f.redactor,
    });
    const result = await qa.answerQuestion("Synthetic connectivity test");
    expect(result).toMatchObject({ answered: false, stopReason });
    expect(JSON.stringify(result)).not.toContain(error.message);
  }
});

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "vittaz_qa_"));
  cleanup.push(async () => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "ledger.sqlite");
  const writer = openLedgerStore(file);
  cleanup.push(() => writer.close());
  await createManualTransaction(writer, {
    amountPaise: 1234,
    direction: "debit",
    category: "food",
    counterpartyName: "SynthPerson",
    note: "private_synthetic_note",
    occurredAt: "2026-11-04T00:00:00Z",
  });
  const reader = openReadOnlyLedgerStore(file);
  cleanup.push(() => reader.close());
  const source = {
    listTransactions: vi.fn(() => reader.read((r) => r.transactions.list())),
    getWalletSummary: vi.fn((id: string) => getWalletSummary(reader, id)),
  };
  const redactor = new PrivacyRedactor(["SynthPerson"]);
  return { writer, reader, source, redactor };
}
test("baseline_4_4_qa_step_token_timeout_stops_before_further_queries", async () => {
  const f = await fixture();
  const client = {
    chatCompletion: vi.fn(async () => completion({ toolCalls: [call()] })),
  };
  const qa = new ReadOnlyQaLoop({
    client,
    data: f.source,
    redactor: f.redactor,
  });
  expect(
    await qa.answerQuestion("Synthetic monthly spending", { maxSteps: 3 }),
  ).toMatchObject({
    answered: false,
    stopReason: "step_limit",
    stepsUsed: 3,
    tokensUsed: 60,
  });
  expect(client.chatCompletion).toHaveBeenCalledTimes(3);
  client.chatCompletion.mockResolvedValue(
    completion({
      toolCalls: [call()],
      usage: { prompt_tokens: 450, completion_tokens: 200, total_tokens: 650 },
    }),
  );
  f.source.listTransactions.mockClear();
  expect(
    await qa.answerQuestion("Synthetic spending", { tokenBudget: 500 }),
  ).toMatchObject({ answered: false, stopReason: "token_budget" });
  expect(f.source.listTransactions).not.toHaveBeenCalled();
  client.chatCompletion.mockImplementation(async () => new Promise(() => {}));
  expect(
    await qa.answerQuestion("Synthetic spending", { timeoutMs: 25 }),
  ).toMatchObject({ answered: false, stopReason: "timeout" });
});
test("baseline_4_5_qa_readonly_connection_and_registry_no_proposal_or_transaction_changes", async () => {
  const f = await fixture();
  const before = await f.writer.exportSnapshot();
  const client = {
    chatCompletion: vi.fn(async () =>
      completion({
        toolCalls: [call("approve_proposal", { proposal_id: "synthetic" })],
      }),
    ),
  };
  const qa = new ReadOnlyQaLoop({
    client,
    data: f.source,
    redactor: f.redactor,
  });
  expect(Object.keys(f.reader).sort()).toEqual(["close", "read"]);
  expect(await qa.answerQuestion("Synthetic question")).toMatchObject({
    answered: false,
    stopReason: "tool_rejected",
  });
  expect(f.source.listTransactions).not.toHaveBeenCalled();
  expect(await f.writer.exportSnapshot()).toEqual(before);
});
test("qa_streams_only_final_validated_answer_after_a_readonly_tool_call", async () => {
  const f = await fixture();
  let provider_finished = false;
  const client = {
    chatCompletion: vi
      .fn()
      .mockImplementationOnce(async () => completion({ toolCalls: [call()] }))
      .mockImplementationOnce(async () => {
        provider_finished = true;
        return completion({ content: "Synthetic safe answer." });
      }),
  };
  const chunks: string[] = [];
  const qa = new ReadOnlyQaLoop({
    client,
    data: f.source,
    redactor: f.redactor,
  });
  const result = await qa.answerQuestion("Synthetic monthly total", {
    onValidatedChunk: (chunk: string) => {
      expect(provider_finished).toBe(true);
      chunks.push(chunk);
    },
  });
  expect(result).toMatchObject({
    answered: true,
    answer: "Synthetic safe answer.",
    toolsUsed: ["get_month_summary"],
  });
  expect(
    client.chatCompletion.mock.calls.map(([request]) => request.stream),
  ).toEqual([true, true]);
  expect(chunks.join("")).toBe("Synthetic safe answer.");
  expect(f.source.listTransactions).toHaveBeenCalledTimes(1);
});

test("qa_presentation_callback_errors_are_nonfatal_to_a_safe_answer", async () => {
  const f = await fixture();
  const client = {
    chatCompletion: vi.fn(async () => completion({ content: "S".repeat(48) })),
  };
  const callback = vi.fn(() => {
    throw new Error("private_synthetic_presentation_failure");
  });
  const result = await new ReadOnlyQaLoop({
    client,
    data: f.source,
    redactor: f.redactor,
  }).answerQuestion("Synthetic", { onValidatedChunk: callback });
  expect(result).toMatchObject({ answered: true, answer: "S".repeat(48) });
  expect(callback).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(result)).not.toContain(
    "private_synthetic_presentation_failure",
  );
});

test("qa_abort_during_presentation_callback_stops_before_the_next_chunk", async () => {
  const f = await fixture();
  const controller = new AbortController();
  const callback = vi.fn(() => {
    controller.abort();
    throw new Error("private_synthetic_presentation_failure");
  });
  const result = await new ReadOnlyQaLoop({
    client: {
      chatCompletion: vi.fn(async () =>
        completion({ content: "S".repeat(48) }),
      ),
    },
    data: f.source,
    redactor: f.redactor,
  }).answerQuestion("Synthetic", {
    signal: controller.signal,
    onValidatedChunk: callback,
  });
  expect(result).toMatchObject({ answered: false, stopReason: "aborted" });
  expect(callback).toHaveBeenCalledTimes(1);
});

test("qa_deadline_expiry_during_presentation_callback_stops_before_the_next_chunk", async () => {
  const f = await fixture();
  const callback = vi.fn(
    () => new Promise<void>((resolve) => setTimeout(resolve, 80)),
  );
  const result = await new ReadOnlyQaLoop({
    client: {
      chatCompletion: vi.fn(async () =>
        completion({ content: "S".repeat(48) }),
      ),
    },
    data: f.source,
    redactor: f.redactor,
  }).answerQuestion("Synthetic", {
    timeoutMs: 20,
    onValidatedChunk: callback,
  });
  expect(result).toMatchObject({ answered: false, stopReason: "timeout" });
  expect(callback).toHaveBeenCalledTimes(1);
});

test("qa_deadline_expiry_between_validated_chunks_stops_presentation", async () => {
  const f = await fixture();
  const callback = vi.fn(() => {
    const deadline = performance.now() + 30;
    while (performance.now() < deadline) {
      /* synthetic presentation work advances the monotonic deadline */
    }
  });
  const result = await new ReadOnlyQaLoop({
    client: {
      chatCompletion: vi.fn(async () =>
        completion({ content: "S".repeat(48) }),
      ),
    },
    data: f.source,
    redactor: f.redactor,
  }).answerQuestion("Synthetic", {
    timeoutMs: 20,
    onValidatedChunk: callback,
  });
  expect(result).toMatchObject({ answered: false, stopReason: "timeout" });
  expect(callback).toHaveBeenCalledTimes(1);
});

test("qa_reads_projected_results_and_restores_names_only_in_local_reply", async () => {
  const f = await fixture();
  const client = {
    chatCompletion: vi
      .fn()
      .mockResolvedValueOnce(completion({ toolCalls: [call()] }))
      .mockResolvedValueOnce(
        completion({ content: "Person_1 spent 1234 paise" }),
      ),
  };
  const qa = new ReadOnlyQaLoop({
    client,
    data: f.source,
    redactor: f.redactor,
  });
  expect(
    await qa.answerQuestion("How much did SynthPerson spend?"),
  ).toMatchObject({
    answered: true,
    stopReason: "completed",
    answer: "SynthPerson spent 1234 paise",
    stepsUsed: 2,
    tokensUsed: 40,
  });
  const wire = JSON.stringify(client.chatCompletion.mock.calls);
  expect(wire).not.toContain("SynthPerson");
  expect(wire).not.toContain("private_synthetic_note");
  expect(wire).toContain("1234");
  expect(wire).toContain("query_transactions");
});
test("qa_sensitive_question_and_invalid_options_have_zero_provider_and_query_calls", async () => {
  const f = await fixture();
  const client = { chatCompletion: vi.fn(async () => completion()) };
  const qa = new ReadOnlyQaLoop({
    client,
    data: f.source,
    redactor: f.redactor,
  });
  expect(await qa.answerQuestion("Your OTP is 123456")).toMatchObject({
    answered: false,
    stopReason: "sensitive_dropped",
    answer: null,
  });
  for (const opts of [
    { maxSteps: 0 },
    { tokenBudget: -1 },
    { timeoutMs: NaN },
    { extra: true },
    { signal: {} },
  ])
    await expect(qa.answerQuestion("Synthetic", opts)).rejects.toBeInstanceOf(
      QaValidationError,
    );
  await expect(qa.answerQuestion("")).rejects.toBeInstanceOf(QaValidationError);
  expect(client.chatCompletion).not.toHaveBeenCalled();
  expect(f.source.listTransactions).not.toHaveBeenCalled();
});

test("qa_late_sync_provider_reply_does_not_win_after_elapsed_deadline", async () => {
  const f = await fixture();
  const client = {
    chatCompletion: vi.fn(async () => {
      const start = performance.now();
      while (performance.now() - start < 30) {
        /* synthetic blocking trusted adapter */
      }
      return completion();
    }),
  };
  expect(
    await new ReadOnlyQaLoop({
      client,
      data: f.source,
      redactor: f.redactor,
    }).answerQuestion("Synthetic", { timeoutMs: 5 }),
  ).toMatchObject({ answered: false, stopReason: "timeout" });
});

test("qa_abort_before_and_during_provider_and_query_is_bounded_and_never_retries", async () => {
  const f = await fixture();
  const controller = new AbortController();
  controller.abort("private_synthetic_reason");
  const client = { chatCompletion: vi.fn(async () => completion()) };
  const qa = new ReadOnlyQaLoop({
    client,
    data: f.source,
    redactor: f.redactor,
  });
  expect(
    await qa.answerQuestion("Synthetic", { signal: controller.signal }),
  ).toMatchObject({ stopReason: "aborted", stepsUsed: 0 });
  expect(client.chatCompletion).not.toHaveBeenCalled();
  const active = new AbortController();
  client.chatCompletion.mockImplementation(async () => {
    active.abort();
    return new Promise(() => {});
  });
  expect(
    await qa.answerQuestion("Synthetic", { signal: active.signal }),
  ).toMatchObject({ stopReason: "aborted", stepsUsed: 1 });
  client.chatCompletion.mockResolvedValue(completion({ toolCalls: [call()] }));
  f.source.listTransactions.mockImplementation(
    async () => new Promise(() => {}),
  );
  expect(await qa.answerQuestion("Synthetic", { timeoutMs: 25 })).toMatchObject(
    { stopReason: "timeout" },
  );
  const queryAbort = new AbortController();
  f.source.listTransactions.mockImplementation(async () => {
    queryAbort.abort();
    return new Promise(() => {});
  });
  expect(
    await qa.answerQuestion("Synthetic", { signal: queryAbort.signal }),
  ).toMatchObject({ stopReason: "aborted" });
});
test("qa_unknown_invalid_usage_and_malformed_results_fail_closed_without_leaking_errors", async () => {
  const f = await fixture();
  const client = { chatCompletion: vi.fn(async () => completion()) };
  const qa = new ReadOnlyQaLoop({
    client,
    data: f.source,
    redactor: f.redactor,
  });
  client.chatCompletion.mockResolvedValue(
    completion({
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }),
  );
  expect(await qa.answerQuestion("Synthetic")).toMatchObject({
    stopReason: "token_budget",
  });
  for (const result of [
    completion({ content: "" }),
    completion({ content: "Your OTP is 123456" }),
    completion({
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 1 },
    }),
    completion({
      toolCalls: [call("get_balance", { wallet_id: "cash", extra: true })],
    }),
  ]) {
    client.chatCompletion.mockResolvedValue(result);
    const answer = await qa.answerQuestion("Synthetic");
    expect(answer.answered).toBe(false);
    expect(JSON.stringify(answer)).not.toContain("123456");
  }
  client.chatCompletion.mockRejectedValue(
    new Error("private_synthetic_failure"),
  );
  const answer = await qa.answerQuestion("Synthetic");
  expect(answer.stopReason).toBe("provider_error");
  expect(JSON.stringify(answer)).not.toContain("private_synthetic_failure");
  client.chatCompletion
    .mockResolvedValueOnce(completion({ toolCalls: [call()] }))
    .mockResolvedValueOnce(
      completion({
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: Number.MAX_SAFE_INTEGER,
        },
      }),
    );
  expect(await qa.answerQuestion("Synthetic")).toMatchObject({
    stopReason: "provider_error",
    tokensUsed: 20,
  });
});
test("qa_duplicate_call_ids_and_large_history_stop_instead_of_dispatching_unbounded_work", async () => {
  const f = await fixture();
  const duplicate = { ...call(), id: "synthetic_duplicate" };
  const client = {
    chatCompletion: vi.fn(async () =>
      completion({ toolCalls: [duplicate, duplicate] }),
    ),
  };
  const qa = new ReadOnlyQaLoop({
    client,
    data: f.source,
    redactor: f.redactor,
  });
  expect(await qa.answerQuestion("Synthetic")).toMatchObject({
    stopReason: "tool_rejected",
  });
  expect(f.source.listTransactions).not.toHaveBeenCalled();
  client.chatCompletion.mockResolvedValue(
    completion({ toolCalls: Array.from({ length: 16 }, () => call()) }),
  );
  expect(await qa.answerQuestion("Synthetic")).toMatchObject({
    stopReason: "step_limit",
    stepsUsed: 3,
  });
});
test("qa_does_not_echo_known_names_or_untrusted_provider_text_or_ids_to_next_request", async () => {
  const f = await fixture();
  const client = {
    chatCompletion: vi
      .fn()
      .mockResolvedValueOnce(
        completion({
          content: "private_synthetic_reply",
          toolCalls: [
            {
              ...call("query_transactions", { category: "SynthPerson" }),
              id: "SynthPerson",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(completion()),
  };
  const qa = new ReadOnlyQaLoop({
    client,
    data: f.source,
    redactor: f.redactor,
  });
  expect(await qa.answerQuestion("Synthetic")).toMatchObject({
    answered: true,
  });
  const wire = JSON.stringify(client.chatCompletion.mock.calls);
  expect(wire).not.toContain("SynthPerson");
  expect(wire).not.toContain("private_synthetic_reply");
});

test("qa_real_fake_http_roundtrip_uses_only_readonly_projected_tools_and_no_mutations", async () => {
  const { startFakeOpenAIServer } =
    await import("../../../tests/helpers/fake_openai_server.js");
  const { OpenAICompatibleClient } = await import("./provider_client.js");
  const { KeyPool } = await import("./key_pool.js");
  const f = await fixture();
  const before = await f.writer.exportSnapshot();
  const server = await startFakeOpenAIServer((r) =>
    r.index === 0
      ? { toolCalls: [call("get_balance", { wallet_id: "cash" })] }
      : { content: "Synthetic balance -1234 paise" },
  );
  cleanup.push(() => server.close());
  const client = new OpenAICompatibleClient({
    baseUrl: server.baseUrl,
    keyPool: new KeyPool([{ nickname: "synthetic", apiKey: "synthetic_qa" }]),
  });
  const qa = new ReadOnlyQaLoop({
    client,
    data: f.source,
    redactor: f.redactor,
  });
  expect(await qa.answerQuestion("Synthetic cash balance")).toMatchObject({
    answered: true,
    answer: "Synthetic balance -1234 paise",
  });
  const wire = JSON.stringify(server.recordedRequests.map((r) => r.parsedBody));
  expect(wire).not.toContain("SynthPerson");
  expect(wire).not.toContain("private_synthetic_note");
  expect(wire).toContain("-1234");
  expect(wire).not.toContain("propose_transaction");
  expect(await f.writer.exportSnapshot()).toEqual(before);
});

test("qa_abort_during_local_redaction_prevents_first_provider_request_and_private_query_failure_is_static", async () => {
  const f = await fixture();
  const controller = new AbortController();
  const spy = vi
    .spyOn(f.redactor, "discoverAndRegisterInlineNames")
    .mockImplementation(() => {
      controller.abort();
      return [];
    });
  const client = {
    chatCompletion: vi.fn(async () => completion({ toolCalls: [call()] })),
  };
  const qa = new ReadOnlyQaLoop({
    client,
    data: f.source,
    redactor: f.redactor,
  });
  expect(
    await qa.answerQuestion("Synthetic", { signal: controller.signal }),
  ).toMatchObject({ stopReason: "aborted", stepsUsed: 0 });
  expect(client.chatCompletion).not.toHaveBeenCalled();
  spy.mockRestore();
  f.source.listTransactions.mockRejectedValue(
    new Error("private_synthetic_storage_error"),
  );
  const answer = await qa.answerQuestion("Synthetic");
  expect(answer.stopReason).toBe("tool_rejected");
  expect(JSON.stringify(answer)).not.toContain(
    "private_synthetic_storage_error",
  );
});
