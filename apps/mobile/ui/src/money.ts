const RUPEE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const RUPEE_PAISE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Presentation-only helper. The preview never mutates a real ledger. */
export function formatPaise(paise: number): string {
  if (!Number.isSafeInteger(paise)) return "₹0";
  return paise % 100 === 0
    ? RUPEE.format(paise / 100)
    : RUPEE_PAISE.format(paise / 100);
}

/** Parses a user-entered decimal string into integer paise without float drift. */
export function parseAmountToPaise(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [rupees, fraction = ""] = cleaned.split(".");
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise) || paise <= 0) return null;
  return paise;
}
