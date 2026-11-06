/**
 * Single source of truth for behaviour.
 *
 * This module shares only UI model types and presentation-only money formatting
 * with the browser preview. Native ledger state and selectors come from core +
 * the Expo SQLite adapter; the preview reducer and synthetic rows are not used.
 *
 * Metro watches `apps/mobile/ui/src` for its display model types and
 * `packages/core/src` for the framework-free domain core.
 */

export {
  groupByDay,
  selectInbox,
  selectLedger,
  selectPending,
  selectSummary,
} from "./selectors";
export { formatPaise, parseAmountToPaise } from "../ui/src/money";
export type {
  Action,
  AppState,
  ChatStep,
  Direction,
  InboxFilter,
  LedgerFilter,
  Mode,
  ModelId,
  Screen,
  Transaction,
} from "../ui/src/types";

// Framework-free domain core re-exports. Ledger mutations go through core and
// the Expo SQLite repository adapter; no preview reducer is exported here.
export {
  CORE_VERSION,
  MoneyValidationError,
  assertIntegerPaise,
  assertNonNegativePaise,
  assertPositivePaise,
  formatPaiseToRupees,
  normalizeIndicDigits,
  parseRupeesToPaise,
  sumPaise,
} from "./core";
