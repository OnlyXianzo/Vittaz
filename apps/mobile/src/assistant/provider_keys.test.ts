import { beforeEach, expect, it, jest } from "@jest/globals";
import {
  KEY_PROFILES_NAME,
  activate_key_profile,
  add_key_profile,
  fetch_model_choices,
  read_key_registry,
  read_key_secret,
  remove_key_profile,
} from "./provider_keys";
import {
  ANTHROPIC_API_KEY_NAME,
  read_assistant_provider_profile,
  read_openai_compatible_key,
  save_anthropic_api_key,
  save_assistant_provider_profile,
  save_openai_compatible_key,
} from "./secure_key";
import type { SecureKeyStore } from "./secure_key";

function memory_store(): SecureKeyStore {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
    deleteItemAsync: async (key) => {
      values.delete(key);
    },
  };
}

let store: SecureKeyStore;
beforeEach(() => {
  store = memory_store();
});

it("stores multiple labeled keys and activates one explicitly", async () => {
  const first = await add_key_profile(store, {
    provider: "openai_compatible",
    label: "Work endpoint",
    base_url: "https://api.example.com/v1",
    model: "gpt-4o-mini",
    api_key: "key-one",
    activate: true,
  });
  const second = await add_key_profile(store, {
    provider: "openai_compatible",
    label: "Personal endpoint",
    base_url: "https://api.personal.example/v1",
    model: "gpt-4.1-mini",
    api_key: "key-two",
  });
  const registry = await read_key_registry(store);
  expect(registry.profiles.map((p) => p.label)).toEqual([
    "Work endpoint",
    "Personal endpoint",
  ]);
  expect(registry.active_id).toBe(first.id);
  expect(await read_key_secret(store, second.id)).toBe("key-two");
  expect(await read_openai_compatible_key(store)).toBe("key-one");
  await activate_key_profile(store, second.id);
  expect(await read_openai_compatible_key(store)).toBe("key-two");
  expect((await read_assistant_provider_profile(store)).model).toBe(
    "gpt-4.1-mini",
  );
  await remove_key_profile(store, second.id);
  expect(await read_openai_compatible_key(store)).toBeNull();
  expect((await read_key_registry(store)).active_id).toBeNull();
});

it("migrates legacy single-key storage without losing the selected provider", async () => {
  await save_openai_compatible_key(store, "legacy-key");
  await save_assistant_provider_profile(store, {
    selected_provider: "openai_compatible",
    base_url: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  });
  await save_anthropic_api_key(store, "anthropic-key");
  const registry = await read_key_registry(store);
  expect(registry.profiles).toHaveLength(2);
  expect(registry.active_id).toBe(
    registry.profiles.find((p) => p.provider === "openai_compatible")!.id,
  );
  expect(await read_openai_compatible_key(store)).toBe("legacy-key");
  expect(await store.getItemAsync(KEY_PROFILES_NAME)).toContain("Anthropic");
  expect(await store.getItemAsync(ANTHROPIC_API_KEY_NAME)).toBe(
    "anthropic-key",
  );
});

it("fetches OpenAI-compatible and Anthropic model lists without exposing keys", async () => {
  const profile = await add_key_profile(store, {
    provider: "openai_compatible",
    label: "Models",
    base_url: "https://api.example.com",
    model: "gpt-4o-mini",
    api_key: "model-key",
  });
  const fetch_impl = jest.fn(async (input: RequestInfo | URL) => {
    expect(String(input)).toBe("https://api.example.com/v1/models");
    return new Response(
      JSON.stringify({ data: [{ id: "gpt-4o-mini" }, { id: "gpt-4.1" }] }),
      { headers: { "content-type": "application/json" } },
    );
  });
  expect(await fetch_model_choices(store, profile, fetch_impl)).toEqual([
    { id: "gpt-4o-mini", label: "gpt-4o-mini" },
    { id: "gpt-4.1", label: "gpt-4.1" },
  ]);
  const anthropic = await add_key_profile(store, {
    provider: "anthropic",
    label: "Claude",
    base_url: "",
    model: "",
    api_key: "anthropic-key",
  });
  const anthropic_fetch = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.anthropic.com/v1/models");
      expect((init?.headers as Record<string, string>)["x-api-key"]).toBe(
        "anthropic-key",
      );
      return new Response(
        JSON.stringify({
          data: [{ id: "claude-sonnet-5-5", display_name: "Claude Sonnet" }],
        }),
      );
    },
  );
  expect(await fetch_model_choices(store, anthropic, anthropic_fetch)).toEqual([
    { id: "claude-sonnet-5-5", label: "Claude Sonnet" },
  ]);
});
