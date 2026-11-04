import { afterEach, expect, test } from "vitest";
import { openLedgerStore } from "../../../storage/src/repositories.js";
import {
  createManualTransaction,
  getTransaction,
  transitionTransactionStatus,
} from "./ledger.js";
import { createProposal, approveProposal, getProposal } from "./approval.js";
import { updateTransaction, undoAuditEntry } from "./audit.js";
import type { LedgerStore, AuditLogRow } from "./repositories.js";
const stores: ReturnType<typeof openLedgerStore>[] = [];
function open() {
  const s = openLedgerStore(":memory:");
  stores.push(s);
  return s;
}
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
});
const input = { amountPaise: 30000, direction: "debit" as const };

test("baseline_1_5_exact_create_edit_and_approval_undo", async () => {
  const store = open();
  const original = await createManualTransaction(store, {
    ...input,
    note: "synthetic original",
    tags: ["synthetic"],
  });
  const edit = await updateTransaction(store, original.transaction.id, {
    amountPaise: 55000,
    category: "synthetic category",
    counterpartyName: "Synthetic Person",
    note: "synthetic edit",
    benefit: "shared",
    tags: ["one", "two"],
    benefitPaise: 2,
    tag: "synthetic",
  });
  expect(edit.transaction).toMatchObject({
    amount_paise: 55000,
    benefit_paise: 2,
    tag: "synthetic",
  });
  const undone = await undoAuditEntry(store, edit.auditId);
  expect(undone).toEqual({
    undoneAuditId: edit.auditId,
    restoredState: original.transaction,
  });
  expect(await getTransaction(store, original.transaction.id)).toEqual(
    original.transaction,
  );
  await expect(undoAuditEntry(store, edit.auditId)).rejects.toHaveProperty(
    "code",
    "ALREADY_UNDONE",
  );
  const p = await createProposal(store, input);
  const a = await approveProposal(store, p.id);
  await undoAuditEntry(store, a.auditId!);
  expect(await getTransaction(store, a.transaction.id)).toBeNull();
  expect(await getProposal(store, p.id)).toEqual(p);
  await undoAuditEntry(store, original.auditId);
  expect(await getTransaction(store, original.transaction.id)).toBeNull();
  expect(
    (await store.read((r) => r.audit.list())).every((x) => x.undone === 1),
  ).toBe(true);
});
test("audit_update_empty_and_explicit_null_and_forbidden_status", async () => {
  const store = open();
  const original = await createManualTransaction(store, input);
  const unchanged = await updateTransaction(store, original.transaction.id, {});
  expect(unchanged.transaction.amount_paise).toBe(input.amountPaise);
  const nullable = await updateTransaction(store, original.transaction.id, {
    counterpartyName: null,
    note: null,
    tag: null,
  });
  expect(nullable.transaction.note).toBeNull();
  await expect(updateTransaction(store, "missing", {})).rejects.toHaveProperty(
    "code",
    "TX_NOT_FOUND",
  );
  await expect(
    updateTransaction(store, original.transaction.id, {
      status: "unverified",
    } as never),
  ).rejects.toHaveProperty("code", "STATUS_VIA_UPDATE_FORBIDDEN");
  await expect(
    updateTransaction(store, original.transaction.id, { amountPaise: 0 }),
  ).rejects.toThrow();
  await expect(
    updateTransaction(store, original.transaction.id, { benefitPaise: -1 }),
  ).rejects.toThrow();
  await expect(
    transitionTransactionStatus(store, original.transaction.id, "ai_checked"),
  ).rejects.toThrow();
});
test("audit_stale_undo_cannot_overwrite_newer_mutation", async () => {
  const store = open();
  const original = await createManualTransaction(store, input);
  const first = await updateTransaction(store, original.transaction.id, {
    note: "synthetic first",
  });
  const second = await updateTransaction(store, original.transaction.id, {
    note: "synthetic second",
  });
  await expect(undoAuditEntry(store, first.auditId)).rejects.toHaveProperty(
    "code",
    "STALE_UNDO",
  );
  expect(await getTransaction(store, original.transaction.id)).toEqual(
    second.transaction,
  );
  await undoAuditEntry(store, second.auditId);
  await undoAuditEntry(store, first.auditId);
  expect(await getTransaction(store, original.transaction.id)).toEqual(
    original.transaction,
  );
  await expect(undoAuditEntry(store, "missing")).rejects.toHaveProperty(
    "code",
    "AUDIT_NOT_FOUND",
  );
});
test("audit_can_restore_deleted_snapshot_and_rejects_invalid_events", async () => {
  const store = open();
  const original = await createManualTransaction(store, input);
  const base: AuditLogRow = {
    id: "synthetic_delete",
    action: "delete",
    entity_type: "transaction",
    entity_id: original.transaction.id,
    before_state: JSON.stringify(original.transaction),
    after_state: null,
    related_proposal_before: null,
    undone: 0,
    created_at: original.transaction.created_at,
  };
  await store.transaction(async (r) => {
    await r.transactions.remove(original.transaction.id);
    await r.audit.insert(base);
  });
  expect((await undoAuditEntry(store, base.id)).restoredState).toEqual(
    original.transaction,
  );
  for (const [id, patch] of Object.entries({
    unsupported: { entity_type: "unsupported" },
    empty: { before_state: null, after_state: null },
    bad_id: {
      before_state: JSON.stringify({ ...original.transaction, id: "wrong" }),
      after_state: null,
    },
  })) {
    await store.transaction((r) => r.audit.insert({ ...base, id, ...patch }));
    await expect(undoAuditEntry(store, id)).rejects.toThrow();
  }
  await store.transaction((r) =>
    r.audit.insert({ ...base, id: "synthetic_stale_delete" }),
  );
  await expect(
    undoAuditEntry(store, "synthetic_stale_delete"),
  ).rejects.toHaveProperty("code", "STALE_UNDO");
});
test("audit_undo_proposal_link_and_failure_roll_back_every_change", async () => {
  const store = open();
  const p = await createProposal(store, input);
  const approved = await approveProposal(store, p.id);
  await store.transaction((r) =>
    r.proposals.replace({ ...p, status: "approved", committed_tx_id: "wrong" }),
  );
  await expect(undoAuditEntry(store, approved.auditId!)).rejects.toHaveProperty(
    "code",
    "STALE_UNDO",
  );
  await store.transaction((r) =>
    r.proposals.replace({
      ...p,
      status: "approved",
      committed_tx_id: approved.transaction.id,
    }),
  );
  const failing: LedgerStore = {
    ...store,
    transaction: (work) =>
      store.transaction((r) =>
        work({
          ...r,
          audit: {
            ...r.audit,
            async replace() {
              throw new Error("synthetic_audit_failure");
            },
          },
        }),
      ),
  };
  await expect(undoAuditEntry(failing, approved.auditId!)).rejects.toThrow(
    "synthetic_audit_failure",
  );
  expect(await getTransaction(store, approved.transaction.id)).toEqual(
    approved.transaction,
  );
  expect((await getProposal(store, p.id))?.status).toBe("approved");
});

test("audit_corrupt_snapshot_shape_rejects_without_mutating_rows", async () => {
  const store = open();
  const original = await createManualTransaction(store, input);
  const row = await store.read((r) => r.audit.get(original.auditId));
  for (const text of [
    "null",
    "[]",
    "{}",
    '{"id":1}',
    "123",
    '"synthetic"',
    "not-json",
  ]) {
    await store.transaction((r) =>
      r.audit.replace({ ...row!, after_state: text }),
    );
    await expect(undoAuditEntry(store, original.auditId)).rejects.toThrow();
    expect(await getTransaction(store, original.transaction.id)).toEqual(
      original.transaction,
    );
  }
});
