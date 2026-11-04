import { expect, test } from "vitest";
import { PrivacyRedactor } from "./redactor.js";
import { scrubOutboundText } from "./scrubber.js";

test("privacy_scrubber_removes_whole_upi_uri_and_embedded_names", () => {
  expect(
    scrubOutboundText(
      "pay UPI://pay?pa=synth@okbank&pn=Synth%20Name&am=450 now",
    ),
  ).toBe("pay [UPI_URI] now");
});

test("privacy_scrubber_removes_labelled_references_and_handles", () => {
  expect(
    scrubOutboundText(
      "UPI Ref 630877665544; UTR:SYNTH123456789; RRN 998877665544; synthmerchant@okbank merchant.12@ybl",
    ),
  ).toBe("[UPI_REF]; [UPI_REF]; [UPI_REF]; [UPI_VPA] [UPI_VPA]");
  expect(scrubOutboundText("UPI Txn Id: 123456789012; UPI 123456789012")).toBe(
    "[UPI_REF]; [UPI_REF]",
  );
});

test("privacy_scrubber_removes_account_card_and_ifsc_identifiers", () => {
  for (const text of [
    "A/c XX8421",
    "Account number: 00112233445566",
    "Card 00112233445566",
    "Acct No. **8421",
    "Khata १२३४५६७८९०",
    "XX8421",
    "xx8421",
    "****8421",
  ]) {
    expect(scrubOutboundText(text)).toBe("[ACCOUNT]");
  }
  expect(scrubOutboundText("IFSC SYNT0001234")).toBe("IFSC [IFSC]");
});

test("privacy_scrubber_removes_phones_and_grouped_or_long_raw_numbers", () => {
  for (const text of ["+91 98765 43210", "91-9876543210", "9876543210"])
    expect(scrubOutboundText(text)).toBe("[PHONE]");
  for (const text of [
    "00112233445566",
    "1234 5678 9012",
    "1234-5678-9012",
    "123456789012345678901234567890",
  ]) {
    expect(scrubOutboundText(text)).toBe("[REDACTED_DIGITS]");
  }
});

test("privacy_scrubber_handles_compatibility_digits_and_format_controls", () => {
  for (const text of [
    "Account ００１１２２３３４４５５６６",
    "Account ००११२२३३४४५५६६",
    "Account 0011\u200b2233445566",
  ]) {
    expect(scrubOutboundText(text)).toBe("[ACCOUNT]");
  }
});

test("privacy_scrubber_safe_text_is_retained_and_invalid_input_not_coerced", () => {
  expect(scrubOutboundText("Paid ₹450.00 for lunch on 2026-11-04")).toBe(
    "Paid ₹450.00 for lunch on 2026-11-04",
  );
  for (const text of [null, {}, ""]) expect(scrubOutboundText(text)).toBe("");
});

test("privacy_scrubber_composes_with_name_replacement_and_is_idempotent", () => {
  const redactor = new PrivacyRedactor(["Synth Name"]);
  const outbound = redactor.redactText(
    "Synth Name A/c XX8421 UPI Ref 630877665544 synthmerchant@okbank",
  );
  expect(outbound).toBe("Person_1 [ACCOUNT] [UPI_REF] [UPI_VPA]");
  expect(scrubOutboundText(outbound)).toBe(outbound);
  expect(redactor.unredactText(outbound)).toBe(
    "Synth Name [ACCOUNT] [UPI_REF] [UPI_VPA]",
  );
});
