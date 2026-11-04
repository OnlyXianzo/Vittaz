import { expect, test } from "vitest";
import { PrivacyRedactor } from "./redactor.js";

test("privacy_name_registration_is_stable_and_seedable", () => {
  const redactor = new PrivacyRedactor();
  expect(redactor.registerCounterparty(" Synth Aman ")).toBe("Person_1");
  expect(redactor.registerCounterparty("synth aman")).toBe("Person_1");
  expect(redactor.registerCounterparty("Synth Dev")).toBe("Person_2");
  const copy = redactor.getAllMappings();
  copy[0]!.name = "mutated";
  expect(redactor.getAllMappings()[0]!.name).toBe("Synth Aman");
  const restored = new PrivacyRedactor(
    redactor.getAllMappings().map((entry) => entry.name),
  );
  expect(restored.redactText("Synth Dev and synth aman")).toBe(
    "Person_2 and Person_1",
  );
});

test("privacy_name_longest_first_and_exact_unicode_boundaries", () => {
  const redactor = new PrivacyRedactor([
    "Aman",
    "Amanpreet",
    "Aman Verma",
    "Dev",
    "अमन",
  ]);
  expect(
    redactor.redactText(
      "Aman, Amanpreet, Aman Verma, Dev; adamant device Aman2 _Aman अमन अमना",
    ),
  ).toBe(
    "Person_1, Person_2, Person_3, Person_4; adamant device Aman2 _Aman Person_5 अमना",
  );
  expect(redactor.redactText("AMAN's and Dev’s")).toBe(
    "Person_1's and Person_4’s",
  );
});

test("privacy_name_reversal_does_not_confuse_person_1_and_person_10", () => {
  const names = Array.from(
    { length: 11 },
    (_, index) => `Synth Name ${index + 1}`,
  );
  const redactor = new PrivacyRedactor(names);
  expect(
    redactor.unredactText(
      "Person_10 owes Person_1; Person_11, Person_99, xPerson_1 Person_1x Person_1_foo",
    ),
  ).toBe(
    "Synth Name 10 owes Synth Name 1; Synth Name 11, Person_99, xPerson_1 Person_1x Person_1_foo",
  );
});

test("privacy_name_literals_do_not_execute_regex_or_replacement_tokens", () => {
  const redactor = new PrivacyRedactor([
    "Synth A+B",
    "Synth $&",
    "Synth (test)",
    "Synth Café",
  ]);
  const text = "Synth A+B, Synth $&, Synth (test), Synth Cafe\u0301";
  const outbound = redactor.redactText(text);
  expect(outbound).toBe("Person_1, Person_2, Person_3, Person_4");
  expect(redactor.unredactText(outbound)).toBe(
    "Synth A+B, Synth $&, Synth (test), Synth Café",
  );
  expect(redactor.registerCounterparty("Synth Cafe\u0301")).toBe("Person_4");
});

test("privacy_name_invalid_inputs_are_not_coerced_or_registered", () => {
  const redactor = new PrivacyRedactor();
  for (const value of [
    null,
    undefined,
    {},
    "",
    "  ",
    "Person_1",
    "Synth Person_12",
  ])
    expect(redactor.registerCounterparty(value)).toBeNull();
  for (const value of [null, ""]) {
    expect(redactor.redactText(value)).toBe("");
    expect(redactor.unredactText(value)).toBe("");
  }
  expect(redactor.redactText("ordinary words")).toBe("ordinary words");
  expect(redactor.unredactText("ordinary words")).toBe("ordinary words");
  expect(redactor.getAllMappings()).toEqual([]);
});
