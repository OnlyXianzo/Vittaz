import { expect, test } from "vitest";
import { calculateDailyAllowance, getDaysInMonth } from "./allowance.js";
const base = {
  budgetPaise: 3000000,
  spentPaise: 300000,
  billsDuePaise: 0,
  dateStr: "2026-11-04",
};

test("baseline_1_8_allowance_handworked_month_end_leap_and_overspending", () => {
  expect(calculateDailyAllowance(base)).toEqual({
    dateStr: "2026-11-04",
    daysInMonth: 30,
    daysLeft: 27,
    disposablePaise: 2700000,
    dailyAllowancePaise: 100000,
  });
  for (const [dateStr, budgetPaise, spentPaise, billsDuePaise, expected] of [
    ["2026-11-30", 2500000, 1825050, 400000, 274950],
    ["2026-12-31", 1000000, 850000, 50000, 100000],
    ["2028-02-29", 500000, 400000, 20000, 80000],
    ["2026-11-21", 1000000, 900000, 300000, -20000],
  ] as const) {
    expect(
      calculateDailyAllowance({
        dateStr,
        budgetPaise,
        spentPaise,
        billsDuePaise,
      }).dailyAllowancePaise,
    ).toBe(expected);
  }
  expect(
    calculateDailyAllowance({
      ...base,
      budgetPaise: 100,
      spentPaise: 0,
      dateStr: "2026-11-28",
    }).dailyAllowancePaise,
  ).toBe(33);
  expect(
    Object.is(
      calculateDailyAllowance({ ...base, budgetPaise: 0, spentPaise: 1 })
        .dailyAllowancePaise,
      -0,
    ),
  ).toBe(false);
});
test("allowance_gregorian_century_rules_and_invalid_dates", () => {
  for (const [year, expected] of [
    [2028, 29],
    [2026, 28],
    [2000, 29],
    [1900, 28],
    [2100, 28],
    [4, 29],
  ] as const)
    expect(getDaysInMonth(year, 2)).toBe(expected);
  for (const dateStr of [
    "bad",
    "2026-02-29",
    "2026-04-31",
    "2026-11-00",
    "2026-00-01",
    "2026-13-01",
    "0000-01-01",
  ])
    expect(() => calculateDailyAllowance({ ...base, dateStr })).toThrow();
  for (const [year, month] of [
    [NaN, 1],
    [2026, NaN],
    [0, 1],
    [10000, 1],
    [2026, 0],
    [2026, 13],
    [2026, 1.5],
  ] as const)
    expect(() => getDaysInMonth(year, month)).toThrow();
  for (const key of ["budgetPaise", "spentPaise", "billsDuePaise"])
    for (const bad of [-0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(() => calculateDailyAllowance({ ...base, [key]: bad })).toThrow();
  expect(() =>
    calculateDailyAllowance({
      ...base,
      budgetPaise: 0,
      spentPaise: Number.MAX_SAFE_INTEGER,
      billsDuePaise: Number.MAX_SAFE_INTEGER,
    }),
  ).toThrow();
});
test("allowance_uses_injected_india_clock_across_day_month_year_boundaries", () => {
  for (const [now, dateStr] of [
    ["2026-11-30T18:29:59.999Z", "2026-11-30"],
    ["2026-11-30T18:30:00Z", "2026-12-01"],
    ["2026-12-31T18:30:00Z", "2027-01-01"],
  ]) {
    expect(
      calculateDailyAllowance(
        { budgetPaise: 100, spentPaise: 0, billsDuePaise: 0 },
        { now: () => now },
      ).dateStr,
    ).toBe(dateStr);
  }
  expect(
    calculateDailyAllowance(base, {
      now: () => {
        throw new Error("clock_must_not_be_used");
      },
    }).dateStr,
  ).toBe(base.dateStr);
  expect(() =>
    calculateDailyAllowance(
      { budgetPaise: 0, spentPaise: 0, billsDuePaise: 0 },
      { now: () => "invalid" },
    ),
  ).toThrow();
  expect(
    calculateDailyAllowance({ budgetPaise: 0, spentPaise: 0, billsDuePaise: 0 })
      .dateStr,
  ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
