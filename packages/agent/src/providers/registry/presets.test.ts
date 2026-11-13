import { expect, test } from "vitest";
import { PROVIDER_PRESETS, UNSUPPORTED_PROVIDERS } from "./presets.js";
import { create_ai_sdk_provider } from "../adapters/ai_sdk.js";
import { create_anthropic_provider } from "../adapters/anthropic.js";

/**
 * A preset is data, but it is still a promise: every entry must survive the
 * real configuration validator, or the app would offer a provider that throws
 * the moment it is selected.
 */
test("every preset validates as a real provider configuration", () => {
  for (const preset of PROVIDER_PRESETS) {
    const create =
      preset.kind === "anthropic"
        ? create_anthropic_provider
        : create_ai_sdk_provider;
    expect(() =>
      create(
        {
          id: preset.id,
          kind: preset.kind,
          credential_ref: "k",
          ...(preset.base_url ? { base_url: preset.base_url } : {}),
          ...(preset.api_suffix !== undefined
            ? { api_suffix: preset.api_suffix }
            : {}),
          ...(preset.auth ? { auth: preset.auth } : {}),
          default_model: preset.default_model ?? "synthetic-model",
        },
        { resolve_credential: async () => "synthetic_key" },
      ),
    ).not.toThrow();
  }
});

test("presets stay free of duplicate ids and keyable/keyless contradictions", () => {
  const ids = PROVIDER_PRESETS.map((preset) => preset.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const preset of PROVIDER_PRESETS)
    if (preset.kind === "openai_compatible")
      expect(preset.base_url).toBeTruthy();
});

test("unsupported providers are recorded with a reason and an alternative", () => {
  expect(UNSUPPORTED_PROVIDERS.length).toBeGreaterThan(0);
  for (const entry of UNSUPPORTED_PROVIDERS) {
    expect(entry.reason.length).toBeGreaterThan(40);
    expect(entry.alternative).toBeTruthy();
    // Nothing unsupported may also appear in the selectable list.
    expect(
      PROVIDER_PRESETS.some((preset) => entry.label.startsWith(preset.label)),
    ).toBe(false);
  }
});
