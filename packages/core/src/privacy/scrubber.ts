import { normalizeIndicDigits } from "../ledger/money.js";

/** Outbound-copy identifier reduction, NOT complete anonymization or a secret filter. */
export function scrubOutboundText(input: unknown): string {
  if (typeof input !== "string" || input.length === 0) return "";
  return normalizeIndicDigits(input.normalize("NFKC"))
    .replace(/\p{Cf}/gu, "")
    .replace(/\bupi:\/\/[^\s"'<>]+/giu, "[UPI_URI]")
    .replace(
      /\b(?:UPI(?:\s*(?:Ref(?:\s*No\.?)?|Txn\s*Id))?|UTR|RRN)[\s:#/-]*[A-Za-z0-9][A-Za-z0-9-]{7,}(?![\p{L}\p{M}\p{N}_])/giu,
      "[UPI_REF]",
    )
    .replace(/[A-Za-z0-9._-]+@[A-Za-z][A-Za-z0-9.-]{1,64}/gu, "[UPI_VPA]")
    .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/giu, "[IFSC]")
    .replace(
      /\b(?:A\/c|Acct|Account|Card|Khata)(?:\s*(?:No\.?|number))?[\s:#-]*[Xx*#\d][Xx*#\d -]{1,30}[Xx*#\d](?![\p{L}\p{M}\p{N}_])/giu,
      "[ACCOUNT]",
    )
    .replace(
      /(?<![\p{L}\p{M}\p{N}_])[Xx*#]{2,}\d{3,}(?![\p{L}\p{M}\p{N}_])/gu,
      "[ACCOUNT]",
    )
    .replace(
      /(?<![\p{L}\p{M}\p{N}_])(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?![\p{L}\p{M}\p{N}_])/gu,
      "[PHONE]",
    )
    .replace(
      /(?<![\p{L}\p{M}\p{N}_])\d(?:[ -]?\d){8,}(?![\p{L}\p{M}\p{N}_])/gu,
      "[REDACTED_DIGITS]",
    );
}
