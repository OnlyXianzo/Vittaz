import { afterEach, expect, test } from "vitest";
import { openLedgerStore } from "../../../storage/src/repositories.js";
import {
  createProposal,
  getProposal,
  approveProposal,
  rejectProposal,
  batchApproveProposals,
} from "./approval.js";
import type { LedgerStore } from "./repositories.js";
const stores: ReturnType<typeof openLedgerStore>[] = [];
function open() {
  const s = openLedgerStore(":memory:");
  stores.push(s);
  return s;
}
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
});
const input = { amountPaise: 45000, direction: "debit" as const };

test("baseline_1_3_pending_approve_once_reject_none", async () => {
  const store = open();
  const p = await createProposal(store, { ...input, splitOwedPaise: 22500 });
  expect(p.status).toBe("pending");
  expect(await store.read((r) => r.transactions.list())).toEqual([]);
  expect(await store.read((r) => r.audit.list())).toEqual([]);
  const results = await Promise.all([
    approveProposal(store, p.id),
    approveProposal(store, p.id),
  ]);
  expect(results.map((r) => r.alreadyApproved)).toEqual([false, true]);
  expect(results[1].transaction).toEqual(results[0].transaction);
  expect(results[1].auditId).toBeNull();
  expect(results[0].transaction.split_owed_paise).toBe(22500);
  expect((await getProposal(store, p.id))?.status).toBe("approved");
  expect((await store.read((r) => r.audit.list())).length).toBe(1);
  const p2 = await createProposal(store, input);
  expect((await rejectProposal(store, p2.id)).status).toBe("rejected");
  expect((await rejectProposal(store, p2.id)).status).toBe("rejected");
  await expect(approveProposal(store, p2.id)).rejects.toHaveProperty(
    "code",
    "PROPOSAL_REJECTED",
  );
  await expect(rejectProposal(store, p.id)).rejects.toHaveProperty(
    "code",
    "PROPOSAL_ALREADY_APPROVED",
  );
  expect((await store.read((r) => r.transactions.list())).length).toBe(1);
});
test("approval_round_trip_fields_runtime_and_atomic_batch", async () => {
  const store = open();
  let n = 0;
  const runtime = {
    now: () => "2026-11-04T01:00:00Z",
    makeId: (p: string) => `${p}_synthetic_${++n}`,
  };
  const p = await createProposal(
    store,
    {
      ...input,
      walletId: "cash",
      eventType: "refund",
      category: "synthetic",
      counterpartyName: "Synthetic Person",
      note: "synthetic",
      source: "chat",
      initialTxStatus: "unverified",
      benefit: "shared",
      tags: ["synthetic"],
      splitOwedPaise: 1,
      benefitPaise: 2,
      tag: "synthetic",
      occurredAt: "2026-11-03T00:00:00Z",
    },
    runtime,
  );
  const a = await approveProposal(
    store,
    p.id,
    { now: "2026-11-04T02:00:00Z" },
    runtime,
  );
  expect(a.transaction).toMatchObject({
    wallet_id: "cash",
    event_type: "refund",
    source: "chat",
    status: "unverified",
    benefit: "shared",
    tags_json: '["synthetic"]',
    benefit_paise: 2,
    tag: "synthetic",
    occurred_at: p.occurred_at,
    created_at: "2026-11-04T02:00:00Z",
  });
  const audit = await store.read((r) => r.audit.get(a.auditId!));
  expect(JSON.parse(audit!.related_proposal_before!)).toEqual(p);
  const pending = await createProposal(store, input);
  const rejected = await createProposal(store, input);
  await rejectProposal(store, rejected.id);
  await expect(
    batchApproveProposals(store, [pending.id, rejected.id]),
  ).rejects.toThrow();
  expect((await getProposal(store, pending.id))?.status).toBe("pending");
  const batch = await batchApproveProposals(store, [pending.id, pending.id]);
  expect(batch.map((x) => x.alreadyApproved)).toEqual([false, true]);
});
test("proposal_validation_missing_rows_and_corrupt_links_fail_closed", async () => {
  const store = open();
  await expect(
    createProposal(store, {
      ...input,
      initialTxStatus: "invalid" as "ai_checked",
    }),
  ).rejects.toHaveProperty("code", "INVALID_STATUS");
  await expect(
    createProposal(store, { ...input, amountPaise: 1.5 }),
  ).rejects.toThrow();
  await expect(
    createProposal(store, { ...input, splitOwedPaise: -1 }),
  ).rejects.toThrow();
  for (const operation of [approveProposal, rejectProposal])
    await expect(operation(store, "missing")).rejects.toHaveProperty(
      "code",
      "PROPOSAL_NOT_FOUND",
    );
  expect(await getProposal(store, "missing")).toBeNull();
  const p = await createProposal(store, input);
  for (const committed_tx_id of [null, "missing"]) {
    await store.transaction((r) =>
      r.proposals.replace({ ...p, status: "approved", committed_tx_id }),
    );
    await expect(approveProposal(store, p.id)).rejects.toHaveProperty(
      "code",
      "COMMITTED_TRANSACTION_MISSING",
    );
  }
});
test("approval_audit_failure_rolls_back_proposal_and_transaction", async () => {
  const store = open();
  const p = await createProposal(store, input);
  const failing: LedgerStore = {
    ...store,
    transaction: (work) =>
      store.transaction((r) =>
        work({
          ...r,
          audit: {
            ...r.audit,
            async insert() {
              throw new Error("synthetic_audit_failure");
            },
          },
        }),
      ),
  };
  await expect(approveProposal(failing, p.id)).rejects.toThrow(
    "synthetic_audit_failure",
  );
  expect((await getProposal(store, p.id))?.status).toBe("pending");
  expect(await store.read((r) => r.transactions.list())).toEqual([]);
});
