/** Invalid or inexact monetary input at a domain boundary. */
export class MoneyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyValidationError";
  }
}

const maximumPaise = BigInt(Number.MAX_SAFE_INTEGER);

export function normalizeIndicDigits(input: string): string {
  return input.replace(/[०-९]/g, (digit) =>
    String(digit.charCodeAt(0) - 0x0966),
  );
}

export function assertIntegerPaise(
  value: unknown,
  fieldName = "amount_paise",
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0)
  ) {
    throw new MoneyValidationError(
      `${fieldName} must be safe integer paise, not negative zero`,
    );
  }
  return value;
}

export function assertPositivePaise(
  value: unknown,
  fieldName = "amount_paise",
): number {
  const amount = assertIntegerPaise(value, fieldName);
  if (amount <= 0)
    throw new MoneyValidationError(
      `${fieldName} must be positive integer paise`,
    );
  return amount;
}

export function assertNonNegativePaise(
  value: unknown,
  fieldName = "amount_paise",
): number {
  const amount = assertIntegerPaise(value, fieldName);
  if (amount < 0)
    throw new MoneyValidationError(
      `${fieldName} must be non-negative integer paise`,
    );
  return amount;
}

function checkedNumber(total: bigint): number {
  if (total > maximumPaise || total < -maximumPaise) {
    throw new MoneyValidationError("Amount exceeds safe integer paise range");
  }
  return Number(total);
}

export function sumPaise(amounts: readonly unknown[]): number {
  if (!Array.isArray(amounts))
    throw new MoneyValidationError("sumPaise expects an array");
  let total = 0n;
  for (const amount of amounts) total += BigInt(assertIntegerPaise(amount));
  return checkedNumber(total);
}

/** Parse decimal text without ever multiplying a floating-point rupee amount. */
export function parseRupeesToPaise(input: unknown): number {
  if (typeof input !== "string")
    throw new MoneyValidationError("Rupees must be provided as a string");
  const decimal = normalizeIndicDigits(input)
    .trim()
    .replace(/^(?:INR|Rs\.?|₹|रुपये|रु\.?)\s*/i, "")
    .replace(/\s*(?:rupaye|rupees|rs\.?|रुपये|रु\.?)$/i, "")
    .replace(/,/g, "")
    .trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(decimal)) {
    throw new MoneyValidationError("Invalid rupee string format");
  }
  const [whole, fraction = ""] = decimal.split(".");
  return checkedNumber(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
}

export function formatPaiseToRupees(paise: number): string {
  const value = BigInt(assertIntegerPaise(paise, "paise"));
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
