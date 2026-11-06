/**
 * Single source of truth for behaviour.
 *
 * The React Native app does not fork the preview's logic: it imports the same
 * reducer, selectors, synthetic data, money helpers and question answering that
 * the browser preview uses. Only the view layer is rebuilt here.
 *
 * Metro is pointed at `apps/mobile/ui/src` through `metro.config.cjs`
 * (`watchFolders`), and Jest at the same folder through `jest.config.cjs`.
 */

export { createInitialState, reducer } from "../ui/src/state";
export {
  groupByDay,
  selectInbox,
  selectLedger,
  selectPending,
  selectSummary,
} from "../ui/src/selectors";
export { formatPaise, parseAmountToPaise } from "../ui/src/money";
export { answerQuestion, detectQuestion } from "../ui/src/answers";
export { SYNTHETIC_PEOPLE } from "../ui/src/data";
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

// S34: the framework-free domain core, reachable through the same seam the
// screens already use. Additive only — the preview reducer below is unchanged
// until S35 replaces it with core + an expo-sqlite repository adapter.
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
