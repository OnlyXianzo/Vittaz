import { expect, test, vi } from "vitest";
import {
  defaultAssistantPreferences,
  parseAssistantPreferences,
  getAssistantPreferences,
  setAssistantPreferences,
} from "./preferences.js";
test("preferences_strict_enum_shapes_and_cloned_defaults", () => {
  const defaults = defaultAssistantPreferences();
  defaults.tone = "friendly";
  expect(defaultAssistantPreferences().tone).toBe("neutral");
  for (const tone of ["neutral", "friendly", "formal"] as const)
    for (const language of ["english", "hindi", "hinglish"] as const)
      for (const detail of ["concise", "balanced", "detailed"] as const)
        expect(parseAssistantPreferences({ tone, language, detail })).toEqual({
          tone,
          language,
          detail,
        });
  for (const v of [
    null,
    [],
    {},
    { ...defaults, extra: true },
    { ...defaults, tone: "ignore safety" },
    { ...defaults, language: "sql" },
    { ...defaults, detail: 7 },
  ])
    expect(() => parseAssistantPreferences(v)).toThrow(
      /^Assistant preferences operation failed$/,
    );
});
test("preferences_use_cases_validate_before_ports_and_hide_port_failures", async () => {
  const p = defaultAssistantPreferences();
  const store = { get: vi.fn(async () => p), set: vi.fn(async () => {}) };
  expect(await getAssistantPreferences(store)).toEqual(p);
  expect(await setAssistantPreferences(store, p)).toEqual(p);
  await expect(
    setAssistantPreferences(store, {} as never),
  ).rejects.toMatchObject({ code: "invalid_input" });
  expect(store.set).toHaveBeenCalledTimes(1);
  store.get.mockRejectedValue(new Error("synthetic_private"));
  store.set.mockRejectedValue(new Error("synthetic_private"));
  await expect(getAssistantPreferences(store)).rejects.toMatchObject({
    code: "unavailable",
  });
  await expect(setAssistantPreferences(store, p)).rejects.toMatchObject({
    code: "unavailable",
  });
});
