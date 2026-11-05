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

export { createInitialState, reducer } from "../../src/state";
export {
  groupByDay,
  selectInbox,
  selectLedger,
  selectPending,
  selectSummary,
} from "../../src/selectors";
export { formatPaise, parseAmountToPaise } from "../../src/money";
export { answerQuestion, detectQuestion } from "../../src/answers";
export { SYNTHETIC_PEOPLE } from "../../src/data";
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
} from "../../src/types";
