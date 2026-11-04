import { assertIntegerPaise, assertNonNegativePaise } from "./money.js";
import { defaultLedgerRuntime } from "./ledger.js";
import type { LedgerRuntime } from "./ledger.js";
export interface DailyAllowanceInput {
  budgetPaise: number;
  spentPaise: number;
  billsDuePaise: number;
  dateStr?: string;
}
export interface DailyAllowanceResult {
  dateStr: string;
  daysInMonth: number;
  daysLeft: number;
  disposablePaise: number;
  dailyAllowancePaise: number;
}
export function getDaysInMonth(year: number, monthOneBased: number): number {
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    !Number.isInteger(monthOneBased) ||
    monthOneBased < 1 ||
    monthOneBased > 12
  )
    throw new Error(`Invalid year/month: ${year}-${monthOneBased}`);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    monthOneBased - 1
  ]!;
}
function indianDate(clock: Pick<LedgerRuntime, "now">): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(clock.now()))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function calculateDailyAllowance(
  input: DailyAllowanceInput,
  clock: Pick<LedgerRuntime, "now"> = defaultLedgerRuntime,
): DailyAllowanceResult {
  assertNonNegativePaise(input.budgetPaise, "budgetPaise");
  assertNonNegativePaise(input.spentPaise, "spentPaise");
  assertNonNegativePaise(input.billsDuePaise, "billsDuePaise");
  const dateStr = input.dateStr ?? indianDate(clock);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new Error("dateStr must be YYYY-MM-DD");
  const daysInMonth = getDaysInMonth(Number(match[1]), Number(match[2]));
  const day = Number(match[3]);
  if (day < 1 || day > daysInMonth) throw new Error("Invalid day for month");
  const daysLeft = daysInMonth - day + 1;
  const disposable =
    BigInt(input.budgetPaise) -
    BigInt(input.spentPaise) -
    BigInt(input.billsDuePaise);
  const disposablePaise = assertIntegerPaise(
    Number(disposable),
    "disposablePaise",
  );
  const dailyAllowancePaise = assertIntegerPaise(
    Number(disposable / BigInt(daysLeft)),
    "dailyAllowancePaise",
  );
  return {
    dateStr,
    daysInMonth,
    daysLeft,
    disposablePaise,
    dailyAllowancePaise,
  };
}
