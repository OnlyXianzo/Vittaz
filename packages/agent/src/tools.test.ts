import { afterEach, expect, test, vi } from "vitest";
import { openLedgerStore } from "../../storage/src/repositories.js";
import {
  createProposal,
  createManualTransaction,
  insertAutoCapturedTransaction,
  getWalletSummary,
  PrivacyRedactor,
} from "@vittaz/core";
import {
  createQaToolExecutor,
  createDraftToolExecutor,
  validateAndCreateProposalFromToolCall,
  ToolValidationError,
  ReadOnlyViolationError,
  QA_READ_ONLY_TOOL_SPECS,
  PROPOSE_TRANSACTION_TOOL_SPEC,
} from "./tools.js";
const stores: ReturnType<typeof openLedgerStore>[] = [];
function open() {
  const s = openLedgerStore(":memory:");
  stores.push(s);
  return s;
}
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
});
const call = (name: string, args: unknown = {}) => ({
  function: { name, arguments: JSON.stringify(args) },
});
function source(store: ReturnType<typeof open>) {
  return {
    listTransactions: () => store.read((r) => r.transactions.list()),
    getWalletSummary: (id: string) => getWalletSummary(store, id),
  };
}

test("baseline_4_3_valid_draft_creates_only_pending_proposal_and_restores_person_locally", async () => {
  const store = open();
  const redactor = new PrivacyRedactor(["SynthPerson"]);
  const draft = await validateAndCreateProposalFromToolCall(
    (input) => createProposal(store, input),
    redactor,
    call("propose_transaction", {
      amount_paise: 45000,
      direction: "debit",
      category: "Lunch",
      counterparty: "Person_1",
      split_owed_paise: 22500,
    }),
  );
  expect(draft).toMatchObject({
    status: "pending",
    counterparty_name: "SynthPerson",
    category: "lunch",
    split_owed_paise: 22500,
    initial_tx_status: "ai_checked",
  });
  expect(await store.read((r) => r.transactions.list())).toHaveLength(0);
  expect(await store.read((r) => r.proposals.list())).toHaveLength(1);
  const registry = createDraftToolExecutor(
    (input) => createProposal(store, input),
    redactor,
  );
  const result = await registry.execute(
    call("propose_transaction", {
      amount_paise: 100,
      direction: "credit",
      category: "other",
      benefit_paise: 0,
      tags: [" Synthetic "],
    }),
  );
  expect(result).toMatchObject({
    status: "pending",
    amount_paise: 100,
    direction: "credit",
    counterparty: null,
  });
  expect(JSON.stringify(result)).not.toContain("SynthPerson");
  expect(registry.specs).toEqual([PROPOSE_TRANSACTION_TOOL_SPEC]);
});

test("tool_registry_malformed_inputs_and_forbidden_tools_never_touch_application_ports", async () => {
  const propose = vi.fn();
  const read = vi.fn();
  const redactor = new PrivacyRedactor(["SynthPerson"]);
  const draft = createDraftToolExecutor(propose, redactor);
  const qa = createQaToolExecutor(
    { listTransactions: read, getWalletSummary: read },
    redactor,
  );
  for (const args of [
    { amount_paise: 1.5, direction: "debit", category: "food" },
    { amount_paise: -1, direction: "debit", category: "food" },
    { amount_paise: 100, direction: "spend_money", category: "food" },
    {
      amount_paise: 100,
      direction: "debit",
      category: "food",
      split_owed_paise: 101,
    },
    {
      amount_paise: 100,
      direction: "debit",
      category: "food",
      benefit_paise: -1,
    },
    {
      amount_paise: 100,
      direction: "debit",
      category: "food",
      counterparty: "SynthPerson",
    },
    {
      amount_paise: 100,
      direction: "debit",
      category: "food",
      counterparty: "Person_999",
    },
    { amount_paise: 100, direction: "debit", category: "food", approve: true },
  ])
    await expect(
      draft.execute(call("propose_transaction", args)),
    ).rejects.toBeInstanceOf(ToolValidationError);
  for (const name of [
    "approve_proposal",
    "reject_proposal",
    "undo_audit_entry",
    "import_excel",
    "create_backup",
    "restore_backup",
    "drop_all_tables",
    "constructor",
    "propose_transaction",
  ])
    await expect(qa.execute(call(name))).rejects.toBeInstanceOf(
      ReadOnlyViolationError,
    );
  for (const bad of [
    null,
    {},
    call("propose_transaction", []),
    {
      function: { name: "propose_transaction", arguments: "{private_bad_json" },
    },
    { function: { name: "propose_transaction", arguments: "x".repeat(16385) } },
  ])
    await expect(draft.execute(bad)).rejects.toBeInstanceOf(
      ToolValidationError,
    );
  expect(propose).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});

test("privacy_tool_draft_sensitive_arguments_drop_with_zero_storage_trace", async () => {
  const store = open();
  const invoke = vi.fn((input: Parameters<typeof createProposal>[1]) =>
    createProposal(store, input),
  );
  const registry = createDraftToolExecutor(invoke, new PrivacyRedactor());
  await expect(
    registry.execute(
      call("propose_transaction", {
        amount_paise: 100,
        direction: "debit",
        category: "OTP 123456",
      }),
    ),
  ).rejects.toBeInstanceOf(ToolValidationError);
  expect(invoke).not.toHaveBeenCalled();
  expect(await store.read((r) => r.proposals.list())).toHaveLength(0);
});

test("tool_catalog_has_only_six_snake_case_tools_and_strict_input_schemas", () => {
  const specs = [PROPOSE_TRANSACTION_TOOL_SPEC, ...QA_READ_ONLY_TOOL_SPECS];
  expect(specs.map((s) => s.function.name).sort()).toEqual(
    [
      "propose_transaction",
      "find_person",
      "query_transactions",
      "get_balance",
      "get_month_summary",
      "check_unverified",
    ].sort(),
  );
  for (const spec of specs) {
    expect(spec.function.name).toMatch(/^[a-z][a-z0-9_]+$/);
    expect(spec.function.parameters.additionalProperties).toBe(false);
  }
});

test("tool_month_summary_and_balance_use_exact_core_accounting_and_read_only_ports", async () => {
  const store = open();
  await createManualTransaction(store, {
    walletId: "cash",
    amountPaise: 50000,
    direction: "debit",
    category: "groceries",
    occurredAt: "2026-11-04T08:00:00.000Z",
  });
  await createManualTransaction(store, {
    walletId: "cash",
    amountPaise: 90000,
    direction: "credit",
    occurredAt: "2026-11-03T08:00:00.000Z",
  });
  await insertAutoCapturedTransaction(store, {
    walletId: "cash",
    amountPaise: 12000,
    direction: "credit",
    eventType: "refund",
    occurredAt: "2026-11-03T08:00:00.000Z",
  });
  const qa = createQaToolExecutor(source(store), new PrivacyRedactor());
  expect(
    await qa.execute(call("get_month_summary", { year_month: "2026-11" })),
  ).toMatchObject({
    spent_paise: 50000,
    income_paise: 90000,
    count: 3,
    by_category: [{ category: "groceries", spent_paise: 50000 }],
  });
  expect(await qa.execute(call("get_balance"))).toMatchObject({
    balance_paise: 52000,
    cash_in_paise: 102000,
    cash_out_paise: 50000,
  });
  expect(await store.read((r) => r.transactions.list())).toHaveLength(3);
});

test("privacy_tool_transaction_projection_omits_names_notes_accounts_refs_and_unsafe_categories", async () => {
  const store = open();
  await insertAutoCapturedTransaction(store, {
    amountPaise: 100,
    direction: "debit",
    counterpartyName: "SynthPerson",
    note: "PRIVATE_SYNTHETIC_NOTE",
    accountLast4: "1234",
    dedupKey: "utr:630811111111:debit:100",
    category: "PRIVATE_SYNTHETIC_CATEGORY",
    occurredAt: "2026-11-04T08:00:00.000Z",
  });
  const redactor = new PrivacyRedactor();
  const qa = createQaToolExecutor(source(store), redactor);
  const out = await qa.execute(call("query_transactions"));
  expect(out).toMatchObject([
    {
      amount_paise: 100,
      counterparty: "Person_1",
      category: "other",
      status: "unverified",
    },
  ]);
  expect(JSON.stringify(out)).not.toMatch(
    /SynthPerson|PRIVATE_SYNTHETIC|1234|630811111111|dedup_key|note|account_last4/,
  );
  expect(await qa.execute(call("find_person", { name: "Person_1" }))).toEqual({
    person: "Person_1",
    found: true,
  });
  expect(await qa.execute(call("find_person", { name: "Person_999" }))).toEqual(
    { person: "Person_999", found: false },
  );
  expect(await qa.execute(call("check_unverified", { limit: 1 }))).toHaveLength(
    1,
  );
});

test("tool_transaction_filters_dates_wallet_person_status_category_and_limit_are_strict", async () => {
  const store = open();
  const redactor = new PrivacyRedactor(["SynthPerson"]);
  for (const [date, wallet, category, name] of [
    ["2026-11-03", "cash", "food", "SynthPerson"],
    ["2026-11-04", "bank_default", "transport", "OtherSynth"],
    ["2026-10-01", "cash", "food", "SynthPerson"],
  ])
    await createManualTransaction(store, {
      walletId: wallet,
      amountPaise: 100,
      direction: "debit",
      category,
      counterpartyName: name,
      occurredAt: `${date}T00:00:00.000Z`,
    });
  const qa = createQaToolExecutor(source(store), redactor);
  expect(
    await qa.execute(
      call("query_transactions", {
        from_date: "2026-11-01",
        to_date: "2026-11-03",
        wallet_id: "cash",
        counterparty: "Person_1",
        status: "user_confirmed",
        category: "food",
        limit: 1,
      }),
    ),
  ).toHaveLength(1);
  expect(
    await qa.execute(
      call("query_transactions", { counterparty: "Person_999" }),
    ),
  ).toHaveLength(0);
  expect(await qa.execute(call("check_unverified"))).toHaveLength(0);
  const read = vi.fn();
  const reject = createQaToolExecutor(
    { listTransactions: read, getWalletSummary: read },
    redactor,
  );
  for (const args of [
    { limit: 0 },
    { limit: 51 },
    { limit: 1.1 },
    { from_date: "2026-11-04", to_date: "2026-11-03" },
    { from_date: "2026-02-30" },
    { from_date: "bad" },
    { year_month: "2026-13" },
  ])
    await expect(
      reject.execute(call("query_transactions", args)),
    ).rejects.toBeInstanceOf(ToolValidationError);
  for (const month of ["0000-01", "2026-00", "2026-13", "bad"])
    await expect(
      reject.execute(call("get_month_summary", { year_month: month })),
    ).rejects.toBeInstanceOf(ToolValidationError);
  expect(read).not.toHaveBeenCalled();
});

test("tool_output_validation_and_storage_failures_do_not_echo_private_data", async () => {
  const read = vi.fn(async () => {
    throw new Error("private_storage_failure");
  });
  const qa = createQaToolExecutor(
    { listTransactions: read, getWalletSummary: read },
    new PrivacyRedactor(),
  );
  await expect(qa.execute(call("query_transactions"))).rejects.toThrow(
    "Tool execution failed",
  );
  const draft = createDraftToolExecutor(async () => {
    throw new Error("private_proposal_failure");
  }, new PrivacyRedactor());
  await expect(
    draft.execute(
      call("propose_transaction", {
        amount_paise: 100,
        direction: "debit",
        category: "food",
      }),
    ),
  ).rejects.toThrow("Tool execution failed");
  const evil = {
    function: {
      get name() {
        throw new Error("private_getter");
      },
      arguments: "{}",
    },
  };
  await expect(qa.execute(evil)).rejects.toThrow("Invalid tool call");
});

test("tool_schema_zero_sign_and_oversized_names_are_rejected_before_ports", async () => {
  const invoke = vi.fn();
  const redactor = new PrivacyRedactor();
  const draft = createDraftToolExecutor(invoke, redactor);
  await expect(
    draft.execute({
      function: {
        name: "propose_transaction",
        arguments:
          '{"amount_paise":100,"direction":"debit","category":"food","benefit_paise":-0}',
      },
    }),
  ).rejects.toBeInstanceOf(ToolValidationError);
  await expect(draft.execute(call("get_balance"))).rejects.toBeInstanceOf(
    ToolValidationError,
  );
  const qa = createQaToolExecutor(
    { listTransactions: invoke, getWalletSummary: invoke },
    redactor,
  );
  await expect(qa.execute(call("a".repeat(129)))).rejects.toBeInstanceOf(
    ToolValidationError,
  );
  expect(invoke).not.toHaveBeenCalled();
});

test("tool_direct_object_args_and_draft_output_projection_remain_private", async () => {
  const store = open();
  const redactor = new PrivacyRedactor(["SynthPerson"]);
  const registry = createDraftToolExecutor(
    (input) => createProposal(store, input),
    redactor,
  );
  expect(
    await registry.execute({
      function: {
        name: "propose_transaction",
        arguments: {
          amount_paise: 100,
          direction: "debit",
          category: "food",
          counterparty: "Person_1",
          tag: " Synthetic ",
          tags: ["Synthetic"],
          benefit_paise: 1,
        },
      },
    }),
  ).toMatchObject({ counterparty: "Person_1" });
  const pending = (await store.read((r) => r.proposals.list()))[0]!;
  expect(pending.tag).toBe("synthetic");
  const wrongStatus = createDraftToolExecutor(
    async () => ({ ...pending, status: "approved" }),
    redactor,
  );
  await expect(
    wrongStatus.execute(
      call("propose_transaction", {
        amount_paise: 100,
        direction: "debit",
        category: "food",
      }),
    ),
  ).rejects.toThrow("Tool execution failed");
  const wrongOutput = createDraftToolExecutor(
    async () => ({ ...pending, amount_paise: -1 }),
    redactor,
  );
  await expect(
    wrongOutput.execute(
      call("propose_transaction", {
        amount_paise: 100,
        direction: "debit",
        category: "food",
      }),
    ),
  ).rejects.toThrow("Tool execution failed");
});

test("tool_read_projections_sort_and_coalesce_categories_with_no_raw_names_or_notes", async () => {
  const store = open();
  for (const [date, category, amount] of [
    ["2026-11-01", "food", 100],
    ["2026-11-02", "groceries", 200],
    ["2026-11-03", "food", 300],
  ] as const)
    await createManualTransaction(store, {
      amountPaise: amount,
      direction: "debit",
      category,
      occurredAt: `${date}T00:00:00.000Z`,
    });
  const registry = createQaToolExecutor(source(store), new PrivacyRedactor());
  expect(await registry.execute(call("query_transactions"))).toMatchObject([
    { amount_paise: 300, counterparty: null },
    { amount_paise: 200 },
    { amount_paise: 100 },
  ]);
  expect(
    await registry.execute(
      call("get_month_summary", { year_month: "2026-11" }),
    ),
  ).toMatchObject({
    spent_paise: 600,
    by_category: [
      { category: "food", spent_paise: 400 },
      { category: "groceries", spent_paise: 200 },
    ],
  });
  await expect(
    registry.execute(
      call("get_balance", { wallet_id: "private_missing_wallet" }),
    ),
  ).rejects.toThrow("Tool execution failed");
});

test("tool_malformed_repository_output_and_sum_overflow_fail_closed", async () => {
  const store = open();
  await createManualTransaction(store, {
    amountPaise: Number.MAX_SAFE_INTEGER,
    direction: "debit",
    occurredAt: "2026-11-01T00:00:00.000Z",
  });
  await createManualTransaction(store, {
    amountPaise: 1,
    direction: "debit",
    occurredAt: "2026-11-01T00:00:00.000Z",
  });
  const registry = createQaToolExecutor(source(store), new PrivacyRedactor());
  await expect(
    registry.execute(call("get_month_summary", { year_month: "2026-11" })),
  ).rejects.toThrow("Tool execution failed");
  const wrong = createQaToolExecutor(
    {
      listTransactions: async () => [
        {
          ...(await store.read((r) => r.transactions.list()))[0]!,
          amount_paise: 0.5,
        },
      ],
      getWalletSummary: async () => ({
        walletId: "cash",
        openingBalancePaise: 0,
        cashInPaise: 1.1,
        cashOutPaise: 0,
        balancePaise: 0,
      }),
    },
    new PrivacyRedactor(),
  );
  await expect(wrong.execute(call("query_transactions"))).rejects.toThrow(
    "Tool execution failed",
  );
  await expect(wrong.execute(call("get_balance"))).rejects.toThrow(
    "Tool execution failed",
  );
});

test("tool_calendar_year_zero_is_rejected_before_application_ports", async () => {
  const invoke = vi.fn();
  const redactor = new PrivacyRedactor();
  const qa = createQaToolExecutor(
    { listTransactions: invoke, getWalletSummary: invoke },
    redactor,
  );
  await expect(
    qa.execute(call("query_transactions", { from_date: "0000-01-01" })),
  ).rejects.toBeInstanceOf(ToolValidationError);
  const draft = createDraftToolExecutor(invoke, redactor);
  await expect(
    draft.execute(
      call("propose_transaction", {
        amount_paise: 100,
        direction: "debit",
        category: "food",
        occurred_at: "0000-01-01T00:00:00.000Z",
      }),
    ),
  ).rejects.toBeInstanceOf(ToolValidationError);
  expect(invoke).not.toHaveBeenCalled();
});
