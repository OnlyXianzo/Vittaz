import { describe, expect, it } from "vitest";
import { formatPaise, parseAmountToPaise } from "./money";

describe("money presentation helpers", () => {
  it("formats whole rupees without decimals", () => {
    expect(formatPaise(875000)).toBe("₹8,750");
    expect(formatPaise(0)).toBe("₹0");
  });

  it("formats paise with two decimals when needed", () => {
    expect(formatPaise(29950)).toBe("₹299.50");
  });

  it("parses decimal strings into integer paise", () => {
    expect(parseAmountToPaise("450")).toBe(45000);
    expect(parseAmountToPaise("450.25")).toBe(45025);
    expect(parseAmountToPaise("₹1,200.5")).toBe(120050);
  });

  it("rejects invalid, zero, negative and over-precise amounts", () => {
    expect(parseAmountToPaise("")).toBeNull();
    expect(parseAmountToPaise("abc")).toBeNull();
    expect(parseAmountToPaise("0")).toBeNull();
    expect(parseAmountToPaise("-1")).toBeNull();
    expect(parseAmountToPaise("1.001")).toBeNull();
    expect(parseAmountToPaise("1e3")).toBeNull();
  });
});
