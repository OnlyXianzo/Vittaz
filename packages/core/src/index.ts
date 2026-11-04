// @vittaz/core — deterministic finance logic, schema, privacy guards
// no UI, no AI frameworks

export const VERSION = "0.0.1" as const;

export {
  MoneyValidationError,
  assertIntegerPaise,
  assertNonNegativePaise,
  assertPositivePaise,
  formatPaiseToRupees,
  normalizeIndicDigits,
  parseRupeesToPaise,
  sumPaise,
} from "./ledger/money.js";
