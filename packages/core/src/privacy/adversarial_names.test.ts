import { expect, test } from "vitest";
import { PrivacyRedactor } from "./redactor.js";

test("privacy_adversarial_compatibility_and_format_controls_do_not_leak_known_names", () => {
  const redactor = new PrivacyRedactor([
    "Ｓｙｎｔｈ Ａｍａｎ",
    "Synth De\u200bv",
  ]);
  expect(redactor.redactText("synth aman and Synth Dev")).toBe(
    "Person_1 and Person_2",
  );
  expect(redactor.registerCounterparty("Synth Aman")).toBe("Person_1");
  expect(redactor.registerCounterparty("\u200b")).toBeNull();
});

test("privacy_adversarial_raw_placeholder_tokens_cannot_impersonate_names", () => {
  const redactor = new PrivacyRedactor(["Aman"]);
  const text = redactor.redactText("Person_1 owes Aman; PERSON_10");
  expect(text).toBe("[PERSON_TOKEN] owes Person_1; [PERSON_TOKEN]");
  expect(redactor.unredactText(text)).toBe(
    "[PERSON_TOKEN] owes Aman; [PERSON_TOKEN]",
  );
});

test("privacy_adversarial_lowercase_hinglish_and_possessives", () => {
  const redactor = new PrivacyRedactor([
    "Aman",
    "Rohan",
    "Sharma ji",
    "Neha didi",
  ]);
  expect(
    redactor.redactText(
      "aman ko 450 diye, aadha wo dega; rohan se 500 mila; sharma ji ko 200; neha didi’s share",
    ),
  ).toBe(
    "Person_1 ko 450 diye, aadha wo dega; Person_2 se 500 mila; Person_3 ko 200; Person_4’s share",
  );
  expect(
    redactor
      .getAllMappings()
      .some((entry) => entry.name.toLowerCase() === "wo"),
  ).toBe(false);
});

test("privacy_adversarial_devanagari_matras_and_embedded_notes", () => {
  const redactor = new PrivacyRedactor(["रम", "रमा", "देव"]);
  const text = "रम और रमा ने देव को देवरिया में पैसे दिए";
  expect(redactor.redactText(text)).toBe(
    "Person_1 और Person_2 ने Person_3 को देवरिया में पैसे दिए",
  );
  expect(redactor.unredactText(redactor.redactText(text))).toBe(text);
  expect(redactor.redactText("note: रम; रमा’s meal")).toBe(
    "note: Person_1; Person_2’s meal",
  );
});

test("privacy_adversarial_cold_start_clear_payment_names_are_discovered_locally", () => {
  const redactor = new PrivacyRedactor();
  for (const [text, name] of [
    ["paid 320 to kabir for coffee", "kabir"],
    ["split 800 with neha for dinner", "neha"],
    ["lunch 500, vikram owes half", "vikram"],
    ["How much did I send to Aditya this week?", "Aditya"],
    ["birthday cake with Ananya", "Ananya"],
    ["aman ko 450 diye", "aman"],
    ["Sharma ji ko 200 bheja", "Sharma ji"],
    ["अमन को 450 भेजा", "अमन"],
    ["शर्मा जी को 200 दिए", "शर्मा जी"],
  ]) {
    const outbound = redactor.redactText(text);
    expect(outbound.toLowerCase()).not.toContain(name!.toLowerCase());
    expect(outbound).toMatch(/Person_\d+/);
  }
  expect(
    redactor.redactText(
      "aadha wo dega; split with me; paid to bank; १२३४ को भेजा",
    ),
  ).toBe("aadha wo dega; split with me; paid to bank; 1234 को भेजा");
});

test("privacy_adversarial_sensitive_input_does_not_register_names", () => {
  const redactor = new PrivacyRedactor();
  for (const value of [
    null,
    "",
    "OTP 123456 to Synth Name",
    "पासवर्ड synthetic to Synth Name",
  ]) {
    redactor.discoverAndRegisterInlineNames(value);
    expect(redactor.redactText(value)).toBe("");
  }
  expect(redactor.getAllMappings()).toEqual([]);
});

test("privacy_adversarial_unknown_aliases_typos_and_confusables_are_explicit_limits", () => {
  const redactor = new PrivacyRedactor(["Aman"]);
  // This is a limitation characterization, NOT a claim the output is cloud-safe.
  for (const text of ["amann lunch", "munna lunch", "Аman lunch"])
    expect(redactor.redactText(text)).toBe(text);
  expect(redactor.getAllMappings()).toHaveLength(1);
  // A locally validated explicit alias can be registered; no fuzzy guessing.
  redactor.registerCounterparty("munna");
  expect(redactor.redactText("munna lunch")).toBe("Person_2 lunch");
});

test("privacy_adversarial_discovery_rejects_honorific_only_and_digit_candidates", () => {
  const redactor = new PrivacyRedactor();
  redactor.discoverAndRegisterInlineNames("जी को 200 दिए; १२३४ को भेजा");
  expect(redactor.getAllMappings()).toEqual([]);
});
