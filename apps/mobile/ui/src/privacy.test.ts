import { describe, expect, it } from "vitest";
import { scanAndRedact, sensitiveLabels } from "./privacy";

describe("chat privacy guard", () => {
  it("leaves an ordinary payment message untouched", () => {
    const scan = scanAndRedact("I spent 299 on Zomato");
    expect(scan.clean).toBe(true);
    expect(scan.removed).toBe(0);
    expect(scan.safeText).toBe("I spent 299 on Zomato");
  });

  it("keeps the amount so the parser can still draft an entry", () => {
    const scan = scanAndRedact(
      "Rs 2,500.00 debited from a/c 50100234567890 on 27-10-2025",
    );
    expect(scan.safeText).toContain("2,500.00");
    expect(scan.safeText).toContain("[account hidden]");
    expect(scan.safeText).not.toContain("50100234567890");
  });

  it("hides card numbers that pass the Luhn check", () => {
    const scan = scanAndRedact("Card 4111 1111 1111 1111 charged 299");
    expect(scan.safeText).toContain("[card hidden]");
    expect(scan.findings.map((f) => f.kind)).toContain("card");
    expect(scan.safeText).not.toContain("4111");
  });

  it("hides UPI IDs, IFSC codes, PAN and Aadhaar shapes", () => {
    const scan = scanAndRedact(
      "Paid aman@okhdfcbank via HDFC0001234, PAN ABCDE1234F, id 234567890123",
    );
    const kinds = scan.findings.map((f) => f.kind);
    expect(kinds).toContain("upi");
    expect(kinds).toContain("ifsc");
    expect(kinds).toContain("pan");
    expect(kinds).toContain("aadhaar");
    expect(scan.safeText).not.toContain("aman@okhdfcbank");
    expect(scan.safeText).not.toContain("HDFC0001234");
    expect(scan.safeText).not.toContain("ABCDE1234F");
  });

  it("hides phone numbers and email addresses", () => {
    const scan = scanAndRedact(
      "Call 9876543210 or mail aman.k@example.com about the payment",
    );
    const kinds = scan.findings.map((f) => f.kind);
    expect(kinds).toContain("phone");
    expect(kinds).toContain("email");
    expect(scan.safeText).not.toContain("9876543210");
    expect(scan.safeText).not.toContain("aman.k@example.com");
  });

  it("hides OTP, PIN, CVV and password values", () => {
    const scan = scanAndRedact(
      "OTP is 456789, PIN 1234, cvv 321, password hunter2secret",
    );
    const kinds = scan.findings.map((f) => f.kind);
    expect(kinds).toContain("otp");
    expect(kinds).toContain("pin");
    expect(kinds).toContain("cvv");
    expect(kinds).toContain("password");
    expect(scan.safeText).not.toContain("456789");
    expect(scan.safeText).not.toContain("hunter2secret");
  });

  it("hides Telegram bot tokens and provider API keys", () => {
    const scan = scanAndRedact(
      "bot 123456789:AAHfiqksKZ8WmR2zS5pQ7vX9yB1cD3eF5gH token sk-live_abcdef123456",
    );
    const kinds = scan.findings.map((f) => f.kind);
    expect(kinds.filter((k) => k === "apikey")).toHaveLength(1);
    expect(scan.safeText).toContain("[key hidden]");
    expect(scan.safeText).not.toContain("AAHfiqksKZ8WmR2zS5pQ7vX9yB1cD3eF5gH");
  });

  it("never reports the raw value it removed", () => {
    const scan = scanAndRedact("a/c 50100234567890 and 9876543210");
    const serialised = JSON.stringify(scan.findings);
    expect(serialised).not.toContain("50100234567890");
    expect(serialised).not.toContain("9876543210");
    expect(sensitiveLabels(scan)).toEqual(["account number", "phone number"]);
  });

  it("counts repeats of the same kind once in the label list", () => {
    const scan = scanAndRedact("9876543210 and 9123456780");
    expect(scan.removed).toBe(2);
    expect(sensitiveLabels(scan)).toEqual(["phone number ×2"]);
  });

  it("is idempotent on already redacted text", () => {
    const once = scanAndRedact("Paid aman@okhdfcbank Rs 299");
    const twice = scanAndRedact(once.safeText);
    expect(twice.safeText).toBe(once.safeText);
    expect(twice.clean).toBe(true);
  });
});
