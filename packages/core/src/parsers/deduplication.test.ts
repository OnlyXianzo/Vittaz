import { afterEach, expect, test } from "vitest";
import { openLedgerStore } from "../../../storage/src/repositories.js";
import { processNotification } from "./notificationParser.js";
import {
  createManualTransaction,
  insertAutoCapturedTransaction,
} from "../ledger/ledger.js";
import { undoAuditEntry } from "../ledger/audit.js";
import { getWalletSummary } from "../ledger/wallet.js";
import type { LedgerStore } from "../ledger/repositories.js";
const stores: ReturnType<typeof openLedgerStore>[] = [];
function open() {
  const s = openLedgerStore(":memory:");
  stores.push(s);
  return s;
}
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
});
const epoch = Date.parse("2026-11-04T13:10:00.000Z");
const alert = (text: string, seconds = 0) => ({
  appPackage: "in.synthpay.app",
  text,
  postTime: epoch + seconds * 1000,
});

test("baseline_3_5_sms_and_app_alert_become_one_entry_with_atomic_audited_enrichment", async () => {
  const store = open();
  const original = await processNotification(
    store,
    alert("Paid ₹340 to SynthBakery"),
  );
  const sms = alert(
    "Rs 340 debited from A/c XX1234 to synthbakery@okbank UPI Ref 630890909090",
    9,
  );
  const duplicate = await processNotification(store, sms);
  expect(duplicate).toMatchObject({
    action: "deduplicated",
    committed: false,
    transaction: {
      id: original.transaction!.id,
      account_last4: "1234",
      dedup_key: "utr:630890909090:debit:34000",
    },
  });
  expect(await store.read((r) => r.transactions.list())).toHaveLength(1);
  expect(await store.read((r) => r.audit.list())).toHaveLength(2);
  await processNotification(store, sms);
  expect(await store.read((r) => r.audit.list())).toHaveLength(2);
  expect((await getWalletSummary(store, "bank_default")).balancePaise).toBe(
    -34000,
  );
  const enrichment = (await store.read((r) => r.audit.list())).find(
    (row) => row.action === "notification_enriched",
  )!;
  await undoAuditEntry(store, enrichment.id);
  expect(
    await store.read((r) => r.transactions.get(original.transaction!.id)),
  ).toEqual(original.transaction);
});

test("notification_reference_replays_are_deduped_outside_time_window_and_events_separated", async () => {
  const store = open();
  for (const text of [
    "Rs 800 reversed to A/c XX1234 UPI Ref 630844445555",
    "Refund INR 800 credited to A/c XX1234 UPI Ref 630844445555",
    "Rs 800 credited to A/c XX1234 UPI Ref 630844445555",
  ]) {
    expect((await processNotification(store, alert(text))).committed).toBe(
      true,
    );
    expect((await processNotification(store, alert(text, 86400))).action).toBe(
      "deduplicated",
    );
  }
  expect(await store.read((r) => r.transactions.list())).toHaveLength(3);
});

test("notification_dedup_preserves_distinct_references_accounts_directions_and_manual_rows", async () => {
  const store = open();
  await createManualTransaction(store, {
    walletId: "bank_default",
    amountPaise: 34000,
    direction: "debit",
    occurredAt: new Date(epoch).toISOString(),
  });
  await insertAutoCapturedTransaction(store, {
    amountPaise: 34000,
    direction: "debit",
    source: "excel_import",
    occurredAt: new Date(epoch).toISOString(),
  });
  for (const text of [
    "Rs 340 debited from A/c XX1234 UPI Ref 630811111111",
    "Rs 340 debited from A/c XX1234 UPI Ref 630822222222",
    "Rs 340 debited from A/c XX5678",
    "Rs 340 credited to A/c XX1234",
  ])
    expect((await processNotification(store, alert(text))).committed).toBe(
      true,
    );
  expect(await store.read((r) => r.transactions.list())).toHaveLength(6);
});

test("notification_dedup_time_window_is_inclusive_and_configurable", async () => {
  for (const [seconds, expected] of [
    [300, "deduplicated"],
    [301, "recorded_transaction"],
    [-300, "deduplicated"],
  ] as const) {
    const store = open();
    await processNotification(store, alert("Paid ₹50 to SynthShop"));
    expect(
      (
        await processNotification(
          store,
          alert("Rs 50 debited from A/c XX1234", seconds),
        )
      ).action,
    ).toBe(expected);
  }
  const store = open();
  await processNotification(store, alert("Paid ₹50 to SynthShop"));
  expect(
    (
      await processNotification(store, alert("Paid ₹50 to SynthShop", 1), {
        dedupWindowMs: 0,
      })
    ).committed,
  ).toBe(true);
  for (const value of [-1, NaN, Infinity, 0.1, 86400001])
    await expect(
      processNotification(store, alert("Paid ₹50 to SynthShop"), {
        dedupWindowMs: value,
      }),
    ).rejects.toHaveProperty("code", "INVALID_DEDUP_WINDOW");
});

test("notification_concurrent_duplicate_captures_commit_once", async () => {
  for (const text of [
    "Paid ₹340 to SynthBakery",
    "Rs 340 debited from A/c XX1234 UPI Ref 630890909090",
  ]) {
    const store = open();
    const results = await Promise.all([
      processNotification(store, alert(text)),
      processNotification(store, alert(text)),
    ]);
    expect(results.filter((result) => result.committed)).toHaveLength(1);
    expect(await store.read((r) => r.transactions.list())).toHaveLength(1);
    expect(await store.read((r) => r.audit.list())).toHaveLength(1);
  }
});

test("notification_conflicting_reference_fails_closed_and_ambiguous_fallback_keeps_new_payment", async () => {
  const store = open();
  await processNotification(
    store,
    alert("Rs 340 debited from A/c XX1234 UPI Ref 630890909090"),
  );
  await expect(
    processNotification(
      store,
      alert("Rs 340 debited from A/c XX5678 UPI Ref 630890909090"),
    ),
  ).rejects.toHaveProperty("code", "REFERENCE_CONFLICT");
  expect(await store.read((r) => r.transactions.list())).toHaveLength(1);
  await processNotification(
    store,
    alert("Rs 340 debited from A/c XX1234 UPI Ref 630890909091"),
  );
  expect(
    (await processNotification(store, alert("Paid ₹340 to SynthBakery")))
      .committed,
  ).toBe(true);
  expect(await store.read((r) => r.transactions.list())).toHaveLength(3);
});

test("notification_enrichment_and_new_capture_rollback_when_audit_fails", async () => {
  const store = open();
  const first = await processNotification(
    store,
    alert("Paid ₹340 to SynthBakery"),
  );
  const failing: LedgerStore = {
    close: () => store.close(),
    read: (work) => store.read(work),
    transaction: (work) =>
      store.transaction((r) =>
        work({
          ...r,
          audit: {
            ...r.audit,
            insert: async () => {
              throw new Error("synthetic_audit_failure");
            },
          },
        }),
      ),
  };
  await expect(
    processNotification(
      failing,
      alert("Rs 340 debited from A/c XX1234 UPI Ref 630890909090"),
    ),
  ).rejects.toThrow("synthetic_audit_failure");
  expect(
    await store.read((r) => r.transactions.get(first.transaction!.id)),
  ).toEqual(first.transaction);
  await expect(
    processNotification(failing, alert("Rs 999 debited")),
  ).rejects.toThrow("synthetic_audit_failure");
  expect(await store.read((r) => r.transactions.list())).toHaveLength(1);
});

test("notification_exact_reference_enriches_missing_account_and_name_only", async () => {
  const store = open();
  const first = await processNotification(
    store,
    alert("Rs 12 debited UPI Ref 630811111111"),
  );
  const second = await processNotification(
    store,
    alert(
      "Rs 12 debited from A/c XX1234 to SynthShop UPI Ref 630811111111",
      500,
    ),
  );
  expect(second.transaction).toMatchObject({
    id: first.transaction!.id,
    account_last4: "1234",
    counterparty_name: "SynthShop",
  });
  expect(await store.read((r) => r.audit.list())).toHaveLength(2);
});

test("notification_corrupt_reference_identity_is_not_silently_deduplicated", async () => {
  for (const patch of [
    { amount_paise: 90000 },
    { direction: "credit" as const },
    { event_type: "refund" as const },
  ]) {
    const store = open();
    const first = await processNotification(
      store,
      alert("Rs 12 debited UPI Ref 630811111111"),
    );
    await store.transaction((r) =>
      r.transactions.replace({ ...first.transaction!, ...patch }),
    );
    await expect(
      processNotification(store, alert("Rs 12 debited UPI Ref 630811111111")),
    ).rejects.toHaveProperty("code", "REFERENCE_CONFLICT");
    expect(await store.read((r) => r.transactions.list())).toHaveLength(1);
  }
});
