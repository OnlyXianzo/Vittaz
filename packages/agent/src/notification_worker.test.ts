import { expect, test, vi } from "vitest";
import { PrivacyRedactor } from "@vittaz/core";
import { openLedgerStore } from "../../storage/src/repositories.js";
import { ValidatedLocalModelTasks } from "./local_tasks.js";
import { AssistantNotificationWorker } from "./notification_worker.js";
const origin = {
  source: "app",
  authenticated: true,
  paired_telegram: false,
} as const;
test("notification_worker_known_zero_local_unknown_one_local_pending_only_no_cloud", async () => {
  const ledger = openLedgerStore(":memory:");
  const runner = {
    run: vi.fn(async () => ({
      draft: { amount_paise: 500, direction: "debit", category: "food" },
    })),
  };
  const worker = new AssistantNotificationWorker({
    ledger,
    local: new ValidatedLocalModelTasks(runner),
    redactor: new PrivacyRedactor([]),
    rules: ledger.rules,
  });
  try {
    const input = {
      appPackage: "com.synthbank.mobile",
      text: "SYNTHBANK: Rs. 5 debited from A/c XX1234",
      postTime: "2026-11-05T00:00:00.000Z",
    };
    expect(await worker.process(input, origin)).toMatchObject({
      status: "processed",
      result: { action: "recorded_transaction", committed: true },
    });
    expect(runner.run).not.toHaveBeenCalled();
    const result = await worker.process(
      { ...input, text: "Synthetic unknown payment layout" },
      origin,
    );
    expect(result.proposal_id).not.toBeNull();
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(await ledger.read((r) => r.transactions.list())).toHaveLength(1);
    expect(await ledger.read((r) => r.proposals.list())).toHaveLength(1);
    const snapshot = await ledger.exportSnapshot();
    expect(
      (await worker.process({ ...input, text: "Your OTP is 123456" }, origin))
        .result?.action,
    ).toBe("dropped_sensitive");
    expect(
      (await worker.process(input, { ...origin, authenticated: false })).status,
    ).toBe("rejected");
    expect(await ledger.exportSnapshot()).toEqual(snapshot);
  } finally {
    await ledger.close();
  }
});

test("notification_worker_rules_null_model_abort_expiry_and_invalid_requests_fail_closed", async () => {
  const ledger = openLedgerStore(":memory:");
  const input = {
    appPackage: "com.synthbank.mobile",
    text: "Synthetic unknown layout",
    postTime: "2026-11-05T00:00:00.000Z",
  };
  const local = new ValidatedLocalModelTasks({
    run: async () => ({ draft: null }),
  });
  const worker = new AssistantNotificationWorker({
    ledger,
    local,
    redactor: new PrivacyRedactor([]),
    rules: ledger.rules,
    runtime: {
      now: () => "2026-11-05T00:00:00.000Z",
      makeId: () => "synthetic_unparsed",
    },
  });
  try {
    expect(
      (await worker.process(input, { ...origin, source: "cli" })).status,
    ).toBe("rejected");
    expect((await worker.process({}, origin)).status).toBe("unavailable");
    const ctrl = new AbortController();
    ctrl.abort();
    expect(
      (await worker.process(input, origin, { signal: ctrl.signal })).status,
    ).toBe("unavailable");
    expect((await worker.process(input, origin)).proposal_id).toBeNull();
    await ledger.rules.set([
      { kind: "message_condition", rule: "allowed_sources", sources: ["cli"] },
    ]);
    const second = new AssistantNotificationWorker({
      ledger,
      local,
      redactor: new PrivacyRedactor([]),
      rules: ledger.rules,
    });
    expect((await second.process(input, origin)).status).toBe("rejected");
    const clock = vi
      .spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValue(30001);
    try {
      expect((await second.process(input, origin)).status).toBe("unavailable");
    } finally {
      clock.mockRestore();
    }
  } finally {
    await ledger.close();
  }
});
