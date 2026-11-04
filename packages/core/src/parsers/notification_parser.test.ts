import { afterEach, expect, test, vi } from "vitest";
import { openLedgerStore } from "../../../storage/src/repositories.js";
import { processNotification } from "./notificationParser.js";
const stores: ReturnType<typeof openLedgerStore>[] = [];
function open() {
  const store = openLedgerStore(":memory:");
  stores.push(store);
  return store;
}
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});
const postTime = "2026-11-04T09:12:00.000Z";
const notification = (text: unknown, time: unknown = postTime) => ({
  appPackage: "com.google.android.apps.messaging",
  text,
  postTime: time,
});

test("privacy_baseline_3_1_unallowed_app_dropped_before_text_or_time_read", async () => {
  const store = open();
  const read = vi.fn(() => {
    throw new Error("must_not_read");
  });
  for (const value of [
    null,
    undefined,
    {
      appPackage: "com.social.chatapp",
      get text() {
        return read();
      },
      get postTime() {
        return read();
      },
    },
  ]) {
    expect((await processNotification(store, value)).action).toBe(
      "dropped_unallowed_app",
    );
  }
  expect(read).not.toHaveBeenCalled();
});

test("privacy_baseline_3_2_sensitive_unmasked_promotional_inputs_leave_no_rows", async () => {
  const store = open();
  const timeRead = vi.fn(() => {
    throw new Error("must_not_read");
  });
  for (const text of [
    "OTP 112233",
    "UPI PIN4455",
    "CVV912",
    "password synthetic_marker",
    "do not share",
    "किसी को मत बताएं",
    null,
    "",
  ]) {
    const result = await processNotification(store, {
      appPackage: "in.synthpay.app",
      text,
      get postTime() {
        return timeRead();
      },
    });
    expect(result.action).toBe("dropped_sensitive");
    expect(JSON.stringify(result)).not.toMatch(
      /112233|4455|912|synthetic_marker/,
    );
  }
  expect(timeRead).not.toHaveBeenCalled();
  expect(
    (
      await processNotification(
        store,
        notification("Rs 300 debited from Account 00112233445566"),
      )
    ).action,
  ).toBe("dropped_unmasked_account");
  for (const text of [
    "Get Rs 500 cashback on your next payment",
    "Pre-approved loan of Rs 50000 apply now",
    "Win INR 1000 reward",
  ])
    expect((await processNotification(store, notification(text))).action).toBe(
      "rejected_promotional",
    );
  for (const rows of await store.read(async (r) => [
    await r.transactions.list(),
    await r.audit.list(),
    await r.unparsed_messages.list(),
  ]))
    expect(rows).toEqual([]);
});

test("baseline_3_3_debit_credit_masks_exact_money_and_post_timestamp", async () => {
  const store = open();
  const debit = await processNotification(
    store,
    notification(
      "SYNTHBANK: Rs. 450.25 debited from A/c XX1234 to synthchai@okbank UPI Ref 630811112222",
    ),
  );
  expect(debit).toMatchObject({
    action: "recorded_transaction",
    committed: true,
    transaction: {
      amount_paise: 45025,
      direction: "debit",
      account_last4: "1234",
      occurred_at: postTime,
      status: "unverified",
      source: "notification",
      counterparty_name: "synthchai@okbank",
    },
  });
  const credit = await processNotification(
    store,
    notification(
      "INR 1200 credited to A/c XX1234 from SynthPerson",
      Date.parse(postTime),
    ),
  );
  expect(credit.transaction).toMatchObject({
    amount_paise: 120000,
    direction: "credit",
    counterparty_name: "SynthPerson",
    occurred_at: postTime,
  });
  expect(await store.read((r) => r.audit.list())).toHaveLength(2);
  expect(
    (
      await processNotification(
        store,
        notification("debit hua INR ५०० from A/c XX1234"),
      )
    ).transaction?.amount_paise,
  ).toBe(50000);
});

test("baseline_3_4_failed_refund_and_reversal_never_create_normal_debits", async () => {
  const store = open();
  expect(
    await processNotification(
      store,
      notification("Payment of ₹800.00 from A/c XX1234 failed"),
    ),
  ).toMatchObject({
    action: "handled_failed_debit",
    committed: false,
    amountPaise: 80000,
  });
  expect(
    (await processNotification(store, notification("Payment failed"))).action,
  ).toBe("handled_failed_debit");
  expect(
    await processNotification(
      store,
      notification("Rs 800 reversed to A/c XX1234 UPI Ref 630844445555"),
    ),
  ).toMatchObject({
    action: "recorded_reversal",
    transaction: { event_type: "reversal", direction: "credit" },
  });
  expect(
    await processNotification(
      store,
      notification("Refund of INR 299 credited to A/c XX1234 from SynthBooks"),
    ),
  ).toMatchObject({
    action: "recorded_refund",
    transaction: { event_type: "refund", direction: "credit" },
  });
  expect(
    (await store.read((r) => r.transactions.list())).every(
      (row) => row.direction === "credit",
    ),
  ).toBe(true);
});

test("privacy_unknown_and_ambiguous_formats_are_sanitized_local_queue_only", async () => {
  const store = open();
  const one = await processNotification(
    store,
    notification("Statement ready for 00112233445566 synth@okbank"),
    { localParserAvailable: true },
  );
  expect(one).toMatchObject({
    action: "routed_unknown_format",
    routedTo: "local_parser",
    committed: false,
  });
  expect(
    (
      await processNotification(
        store,
        notification("Rs 100 debited and credited"),
      )
    ).routedTo,
  ).toBe("unparsed_list");
  const rows = await store.read((r) => r.unparsed_messages.list());
  expect(rows).toHaveLength(2);
  expect(JSON.stringify(rows)).not.toMatch(/00112233445566|synth@okbank/);
  expect(await store.read((r) => r.transactions.list())).toEqual([]);
});

test("privacy_notification_invalid_time_text_size_and_amount_fail_closed", async () => {
  const store = open();
  for (const time of [
    "secret_time_marker",
    "2026-02-30T00:00:00Z",
    "2026-11-04",
    NaN,
    Infinity,
    {},
    9e15,
    0.5,
  ]) {
    const result = await processNotification(
      store,
      notification("Rs 450 debited", time),
    );
    expect(result.action).toBe("dropped_invalid_notification");
    expect(JSON.stringify(result)).not.toContain("secret_time_marker");
  }
  expect(
    (
      await processNotification(
        store,
        notification("Rs 450 debited", "2026-11-04T09:12:00Z"),
      )
    ).transaction?.occurred_at,
  ).toBe(postTime);
  for (const text of [
    "Rs 0 debited",
    "Rs 9007199254740992 debited",
    "x".repeat(16001),
  ])
    expect((await processNotification(store, notification(text))).action).toBe(
      "dropped_invalid_notification",
    );
  const getter = {
    appPackage: "in.synthpay.app",
    get text() {
      throw new Error("synthetic_private_marker");
    },
    postTime,
  };
  expect((await processNotification(store, getter)).action).toBe(
    "dropped_invalid_notification",
  );
});

test("notification_custom_allowlist_no_reference_and_counterparty_fallbacks", async () => {
  const store = open();
  expect(
    (
      await processNotification(
        store,
        {
          ...notification("450 rupaye paid to SynthShop"),
          appPackage: "synthetic.custom",
        },
        { allowedPackages: new Set(["synthetic.custom"]) },
      )
    ).transaction,
  ).toMatchObject({
    amount_paise: 45000,
    counterparty_name: "SynthShop",
    dedup_key: null,
  });
  expect(
    (
      await processNotification(
        store,
        notification("INR 10 debited from A/c XX1234"),
      )
    ).transaction?.counterparty_name,
  ).toBeNull();
  expect(
    (
      await processNotification(
        store,
        notification("INR 20 received from Account XX1234"),
      )
    ).transaction?.counterparty_name,
  ).toBeNull();
  expect(
    (await processNotification(store, notification("INR 30 credited")))
      .transaction?.account_last4,
  ).toBeNull();
  expect(
    (
      await processNotification(
        store,
        notification(
          "Rs 40 debited from A/c XX1234 cashback credited to rewards",
        ),
      )
    ).action,
  ).toBe("routed_unknown_format");
});

test("privacy_notification_snapshots_package_once_and_catches_unreadable_metadata", async () => {
  const store = open();
  const app = vi.fn(() => "in.synthpay.app");
  await processNotification(store, {
    get appPackage() {
      return app();
    },
    text: "Statement ready",
    postTime,
  });
  expect(app).toHaveBeenCalledTimes(1);
  const blocked = {
    get appPackage(): string {
      throw new Error("private_synthetic_package");
    },
    get text() {
      throw new Error("must_not_read");
    },
    postTime,
  };
  expect((await processNotification(store, blocked)).action).toBe(
    "dropped_unallowed_app",
  );
  expect(
    (
      await processNotification(store, {
        ...notification("Rs 450 debited"),
        get postTime() {
          throw new Error("private_synthetic_time");
        },
      })
    ).action,
  ).toBe("dropped_invalid_notification");
  for (const time of ["2026-99-04T00:00:00Z", -9e15])
    expect(
      (await processNotification(store, notification("Rs 450 debited", time)))
        .action,
    ).toBe("dropped_invalid_notification");
  for (const text of [
    "Rs 300 debited from Account 0011 2233 4455 66",
    "Rs 300 debited from Card ００１１２２３３４４５５６６",
  ])
    expect((await processNotification(store, notification(text))).action).toBe(
      "dropped_unmasked_account",
    );
});
