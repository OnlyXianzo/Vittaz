import {
  LedgerError,
  insertCapturedTransactionInUnit,
  writeTransactionAudit,
} from "../ledger/ledger.js";
import type {
  AutoCapturedTransactionInput,
  LedgerRuntime,
} from "../ledger/ledger.js";
import type {
  LedgerStore,
  TransactionEventType,
  TransactionRow,
} from "../ledger/repositories.js";

type NotificationCapture = AutoCapturedTransactionInput & {
  walletId: string;
  eventType: TransactionEventType;
  dedupKey: string | null;
  accountLast4: string | null;
  counterpartyName: string | null;
};

/** Lookup, enrichment, insertion and audit share ONE serialized awaited write unit. */
export function captureDeduplicatedNotification(
  store: LedgerStore,
  input: NotificationCapture,
  windowMs: number,
  runtime: LedgerRuntime,
): Promise<{ deduplicated: boolean; transaction: TransactionRow }> {
  if (!Number.isSafeInteger(windowMs) || windowMs < 0 || windowMs > 86400000)
    throw new LedgerError(
      "Invalid deduplication window",
      "INVALID_DEDUP_WINDOW",
    );
  return store.transaction(async (repos) => {
    const rows = (await repos.transactions.list()).filter(
      (row) =>
        row.source === "notification" && row.wallet_id === input.walletId,
    );
    let existing = input.dedupKey
      ? rows.find((row) => row.dedup_key === input.dedupKey)
      : undefined;
    if (
      existing &&
      (existing.amount_paise !== input.amountPaise ||
        existing.direction !== input.direction ||
        existing.event_type !== input.eventType ||
        (existing.account_last4 !== null &&
          input.accountLast4 !== null &&
          existing.account_last4 !== input.accountLast4))
    )
      throw new LedgerError(
        "Notification reference conflicts with stored event",
        "REFERENCE_CONFLICT",
      );
    if (!existing && input.eventType === "normal") {
      const candidates = rows.filter(
        (row) =>
          row.amount_paise === input.amountPaise &&
          row.direction === input.direction &&
          row.event_type === "normal" &&
          Math.abs(
            Date.parse(row.occurred_at) - Date.parse(input.occurredAt),
          ) <= windowMs &&
          (row.dedup_key === null ||
            input.dedupKey === null ||
            row.dedup_key === input.dedupKey) &&
          (row.account_last4 === null ||
            input.accountLast4 === null ||
            row.account_last4 === input.accountLast4),
      );
      if (candidates.length === 1) existing = candidates[0];
    }
    if (existing) {
      const next = {
        ...existing,
        account_last4: existing.account_last4 ?? input.accountLast4,
        dedup_key: existing.dedup_key ?? input.dedupKey,
        counterparty_name: existing.counterparty_name ?? input.counterpartyName,
      };
      if (
        next.account_last4 !== existing.account_last4 ||
        next.dedup_key !== existing.dedup_key ||
        next.counterparty_name !== existing.counterparty_name
      ) {
        next.updated_at = runtime.now();
        await repos.transactions.replace(next);
        await writeTransactionAudit(
          repos,
          runtime,
          "notification_enriched",
          existing,
          next,
        );
      }
      return { deduplicated: true, transaction: next };
    }
    const { transaction } = await insertCapturedTransactionInUnit(
      repos,
      input,
      runtime,
    );
    return { deduplicated: false, transaction };
  });
}
