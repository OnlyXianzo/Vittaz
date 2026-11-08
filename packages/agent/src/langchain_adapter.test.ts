import { afterEach, expect, test, vi } from "vitest";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { CallbackManager } from "@langchain/core/callbacks/manager";
import {
  LangChainCompletionClient,
  LangChainQaAgent,
  LangChainAdapterError,
} from "./langchain_adapter.js";
import {
  PrivacyRedactor,
  getWalletSummary,
  createManualTransaction,
} from "@vittaz/core";
import {
  openLedgerStore,
  openReadOnlyLedgerStore,
} from "../../storage/src/repositories.js";
import { startFakeOpenAIServer } from "../../../tests/helpers/fake_openai_server.js";
import { OpenAICompatibleClient } from "./provider_client.js";
import {
  AllKeysFailedError,
  KeyPool,
  BadRequestNoFallbackError,
} from "./key_pool.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const f of cleanup.splice(0).reverse()) await f();
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
test("langchain_native_invoke_roundtrip_preserves_provider_tool_arguments_and_usage_without_execution", async () => {
  const spy = vi.spyOn(BaseChatModel.prototype, "invoke");
  const warn = vi.spyOn(console, "warn");
  const expected = {
    ...result,
    toolCalls: [
      {
        id: "synthetic_call",
        type: "function" as const,
        function: { name: "get_balance", arguments: "not valid JSON" },
      },
    ],
  };
  const raw = { chatCompletion: vi.fn(async () => expected) };
  const client = new LangChainCompletionClient(raw);
  expect(await client.chatCompletion(request)).toEqual(expected);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(raw.chatCompletion).toHaveBeenCalledTimes(1);
  expect(warn).not.toHaveBeenCalled();
});
test("langchain_buffers_provider_sse_for_validated_answer_delivery", async () => {
  const raw = { chatCompletion: vi.fn(async () => result) };
  const client = new LangChainCompletionClient(raw);
  expect(await client.chatCompletion({ ...request, stream: true })).toEqual(
    result,
  );
  expect(raw.chatCompletion).toHaveBeenCalledWith(
    expect.objectContaining({ stream: true }),
  );
});
test("langchain_diagnostics_report_unexpected_stage_without_exception_text", async () => {
  const events: unknown[] = [];
  const raw = {
    chatCompletion: vi.fn(async () => {
      throw new Error("synthetic_private_exception_marker");
    }),
  };
  const client = new LangChainCompletionClient(raw);

  await expect(
    client.chatCompletion({
      ...request,
      onDiagnostic: (event) => events.push(event),
    }),
  ).rejects.toBeInstanceOf(LangChainAdapterError);

  const serialized = JSON.stringify(events);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event_code: "langchain_invoke_started",
        source: "langchain",
        outcome: "started",
      }),
      expect.objectContaining({
        event_code: "langchain_invoke_failed",
        source: "langchain",
        outcome: "failed",
        reason_code: "langchain_error",
        failure_stage: "provider_call",
      }),
    ]),
  );
  expect(serialized).not.toContain("synthetic_private_exception_marker");
});

test("langchain_sensitive_malformed_stream_callback_and_aborted_input_never_invoke_framework_or_provider", async () => {
  const spy = vi.spyOn(BaseChatModel.prototype, "invoke");
  const raw = { chatCompletion: vi.fn(async () => result) };
  const client = new LangChainCompletionClient(raw);
  const aborted = new AbortController();
  aborted.abort();
  for (const input of [
    { messages: [] },
    { messages: [{ role: "user", content: "Your OTP is 123456" }] },
    { ...request, onStreamDelta: vi.fn() },
    { ...request, onStreamReset: vi.fn() },
    { ...request, signal: aborted.signal },
  ])
    await expect(
      client.chatCompletion(input as typeof request),
    ).rejects.toBeInstanceOf(LangChainAdapterError);
  expect(spy).not.toHaveBeenCalled();
  expect(raw.chatCompletion).not.toHaveBeenCalled();
});
test("langchain_ambient_verbose_and_tracing_cannot_observe_any_context", async () => {
  const raw = { chatCompletion: vi.fn(async () => result) };
  const client = new LangChainCompletionClient(raw);
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const log = vi.spyOn(console, "log");
  const warn = vi.spyOn(console, "warn");
  for (const name of [
    "LANGCHAIN_VERBOSE",
    "LANGSMITH_TRACING",
    "LANGCHAIN_TRACING_V2",
  ]) {
    vi.stubEnv(name, "true");
    await expect(client.chatCompletion(request)).rejects.toBeInstanceOf(
      LangChainAdapterError,
    );
    vi.unstubAllEnvs();
  }
  expect(raw.chatCompletion).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
});

test("langchain_actual_http_and_readonly_sqlite_loop_preserve_projections_and_financial_state", async () => {
  const directory = mkdtempSync(join(tmpdir(), "vittaz_langchain_"));
  cleanup.push(async () => rmSync(directory, { force: true, recursive: true }));
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
  const pool = new KeyPool([
    { nickname: "synthetic", apiKey: "synthetic_key" },
  ]);
  const agent = new LangChainQaAgent({
    client: new OpenAICompatibleClient({
      baseUrl: server.baseUrl,
      keyPool: pool,
    }),
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
  expect(await writer.exportSnapshot()).toEqual(before);
});
test("langchain_does_not_add_provider_retries_and_preserves_400_or_allkeys_errors", async () => {
  const server = await startFakeOpenAIServer(() => ({ status: 400 }));
  cleanup.push(() => server.close());
  const pool = new KeyPool([
    { nickname: "alpha", apiKey: "synthetic_alpha" },
    { nickname: "bravo", apiKey: "synthetic_bravo" },
  ]);
  const client = new LangChainCompletionClient(
    new OpenAICompatibleClient({ baseUrl: server.baseUrl, keyPool: pool }),
  );
  await expect(client.chatCompletion(request)).rejects.toBeInstanceOf(
    BadRequestNoFallbackError,
  );
  expect(server.recordedRequests).toHaveLength(1);
  server.clearRequests();
  server.setResponder((r) =>
    r.index === 0 ? { status: 401 } : { content: "Synthetic fallback" },
  );
  expect(await client.chatCompletion(request)).toMatchObject({
    keyNickname: "bravo",
  });
  expect(server.recordedRequests).toHaveLength(2);
  server.clearRequests();
  server.setResponder(() => ({ status: 429 }));
  await expect(client.chatCompletion(request)).rejects.toMatchObject({
    name: "AllKeysFailedError",
  });
  expect(server.recordedRequests).toHaveLength(1);
});
test("langchain_limits_forbidden_tools_malformed_args_and_timeout_remain_authoritative", async () => {
  const store = openLedgerStore(":memory:");
  cleanup.push(() => store.close());
  const list = vi.fn(() => store.read((r) => r.transactions.list()));
  const raw = {
    chatCompletion: vi.fn(async () => ({
      ...result,
      toolCalls: [
        {
          function: {
            name: "get_month_summary",
            arguments: '{"year_month":"2026-11"}',
          },
        },
      ],
    })),
  };
  const agent = new LangChainQaAgent({
    client: raw,
    redactor: new PrivacyRedactor(),
    data: {
      listTransactions: list,
      getWalletSummary: (id) => getWalletSummary(store, id),
    },
  });
  expect(
    await agent.answerQuestion("Synthetic", { maxSteps: 2 }),
  ).toMatchObject({ stopReason: "step_limit", stepsUsed: 2 });
  raw.chatCompletion.mockResolvedValueOnce({
    ...result,
    toolCalls: [{ function: { name: "approve_proposal", arguments: "{}" } }],
  });
  list.mockClear();
  expect(await agent.answerQuestion("Synthetic")).toMatchObject({
    stopReason: "tool_rejected",
  });
  expect(list).not.toHaveBeenCalled();
  for (const arguments_ of ["invalid_json", "null", "[]", "2"]) {
    raw.chatCompletion.mockResolvedValueOnce({
      ...result,
      toolCalls: [{ function: { name: "get_balance", arguments: arguments_ } }],
    });
    expect(await agent.answerQuestion("Synthetic")).toMatchObject({
      stopReason: "tool_rejected",
    });
  }
  raw.chatCompletion.mockImplementation(async () => new Promise(() => {}));
  expect(
    await agent.answerQuestion("Synthetic", { timeoutMs: 20 }),
  ).toMatchObject({ stopReason: "timeout" });
});
test("langchain_keeps_developer_null_tool_protocol_wire_exact_and_no_cache_between_calls", async () => {
  const raw = { chatCompletion: vi.fn(async () => result) };
  const client = new LangChainCompletionClient(raw);
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
  await client.chatCompletion({ messages, maxCompletionTokens: 50 });
  await client.chatCompletion({ messages, maxCompletionTokens: 50 });
  expect(raw.chatCompletion).toHaveBeenCalledTimes(2);
  expect(raw.chatCompletion).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      messages,
      maxCompletionTokens: 50,
    }),
  );
});
test("langchain_unknown_provider_errors_are_static_and_abort_reason_is_not_exposed", async () => {
  const raw = { chatCompletion: vi.fn(async () => result) };
  const client = new LangChainCompletionClient(raw);
  raw.chatCompletion.mockRejectedValueOnce(
    new Error("synthetic_private_provider_error"),
  );
  await expect(client.chatCompletion(request)).rejects.toBeInstanceOf(
    LangChainAdapterError,
  );
  const abort = new Error("synthetic_private_abort_reason");
  abort.name = "AbortError";
  raw.chatCompletion.mockRejectedValueOnce(abort);
  await expect(client.chatCompletion(request)).rejects.toMatchObject({
    name: "AbortError",
    message: "Provider request cancelled or timed out",
  });
});

test("langchain_inherited_callbacks_are_not_invoked_or_forwarded", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const { AsyncLocalStorageProviderSingleton } =
    await import("@langchain/core/singletons");
  AsyncLocalStorageProviderSingleton.initializeGlobalInstance(
    new AsyncLocalStorage(),
  );
  const observe = vi.fn();
  const parent = CallbackManager.fromHandlers({
    handleChatModelStart: observe,
    handleLLMEnd: observe,
  });
  const raw = { chatCompletion: vi.fn(async () => result) };
  const client = new LangChainCompletionClient(raw);
  await AsyncLocalStorageProviderSingleton.getInstance().run(undefined, () =>
    AsyncLocalStorageProviderSingleton.runWithConfig(
      {
        callbacks: parent,
        metadata: { private_synthetic_parent: true },
        tags: ["private_synthetic_tag"],
      },
      async () => {
        expect(await client.chatCompletion(request)).toEqual(result);
      },
    ),
  );
  expect(observe).not.toHaveBeenCalled();
  expect(JSON.stringify(raw.chatCompletion.mock.calls)).not.toContain(
    "private_synthetic_parent",
  );
});
test("langchain_registered_ambient_context_handler_is_rejected_before_it_sees_payload", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const { AsyncLocalStorageProviderSingleton } =
    await import("@langchain/core/singletons");
  const { registerConfigureHook, setContextVariable } =
    await import("@langchain/core/context");
  const { BaseCallbackHandler } =
    await import("@langchain/core/callbacks/base");
  AsyncLocalStorageProviderSingleton.initializeGlobalInstance(
    new AsyncLocalStorage(),
  );
  const observe = vi.fn();
  class PrivateObserver extends BaseCallbackHandler {
    name = "synthetic_observer";
    handleChatModelStart = observe;
    handleLLMEnd = observe;
  }
  const raw = { chatCompletion: vi.fn(async () => result) };
  const client = new LangChainCompletionClient(raw);
  await AsyncLocalStorageProviderSingleton.getInstance().run(
    undefined,
    async () => {
      registerConfigureHook({ contextVar: "synthetic_observer" });
      setContextVariable("synthetic_observer", new PrivateObserver());
      await expect(client.chatCompletion(request)).rejects.toBeInstanceOf(
        LangChainAdapterError,
      );
    },
  );
  expect(observe).not.toHaveBeenCalled();
  expect(raw.chatCompletion).not.toHaveBeenCalled();
});

test("langchain_mixed_key_failures_use_static_provider_error_reason", async () => {
  const events: unknown[] = [];
  const failure = new AllKeysFailedError([
    { nickname: "synthetic_alpha", reason: "unauthorized" },
    { nickname: "synthetic_bravo", reason: "rate_limited" },
  ]);
  const client = new LangChainCompletionClient({
    chatCompletion: vi.fn(async () => {
      throw failure;
    }),
  });

  await expect(
    client.chatCompletion({
      ...request,
      onDiagnostic: (event) => events.push(event),
    }),
  ).rejects.toBe(failure);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event_code: "langchain_invoke_failed",
        reason_code: "provider_error",
        failure_stage: "provider_call",
      }),
    ]),
  );
  expect(JSON.stringify(events)).not.toContain("synthetic_alpha");
  expect(JSON.stringify(events)).not.toContain("synthetic_bravo");
});

test("langchain_maps_all_single_key_failure_categories_without_echoing_key_metadata", async () => {
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
  ] as const;

  for (const [failure_reason, diagnostic_reason] of cases) {
    const events: unknown[] = [];
    const client = new LangChainCompletionClient({
      chatCompletion: vi.fn(async () => {
        throw new AllKeysFailedError([
          { nickname: "synthetic_only", reason: failure_reason },
        ]);
      }),
    });
    await expect(
      client.chatCompletion({
        ...request,
        onDiagnostic: (event) => events.push(event),
      }),
    ).rejects.toBeInstanceOf(AllKeysFailedError);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_code: "langchain_invoke_failed",
          reason_code: diagnostic_reason,
        }),
      ]),
    );
    expect(JSON.stringify(events)).not.toContain("synthetic_only");
  }
});
