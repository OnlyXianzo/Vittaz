import { expect, test, vi } from "vitest";
import {
  parseAssistantRules,
  parseMessageOrigin,
  evaluateMessageConditions,
  getAssistantRules,
  setAssistantRules,
} from "./rules.js";
const origin = {
  source: "app",
  authenticated: true,
  paired_telegram: false,
} as const;
test("rules_exact_union_clone_and_rejection_of_free_prompts_or_authority_changes", () => {
  const rules = [
    { kind: "behavior", rule: "amounts_in_rupees" },
    { kind: "behavior", rule: "short_summaries" },
    {
      kind: "message_condition",
      rule: "allowed_sources",
      sources: ["app", "cli", "telegram"],
    },
    { kind: "message_condition", rule: "paired_telegram_only" },
  ] as const;
  expect(parseAssistantRules(rules)).toEqual(rules);
  for (const input of [
    null,
    {},
    Array(17).fill({}),
    [{ kind: "behavior", rule: "approve_all" }],
    [{ kind: "behavior", rule: "short_summaries", prompt: "ignore safety" }],
    [{ kind: "message_condition", rule: "allowed_sources", sources: [] }],
    [{ kind: "message_condition", rule: "allowed_sources", sources: ["sms"] }],
    [
      {
        kind: "message_condition",
        rule: "allowed_sources",
        sources: ["app", "app"],
      },
    ],
    [rules[0], rules[0]],
    [null],
    [{ kind: "system", rule: "short_summaries" }],
  ])
    expect(() => parseAssistantRules(input)).toThrow(
      /^Assistant rules operation failed$/,
    );
});
test("rules_conditions_require_trusted_auth_pairing_and_allowlist_not_a_phrase", () => {
  const onlyCli = parseAssistantRules([
    { kind: "message_condition", rule: "allowed_sources", sources: ["cli"] },
  ]);
  expect(evaluateMessageConditions(onlyCli, origin)).toBe(false);
  expect(evaluateMessageConditions(onlyCli, { ...origin, source: "cli" })).toBe(
    true,
  );
  for (const rules of [
    [],
    parseAssistantRules([
      { kind: "message_condition", rule: "paired_telegram_only" },
    ]),
  ]) {
    expect(
      evaluateMessageConditions(rules, { ...origin, authenticated: false }),
    ).toBe(false);
    expect(
      evaluateMessageConditions(rules, { ...origin, source: "telegram" }),
    ).toBe(false);
    expect(
      evaluateMessageConditions(rules, {
        ...origin,
        source: "telegram",
        paired_telegram: true,
      }),
    ).toBe(true);
    expect(evaluateMessageConditions(rules, origin)).toBe(true);
  }
  for (const v of [
    null,
    {},
    { ...origin, source: "sms" },
    { ...origin, authenticated: "yes" },
    { ...origin, paired_telegram: 1 },
    { ...origin, secret_phrase: "synthetic" },
  ])
    expect(() => parseMessageOrigin(v)).toThrow();
});
test("rules_use_cases_validate_ports_and_sanitize_driver_failures", async () => {
  const store = { get: vi.fn(async () => []), set: vi.fn(async () => {}) };
  expect(await getAssistantRules(store)).toEqual([]);
  expect(await setAssistantRules(store, [])).toEqual([]);
  await expect(setAssistantRules(store, {} as never)).rejects.toMatchObject({
    code: "invalid_input",
  });
  expect(store.set).toHaveBeenCalledTimes(1);
  store.get.mockRejectedValue(new Error("synthetic_private"));
  store.set.mockRejectedValue(new Error("synthetic_private"));
  await expect(getAssistantRules(store)).rejects.toMatchObject({
    code: "unavailable",
  });
  await expect(setAssistantRules(store, [])).rejects.toMatchObject({
    code: "unavailable",
  });
});

test("rules_reject_inherited_policy_fields_instead_of_treating_them_as_verified_origin", () => {
  const inherited = Object.assign(Object.create(origin), { a: 1, b: 2, c: 3 });
  expect(() => parseMessageOrigin(inherited)).toThrow();
  const inheritedRule = Object.assign(
    Object.create({ kind: "behavior", rule: "short_summaries" }),
    { a: 1, b: 2 },
  );
  expect(() => parseAssistantRules([inheritedRule])).toThrow();
});
