import {
  defaultLedgerRuntime,
  insertAutoCapturedTransaction,
} from "../ledger/ledger.js";
import type { LedgerRuntime } from "../ledger/ledger.js";
import type { LedgerStore, TransactionRow } from "../ledger/repositories.js";
import { normalizeIndicDigits, parseRupeesToPaise } from "../ledger/money.js";
import { checkSensitiveMessage } from "../privacy/sensitiveFilter.js";
import { scrubOutboundText } from "../privacy/scrubber.js";

export const DEFAULT_ALLOWED_PACKAGES: ReadonlySet<string> = new Set([
  "com.google.android.apps.messaging",
  "com.android.mms",
  "in.synthpay.app",
  "com.synthbank.mobile",
  "in.synthupi.wallet",
]);
export interface IncomingNotification {
  appPackage: string;
  text: unknown;
  postTime: unknown;
}
export interface ProcessNotificationOptions {
  allowedPackages?: ReadonlySet<string>;
  localParserAvailable?: boolean;
}
export interface ProcessNotificationResult {
  action:
    | "dropped_unallowed_app"
    | "dropped_sensitive"
    | "dropped_unmasked_account"
    | "dropped_invalid_notification"
    | "rejected_promotional"
    | "handled_failed_debit"
    | "recorded_reversal"
    | "recorded_refund"
    | "recorded_transaction"
    | "routed_unknown_format";
  committed: boolean;
  reason?: string;
  amountPaise?: number;
  occurredAt?: string;
  transaction?: TransactionRow;
  routedTo?: "local_parser" | "unparsed_list";
  unparsedId?: string;
}
const promo =
  /\b(?:cashback|reward|voucher|promo|coupon|pre-?approved|loan\s+of|apply\s+now|win\s+up\s+to|paayein|jeetein|inam|jackpot|offer\s+valid|use\s+code)\b/iu;
const actualMovement =
  /\b(?:debited\s+from|credited\s+to|debit\s+hu[aei]|credit\s+hu[aei])\b/iu;
const failed =
  /\b(?:failed|declined|unsuccessful|could\s+not\s+be\s+processed|timed\s+out|not\s+debited|fail\s+ho\s+gay[ai]|asafal|nahi\s+kat\s+pay[ai])\b/iu;
const reversal = /\b(?:reversed|reversal|auto-?reversed|wapas\s+credit)\b/iu;
const refund = /\b(?:refund|refunded|refund\s+aay[ai])\b/iu;
const debit =
  /\b(?:debited|debit\s+hu[aei]|paid\s+to|paid\s+(?:rs\.?|inr|₹)|sent\s+(?:rs\.?|inr|₹)|spent\s+on|withdrawn|kat\s+gay[aei])\b/iu;
const credit =
  /\b(?:credited|credit\s+hu[aei]|received\s+from|received\s+(?:rs\.?|inr|₹)|jama\s+hu[aei]|deposited)\b/iu;
const fullAccount =
  /\b(?:A\/c|Acct|Account|Card|Khata)(?:\s*(?:No\.?|number))?[\s:#-]*\d(?:[ -]?\d){7,}(?!\d)/iu;
const maskedAccount = /(?:[Xx*#]{2,}|ending\s+(?:in|with)\s+)(\d{4})(?!\d)/iu;
const amountPattern =
  /(?:(?:INR|Rs\.?|₹|रु\.?)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:rupaye|rs\.?))(?![\p{L}\p{M}\p{N}_.])/iu;
const referencePattern =
  /\b(?:UPI(?:\s*(?:Ref(?:\s*No\.?)?|Txn\s*Id))?|UTR|RRN)[\s:#/-]*(\d{10,16})(?!\d)/iu;
const toName = /\b(?:to|at|towards)\s+(?:VPA\s+)?([A-Za-z0-9._@-]{2,40})\b/iu;
const fromName = /\b(?:from|by)\s+(?:VPA\s+)?([A-Za-z0-9._@-]{2,40})\b/iu;

function normalizePostTime(value: unknown): string | null {
  if (typeof value === "number") {
    if (
      !Number.isSafeInteger(value) ||
      value < -62135596800000 ||
      value > 253402300799999
    )
      return null;
    return new Date(value).toISOString();
  }
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  )
    return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const iso = date.toISOString();
  return iso === (value.includes(".") ? value : value.replace("Z", ".000Z"))
    ? iso
    : null;
}
const invalid = (): ProcessNotificationResult => ({
  action: "dropped_invalid_notification",
  committed: false,
});

/** User-authorized notification ingress. No provider/logger capability is accepted. */
export async function processNotification(
  store: LedgerStore,
  notification: IncomingNotification | null | undefined,
  options: ProcessNotificationOptions = {},
  runtime: LedgerRuntime = defaultLedgerRuntime,
): Promise<ProcessNotificationResult> {
  let appPackage: string | undefined;
  try {
    appPackage = notification?.appPackage;
  } catch {
    appPackage = undefined;
  }
  if (
    !notification ||
    appPackage === undefined ||
    !(options.allowedPackages ?? DEFAULT_ALLOWED_PACKAGES).has(appPackage)
  )
    return { action: "dropped_unallowed_app", committed: false };
  let raw: unknown;
  try {
    raw = notification.text;
  } catch {
    return invalid();
  }
  if (typeof raw !== "string")
    return {
      action: "dropped_sensitive",
      committed: false,
      reason: "invalid_input",
    };
  if (raw.length > 16000) return invalid();
  const check = checkSensitiveMessage(raw);
  if (check.sensitive)
    return {
      action: "dropped_sensitive",
      committed: false,
      reason: check.reason,
    };
  const text = normalizeIndicDigits(raw.normalize("NFKC")).replace(
    /\p{Cf}/gu,
    "",
  );
  if (fullAccount.test(text))
    return { action: "dropped_unmasked_account", committed: false };
  if (promo.test(text) && !actualMovement.test(text))
    return { action: "rejected_promotional", committed: false };
  let occurredAt: string | null;
  try {
    occurredAt = normalizePostTime(notification.postTime);
  } catch {
    return invalid();
  }
  if (occurredAt === null) return invalid();
  const match = amountPattern.exec(text);
  const amountText = match ? (match[1] ?? match[2]) : undefined;
  let amountPaise: number | null = null;
  if (amountText !== undefined) {
    try {
      amountPaise = parseRupeesToPaise(amountText);
    } catch {
      return invalid();
    }
    if (amountPaise === 0) return invalid();
  }
  if (failed.test(text))
    return {
      action: "handled_failed_debit",
      committed: false,
      occurredAt,
      ...(amountPaise === null ? {} : { amountPaise }),
    };
  const isReversal = reversal.test(text);
  const isRefund = refund.test(text);
  const isDebit = debit.test(text);
  const isCredit = credit.test(text);
  if (
    amountPaise !== null &&
    (isReversal || isRefund || isDebit !== isCredit)
  ) {
    const eventType = isReversal ? "reversal" : isRefund ? "refund" : "normal";
    const direction = eventType !== "normal" || isCredit ? "credit" : "debit";
    const candidate =
      (direction === "debit" ? toName : fromName).exec(text)?.[1] ?? null;
    const counterpartyName =
      candidate && !/^(?:A|Acct|Account|Khata)$/iu.test(candidate)
        ? candidate
        : null;
    const ref = referencePattern.exec(text)?.[1] ?? null;
    const dedupKey = ref
      ? eventType === "normal"
        ? `utr:${ref}:${direction}:${amountPaise}`
        : `${eventType}:${ref}:${amountPaise}`
      : null;
    const { transaction } = await insertAutoCapturedTransaction(
      store,
      {
        amountPaise,
        direction,
        eventType,
        category: eventType === "normal" ? "uncategorized" : eventType,
        counterpartyName,
        accountLast4: maskedAccount.exec(text)?.[1] ?? null,
        dedupKey,
        source: "notification",
        occurredAt,
      },
      runtime,
    );
    return {
      action: isReversal
        ? "recorded_reversal"
        : isRefund
          ? "recorded_refund"
          : "recorded_transaction",
      committed: true,
      transaction,
    };
  }
  const routedTo = options.localParserAvailable
    ? "local_parser"
    : "unparsed_list";
  const unparsedId = runtime.makeId("unp");
  await store.transaction((r) =>
    r.unparsed_messages.insert({
      id: unparsedId,
      app_package: appPackage,
      sanitized_text: scrubOutboundText(raw).replace(
        /\b\d{6,}\b/gu,
        "[DIGITS]",
      ),
      post_time: occurredAt,
      reason: "unknown_format",
      routed_to: routedTo,
      created_at: runtime.now(),
    }),
  );
  return {
    action: "routed_unknown_format",
    committed: false,
    routedTo,
    unparsedId,
  };
}
