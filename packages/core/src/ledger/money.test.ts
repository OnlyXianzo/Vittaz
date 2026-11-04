import { expect, test } from "vitest";
import * as publicCore from "../index.js";
import {
  MoneyValidationError,
  assertIntegerPaise,
  assertNonNegativePaise,
  assertPositivePaise,
  formatPaiseToRupees,
  normalizeIndicDigits,
  parseRupeesToPaise,
  sumPaise,
} from "./money.js";

test("money_public_exports_are_additive", () => {
  expect(publicCore.VERSION).toBe("0.0.1");
  for (const [name, implementation] of Object.entries({
    MoneyValidationError,
    assertIntegerPaise,
    assertNonNegativePaise,
    assertPositivePaise,
    formatPaiseToRupees,
    normalizeIndicDigits,
    parseRupeesToPaise,
    sumPaise,
  })) {
    expect(publicCore[name as keyof typeof publicCore]).toBe(implementation);
  }
});

test("integer_paise_guards_preserve_safe_values", () => {
  for (const value of [
    0,
    1,
    -1,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
  ])
    expect(assertIntegerPaise(value)).toBe(value);
  expect(assertPositivePaise(45000)).toBe(45000);
  expect(assertNonNegativePaise(0)).toBe(0);
  expect(assertNonNegativePaise(1)).toBe(1);
});

test("integer_paise_guards_reject_invalid_runtime_inputs", () => {
  for (const bad of [
    450.5,
    0.01,
    19.99,
    -0,
    NaN,
    Infinity,
    -Infinity,
    "45000",
    null,
    undefined,
    true,
    {},
    [],
    1n,
    Symbol("synthetic"),
    Number.MAX_SAFE_INTEGER + 1,
    Number.MIN_SAFE_INTEGER - 1,
  ]) {
    expect(() => assertIntegerPaise(bad)).toThrow(MoneyValidationError);
  }
  for (const value of [0, -1])
    expect(() => assertPositivePaise(value)).toThrow(MoneyValidationError);
  expect(() => assertNonNegativePaise(-1)).toThrow(MoneyValidationError);
  expect(() => assertIntegerPaise(1.5, "opening_balance_paise")).toThrow(
    /opening_balance_paise/,
  );
  expect(() => assertPositivePaise(0, "positive_paise")).toThrow(
    /positive_paise/,
  );
  expect(() => assertNonNegativePaise(-1, "nonnegative_paise")).toThrow(
    /nonnegative_paise/,
  );
  expect(new MoneyValidationError("synthetic_error").name).toBe(
    "MoneyValidationError",
  );
});

test("rupee_strings_parse_exactly_with_reference_notation", () => {
  for (const [input, paise] of [
    ["19.99", 1999],
    ["Rs. 1,250.50", 125050],
    ["₹450", 45000],
    ["INR 0.29", 29],
    ["Rs 12.3", 1230],
    [" 1,23,456.78 rupees ", 12345678],
    ["12 rupaye", 1200],
    ["12 rs.", 1200],
    ["रु. १२.३४", 1234],
    ["रुपये ४५०.५०", 45050],
    ["12 रुपये", 1200],
    ["12 रु.", 1200],
    ["०.०१", 1],
    ["000.00", 0],
    ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ] as const) {
    expect(parseRupeesToPaise(input)).toBe(paise);
  }
  expect(normalizeIndicDigits("०१२३४५६७८९ abc 123")).toBe("0123456789 abc 123");
});

test("rupee_parser_rejects_unsafe_or_ambiguous_inputs", () => {
  for (const input of [
    12.34,
    100,
    -0,
    NaN,
    null,
    undefined,
    {},
    true,
    "",
    " ",
    ".50",
    "1.",
    "-1",
    "+1",
    "-0",
    "1.001",
    "1e3",
    "0x10",
    "1 000",
    "NaN",
    "Infinity",
    "90071992547409.92",
  ])
    expect(() => parseRupeesToPaise(input)).toThrow(MoneyValidationError);
});

test("sum_paise_is_exact_and_checks_final_safe_range", () => {
  const entries = Array.from(
    { length: 1000 },
    (_, i) => (i + 1) * 100 + (((i + 1) * 37) % 100),
  );
  const expected = entries.reduce((total, value) => total + BigInt(value), 0n);
  expect(sumPaise(entries)).toBe(Number(expected));
  expect(sumPaise([])).toBe(0);
  expect(sumPaise([1, -1])).toBe(0);
  expect(sumPaise([Number.MAX_SAFE_INTEGER, 1, -1])).toBe(
    Number.MAX_SAFE_INTEGER,
  );
  expect(sumPaise([Number.MIN_SAFE_INTEGER])).toBe(Number.MIN_SAFE_INTEGER);
  for (const entries of [
    [Number.MAX_SAFE_INTEGER, 1],
    [Number.MIN_SAFE_INTEGER, -1],
    [1, 0.5],
    [-0],
    new Array(1),
  ])
    expect(() => sumPaise(entries)).toThrow(MoneyValidationError);
  expect(() => sumPaise(null as unknown as readonly unknown[])).toThrow(
    MoneyValidationError,
  );
});

test("paise_formatter_preserves_exact_cents_and_round_trips", () => {
  for (const [value, expected] of [
    [0, "0.00"],
    [1, "0.01"],
    [10, "0.10"],
    [100, "1.00"],
    [1999, "19.99"],
    [-1, "-0.01"],
    [-1999, "-19.99"],
    [Number.MAX_SAFE_INTEGER, "90071992547409.91"],
    [Number.MIN_SAFE_INTEGER, "-90071992547409.91"],
  ] as const)
    expect(formatPaiseToRupees(value)).toBe(expected);
  for (let value = 0; value < 1000; value++)
    expect(parseRupeesToPaise(formatPaiseToRupees(value))).toBe(value);
  expect(() => formatPaiseToRupees(-0)).toThrow(MoneyValidationError);
});
