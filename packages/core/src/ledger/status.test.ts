import { afterEach, expect, test } from "vitest";
import { openLedgerStore } from "../../../storage/src/repositories.js";
import {
  createManualTransaction,
  insertAutoCapturedTransaction,
  transitionTransactionStatus,
  getTransaction,
  InvalidStatusTransitionError,
} from "./ledger.js";
const stores: ReturnType<typeof openLedgerStore>[] = [];
function open() {
  const s = openLedgerStore(":memory:");
  stores.push(s);
  return s;
}
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
});
const input = { amountPaise: 12345, direction: "debit" as const };

test("baseline_1_4_manual_confirmed_captured_unverified_forward_only", async () => {
  const store = open();
  const manual = await createManualTransaction(store, input);
  expect(manual.transaction.status).toBe("user_confirmed");
  expect(manual.transaction.source).toBe("manual");
  const auto = await insertAutoCapturedTransaction(store, {
    ...input,
    occurredAt: "2026-11-04T00:00:00Z",
  });
  expect(auto.transaction.status).toBe("unverified");
  await expect(
    transitionTransactionStatus(store, auto.transaction.id, "user_confirmed"),
  ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
  expect(
    (
      await transitionTransactionStatus(
        store,
        auto.transaction.id,
        "ai_checked",
      )
    ).transaction.status,
  ).toBe("ai_checked");
  await expect(
    transitionTransactionStatus(store, auto.transaction.id, "unverified"),
  ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
  expect(
    (
      await transitionTransactionStatus(
        store,
        auto.transaction.id,
        "user_confirmed",
      )
    ).transaction.status,
  ).toBe("user_confirmed");
  for (const next of ["unverified", "ai_checked", "user_confirmed", "invalid"])
    await expect(
      transitionTransactionStatus(store, auto.transaction.id, next),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
  expect(await getTransaction(store, "missing")).toBeNull();
  await expect(
    transitionTransactionStatus(store, "missing", "ai_checked"),
  ).rejects.toHaveProperty("code", "TX_NOT_FOUND");
});
test("ledger_creation_preserves_legacy_and_plan_columns_and_atomic_audit", async () => {
  const store = open();
  let id = 0;
  const runtime = {
    now: () => "2026-11-04T01:02:03Z",
    makeId: (prefix: string) => `${prefix}_synthetic_${++id}`,
  };
  const result = await createManualTransaction(
    store,
    {
      ...input,
      walletId: "bank_default",
      direction: "credit",
      eventType: "refund",
      category: "synthetic",
      counterpartyName: "Synthetic Person",
      accountLast4: "1234",
      note: "synthetic note",
      benefit: "shared",
      tags: ["synthetic"],
      splitOwedPaise: 1,
      benefitPaise: 2,
      tag: "synthetic_tag",
      occurredAt: "2026-11-03T00:00:00Z",
    },
    runtime,
  );
  expect(result.transaction).toMatchObject({
    wallet_id: "bank_default",
    direction: "credit",
    event_type: "refund",
    benefit: "shared",
    tags_json: '["synthetic"]',
    split_owed_paise: 1,
    benefit_paise: 2,
    tag: "synthetic_tag",
    created_at: runtime.now(),
    updated_at: runtime.now(),
  });
  expect(await getTransaction(store, result.transaction.id)).toEqual(
    result.transaction,
  );
  const audit = await store.read((r) => r.audit.get(result.auditId));
  expect(audit?.before_state).toBeNull();
  expect(JSON.parse(audit!.after_state!)).toEqual(result.transaction);
  const captured = await insertAutoCapturedTransaction(
    store,
    {
      ...input,
      walletId: "cash",
      eventType: "reversal",
      category: "synthetic",
      counterpartyName: "Synthetic Person",
      accountLast4: "5678",
      note: "synthetic captured",
      source: "import",
      benefit: "other",
      tags: ["import"],
      dedupKey: "synthetic_dedup",
      importFingerprint: "synthetic_import",
      benefitPaise: 5,
      tag: "synthetic",
      occurredAt: runtime.now(),
    },
    runtime,
  );
  expect(captured.transaction).toMatchObject({
    status: "unverified",
    source: "import",
    dedup_key: "synthetic_dedup",
    import_fingerprint: "synthetic_import",
    split_owed_paise: 0,
  });
  await expect(
    insertAutoCapturedTransaction(
      store,
      { ...input, dedupKey: "synthetic_dedup", occurredAt: runtime.now() },
      runtime,
    ),
  ).rejects.toThrow();
  expect((await store.read((r) => r.audit.list())).length).toBe(2);
  const step = await transitionTransactionStatus(
    store,
    captured.transaction.id,
    "ai_checked",
    runtime,
  );
  const stepAudit = await store.read((r) => r.audit.get(step.auditId));
  expect(JSON.parse(stepAudit!.before_state!)).toEqual(captured.transaction);
});
test("ledger_rejects_invalid_values_before_any_write", async () => {
  const store = open();
  for (const amountPaise of [
    -0,
    0,
    -1,
    1.1,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    await expect(
      createManualTransaction(store, { ...input, amountPaise }),
    ).rejects.toThrow();
  await expect(
    createManualTransaction(store, { ...input, benefitPaise: -1 }),
  ).rejects.toThrow();
  await expect(
    createManualTransaction(store, { ...input, splitOwedPaise: -1 }),
  ).rejects.toThrow();
  await expect(
    createManualTransaction(store, {
      ...input,
      direction: "invalid" as "debit",
    }),
  ).rejects.toHaveProperty("code", "INVALID_DIRECTION");
  await expect(
    createManualTransaction(store, {
      ...input,
      eventType: "invalid" as "normal",
    }),
  ).rejects.toHaveProperty("code", "INVALID_EVENT_TYPE");
  await expect(
    createManualTransaction(store, { ...input, walletId: "missing" }),
  ).rejects.toThrow();
  expect(await store.read((r) => r.transactions.list())).toEqual([]);
  expect(await store.read((r) => r.audit.list())).toEqual([]);
});

test("baseline_1_1_create_1000_entries_and_audits_preserves_exact_totals", async () => {
  const store = open();
  let expected = 0n;
  for (let i = 1; i <= 1000; i++) {
    const amountPaise = i * 100 + ((i * 37) % 100);
    expected += BigInt(amountPaise);
    await createManualTransaction(store, {
      amountPaise,
      direction: "debit",
      category: "synthetic_batch",
      occurredAt: "2026-11-04T10:00:00Z",
    });
  }
  const rows = await store.read((r) => r.transactions.list());
  expect(rows.length).toBe(1000);
  expect(rows.reduce((sum, row) => sum + BigInt(row.amount_paise), 0n)).toBe(
    expected,
  );
  expect((await store.read((r) => r.audit.list())).length).toBe(1000);
});
