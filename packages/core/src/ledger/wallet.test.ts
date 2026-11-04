import { afterEach, expect, test } from "vitest";
import { openLedgerStore } from "../../../storage/src/repositories.js";
import { createManualTransaction } from "./ledger.js";
import { createProposal, approveProposal } from "./approval.js";
import { updateTransaction, undoAuditEntry } from "./audit.js";
import {
  createWallet,
  getWalletSummary,
  setWalletOpeningBalance,
} from "./wallet.js";
const stores: ReturnType<typeof openLedgerStore>[] = [];
function open() {
  const s = openLedgerStore(":memory:");
  stores.push(s);
  return s;
}
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
});

test("baseline_1_6_wallet_opening_plus_in_minus_out_excludes_other_wallet_and_pending", async () => {
  const s = open();
  await setWalletOpeningBalance(s, "cash", 500000);
  for (const amountPaise of [200000, 35050])
    await createManualTransaction(s, { amountPaise, direction: "credit" });
  for (const amountPaise of [42075, 110000])
    await createManualTransaction(s, { amountPaise, direction: "debit" });
  await createManualTransaction(s, {
    walletId: "bank_default",
    amountPaise: 999900,
    direction: "debit",
  });
  await createProposal(s, {
    walletId: "cash",
    amountPaise: 88800,
    direction: "debit",
  });
  await createManualTransaction(s, {
    amountPaise: 100,
    direction: "debit",
    eventType: "refund",
  });
  await createManualTransaction(s, {
    amountPaise: 200,
    direction: "debit",
    eventType: "reversal",
  });
  expect(await getWalletSummary(s)).toEqual({
    walletId: "cash",
    openingBalancePaise: 500000,
    cashInPaise: 235050,
    cashOutPaise: 152075,
    balancePaise: 582975,
  });
});
test("baseline_1_5_undo_restores_wallet_summary_exactly", async () => {
  const s = open();
  await setWalletOpeningBalance(s, "cash", 100000);
  const original = await createManualTransaction(s, {
    amountPaise: 30000,
    direction: "debit",
  });
  const before = await getWalletSummary(s);
  const edit = await updateTransaction(s, original.transaction.id, {
    amountPaise: 55000,
  });
  expect((await getWalletSummary(s)).balancePaise).toBe(45000);
  await undoAuditEntry(s, edit.auditId);
  expect(await getWalletSummary(s)).toEqual(before);
  const p = await createProposal(s, {
    walletId: "cash",
    amountPaise: 15000,
    direction: "debit",
  });
  const approved = await approveProposal(s, p.id);
  await undoAuditEntry(s, approved.auditId!);
  expect(await getWalletSummary(s)).toEqual(before);
  await undoAuditEntry(s, original.auditId);
  expect((await getWalletSummary(s)).balancePaise).toBe(100000);
});
test("wallet_create_cash_bank_upi_and_guard_money_and_missing_accounts", async () => {
  const s = open();
  let n = 0;
  const runtime = {
    now: () => "2026-11-04T00:00:00Z",
    makeId: (p: string) => `${p}_synthetic_${++n}`,
  };
  for (const kind of ["cash", "bank", "upi"] as const) {
    const w = await createWallet(
      s,
      { name: `Synthetic ${kind}`, kind },
      runtime,
    );
    expect((await getWalletSummary(s, w.id)).balancePaise).toBe(0);
  }
  const w = await createWallet(s, {
    name: "Synthetic Bank",
    kind: "bank",
    openingBalancePaise: -100,
  });
  expect((await getWalletSummary(s, w.id)).balancePaise).toBe(-100);
  await expect(createWallet(s, { name: "", kind: "cash" })).rejects.toThrow();
  await expect(
    createWallet(s, { name: "Synthetic Invalid", kind: "invalid" as "cash" }),
  ).rejects.toThrow();
  await expect(setWalletOpeningBalance(s, "cash", -0)).rejects.toThrow();
  await expect(setWalletOpeningBalance(s, "missing", 0)).rejects.toThrow();
  await expect(getWalletSummary(s, "missing")).rejects.toThrow();
  await setWalletOpeningBalance(s, "cash", Number.MAX_SAFE_INTEGER);
  await createManualTransaction(s, { amountPaise: 1, direction: "credit" });
  await expect(getWalletSummary(s)).rejects.toThrow();
  await createManualTransaction(s, {
    amountPaise: Number.MAX_SAFE_INTEGER,
    direction: "credit",
  });
  await expect(getWalletSummary(s)).rejects.toThrow();
});
