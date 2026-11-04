import { expect, test, vi } from "vitest";
import {
  checkSensitiveMessage,
  withNonSensitiveMessage,
} from "./sensitiveFilter.js";

test("privacy_sensitive_english_credentials_and_private_warnings", () => {
  for (const [text, reason] of [
    ["SYNTHBANK OTP 839201", "otp"],
    ["One-time password 839201", "otp"],
    ["verification code 839201", "otp"],
    ["authentication code 839201", "otp"],
    ["security code 839201", "otp"],
    ["UPI PIN4455", "pin"],
    ["ATM PIN 4455", "pin"],
    ["MPIN 4455", "pin"],
    ["TPIN 4455", "pin"],
    ["CVV2 912", "cvv"],
    ["CVC2 912", "cvv"],
    ["password synthetic_auth_marker", "password"],
    ["passcode 123456", "password"],
    ["secret code 123456", "password"],
    ["netbanking login synthetic", "password"],
    ["do not share this", "do_not_share"],
    ["don't share this", "do_not_share"],
    ["don’t share this", "do_not_share"],
    ["never share this", "do_not_share"],
    ["do-not-share this", "do_not_share"],
  ]) {
    expect(checkSensitiveMessage(text)).toEqual({ sensitive: true, reason });
  }
});

test("privacy_sensitive_hinglish_and_devanagari", () => {
  for (const text of [
    "kisi ko mat batana ४४५५",
    "kisi se share na karein",
    "kisi ke saath share mat karo",
    "share mat karo",
    "mat batana",
    "gupt code १२३४",
    "apna otp 1234",
    "ओटीपी १२३४५६",
    "पिन ४४५५",
    "पासवर्ड synthetic",
    "सीवीवी १२३",
    "गुप्त कोड १२३४",
    "साझा न करें",
    "किसी को मत बताएं",
    "शेयर न करें",
  ])
    expect(checkSensitiveMessage(text).sensitive).toBe(true);
});

test("privacy_sensitive_normalization_and_controls_do_not_bypass", () => {
  for (const text of [
    "ＯＴＰ １２３４５６",
    "o\u200btp 123456",
    "P\u2060IN 1234",
    "DO\nNOT\tSHARE",
    "otp१२३४",
    "पिन:४४५५",
  ]) {
    expect(checkSensitiveMessage(text).sensitive).toBe(true);
  }
});

test("privacy_sensitive_unicode_boundaries_avoid_ordinary_word_false_positives", () => {
  for (const text of [
    "paid 450 for lunch",
    "spinning top",
    "pincode 221001",
    "passwordless login",
    "खरीदा पिनाकी सामान",
    "xotp",
    "otp_name",
    "पासवर्डयुक्त",
  ]) {
    expect(checkSensitiveMessage(text)).toEqual({
      sensitive: false,
      reason: null,
    });
  }
  expect(checkSensitiveMessage("(OTP): 123456").sensitive).toBe(true);
});

test("privacy_sensitive_invalid_input_fails_closed_without_coercion", () => {
  const coercion = vi.fn(() => {
    throw new Error("must_not_coerce");
  });
  for (const text of [
    null,
    undefined,
    123456,
    {},
    [],
    { toString: coercion },
    "",
    " \n",
    "\u200b",
  ]) {
    expect(checkSensitiveMessage(text)).toEqual({
      sensitive: true,
      reason: "invalid_input",
    });
  }
  expect(coercion).not.toHaveBeenCalled();
});

test("privacy_sensitive_guard_drops_before_database_logs_or_network", async () => {
  const database = vi.fn();
  const logger = vi.fn();
  const network = vi.fn();
  const handler = vi.fn(async (text: string) => {
    database(text);
    logger(text);
    network(text);
    return "accepted";
  });
  for (const text of [
    "OTP 839201",
    "PIN 4455",
    "CVV 912",
    "password synthetic_private_marker",
    "do not share",
    "ओटीपी १२३४",
    null,
  ]) {
    const result = await withNonSensitiveMessage(text, handler);
    expect(result.dropped).toBe(true);
    expect(Object.keys(result).sort()).toEqual(["dropped", "reason"]);
    expect(JSON.stringify(result)).not.toMatch(
      /839201|4455|912|synthetic_private_marker|१२३४/,
    );
  }
  for (const sink of [handler, database, logger, network])
    expect(sink).not.toHaveBeenCalled();
});

test("privacy_sensitive_guard_passes_original_safe_text_once_and_awaits", async () => {
  const text = "Paid ４５０ for lunch";
  const handler = vi.fn(async (value: string) => ({ value }));
  expect(await withNonSensitiveMessage(text, handler)).toEqual({
    dropped: false,
    value: { value: text },
  });
  expect(handler).toHaveBeenCalledExactlyOnceWith(text);
  const failure = new Error("synthetic_operational_failure");
  await expect(
    withNonSensitiveMessage("safe text", () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
});

test("privacy_sensitive_checks_are_stateless_and_do_not_echo_payload", () => {
  for (let index = 0; index < 3; index++) {
    expect(checkSensitiveMessage("OTP synthetic_secret_marker")).toEqual({
      sensitive: true,
      reason: "otp",
    });
    expect(checkSensitiveMessage("lunch")).toEqual({
      sensitive: false,
      reason: null,
    });
  }
});
