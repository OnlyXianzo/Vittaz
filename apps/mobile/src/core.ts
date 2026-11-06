/**
 * Bridge to the framework-free domain core (S34).
 *
 * `packages/core` is the single source of truth for money, ledger rules and
 * privacy guards. The app imports it as source through Metro `watchFolders`,
 * Jest `moduleNameMapper` and a tsconfig path, so there is exactly one copy of
 * the logic and no build step or published package in between.
 *
 * This module only re-exports. It holds no behaviour of its own.
 *
 * Native ledger mutations call core use cases through the Expo SQLite
 * LedgerStore. Presentation state stays local to the native provider; no demo
 * reducer or seeded preview rows are used. Core use cases persist user actions
 * through the adapter, while AI features remain disabled until wired.
 */

export {
  VERSION as CORE_VERSION,
  MoneyValidationError,
  assertIntegerPaise,
  assertNonNegativePaise,
  assertPositivePaise,
  formatPaiseToRupees,
  normalizeIndicDigits,
  parseRupeesToPaise,
  sumPaise,
} from "@vittaz/core";
