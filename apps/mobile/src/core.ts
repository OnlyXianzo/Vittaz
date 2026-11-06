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
 * NOTE (S35): the screens still run the preview demo reducer from
 * `../ui/src/state`. Swapping that reducer for core + an `expo-sqlite`
 * repository adapter is S35. Nothing here writes to a database.
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
