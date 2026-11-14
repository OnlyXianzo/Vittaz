import { describe, expect, it, jest } from "@jest/globals";
import {
  KILO_KEY_NAME,
  OPENAI_COMPATIBLE_KEY_NAME,
  ANTHROPIC_API_KEY_NAME,
  ASSISTANT_PROVIDER_PROFILE_NAME,
  read_anthropic_api_key,
  read_assistant_provider_profile,
  read_kilo_key,
  read_openai_compatible_key,
  remove_anthropic_api_key,
  remove_kilo_key,
  remove_openai_compatible_key,
  save_anthropic_api_key,
  save_assistant_provider_profile,
  save_kilo_key,
  save_openai_compatible_key,
} from "./secure_key";

function secret_store() {
  const values = new Map<string, string>();
  return {
    values,
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
}

describe("Kilo Gateway credential storage", () => {
  it("keeps a user key only in secure storage and never returns it from save", async () => {
    const store = secret_store();
    await expect(save_kilo_key(store, "synthetic_test_key_123")).resolves.toBe(
      undefined,
    );
    expect(store.setItemAsync).toHaveBeenCalledWith(
      KILO_KEY_NAME,
      "synthetic_test_key_123",
    );
    expect(await read_kilo_key(store)).toBe("synthetic_test_key_123");
  });

  it("removes a key when given an empty value and rejects malformed values", async () => {
    const store = secret_store();
    await save_kilo_key(store, "synthetic_test_key_123");
    await save_kilo_key(store, "   ");
    expect(store.deleteItemAsync).toHaveBeenCalledWith(KILO_KEY_NAME);
    expect(await read_kilo_key(store)).toBeNull();
    await expect(save_kilo_key(store, "contains whitespace")).rejects.toThrow(
      "invalid_api_key",
    );
    await expect(save_kilo_key(store, "bad\u0001key")).rejects.toThrow(
      "invalid_api_key",
    );
    await expect(save_kilo_key(store, "bad\u007fkey")).rejects.toThrow(
      "invalid_api_key",
    );
    await expect(save_kilo_key(store, "x".repeat(4097))).rejects.toThrow(
      "invalid_api_key",
    );
  });

  it("deletes the active provider key without exposing its value", async () => {
    const store = secret_store();
    await save_kilo_key(store, "synthetic_test_key_123");
    await expect(remove_kilo_key(store)).resolves.toBeUndefined();
    expect(await read_kilo_key(store)).toBeNull();
  });
});

describe("OpenAI-compatible credential storage", () => {
  it("stores a synthetic user key under its own SecureStore name", async () => {
    const store = secret_store();
    await save_openai_compatible_key(store, "synthetic_user_key_456");
    expect(store.setItemAsync).toHaveBeenCalledWith(
      OPENAI_COMPATIBLE_KEY_NAME,
      "synthetic_user_key_456",
    );
    expect(await read_openai_compatible_key(store)).toBe(
      "synthetic_user_key_456",
    );
    expect(store.values.has(KILO_KEY_NAME)).toBe(false);
  });

  it("removes empty keys and rejects malformed synthetic keys", async () => {
    const store = secret_store();
    await save_openai_compatible_key(store, "synthetic_user_key_456");
    await save_openai_compatible_key(store, "   ");
    expect(store.deleteItemAsync).toHaveBeenCalledWith(
      OPENAI_COMPATIBLE_KEY_NAME,
    );
    await expect(
      save_openai_compatible_key(store, "invalid key"),
    ).rejects.toThrow("invalid_api_key");
    expect(await read_openai_compatible_key(store)).toBeNull();
  });

  it("removes a stored OpenAI-compatible key without exposing it", async () => {
    const store = secret_store();
    await save_openai_compatible_key(store, "synthetic_user_key_789");
    await remove_openai_compatible_key(store);
    expect(store.deleteItemAsync).toHaveBeenCalledWith(
      OPENAI_COMPATIBLE_KEY_NAME,
    );
    expect(await read_openai_compatible_key(store)).toBeNull();
  });
});

describe("Anthropic API-key credential storage", () => {
  it("stores only a synthetic API key under its isolated SecureStore name", async () => {
    const store = secret_store();
    await save_anthropic_api_key(store, "fake-key");
    expect(store.setItemAsync).toHaveBeenCalledWith(
      ANTHROPIC_API_KEY_NAME,
      "fake-key",
    );
    expect(await read_anthropic_api_key(store)).toBe("fake-key");
    expect(store.values.has(KILO_KEY_NAME)).toBe(false);
    expect(store.values.has(OPENAI_COMPATIBLE_KEY_NAME)).toBe(false);
  });

  it("removes the Anthropic key independently and rejects malformed values", async () => {
    const store = secret_store();
    await save_anthropic_api_key(store, "fake-key");
    await remove_anthropic_api_key(store);
    expect(store.deleteItemAsync).toHaveBeenCalledWith(ANTHROPIC_API_KEY_NAME);
    expect(await read_anthropic_api_key(store)).toBeNull();
    await expect(save_anthropic_api_key(store, "bad key")).rejects.toThrow(
      "invalid_api_key",
    );
  });
});

describe("assistant provider profile storage", () => {
  it("persists only non-secret endpoint selection and model settings", async () => {
    const store = secret_store();
    const profile = {
      selected_provider: "openai_compatible" as const,
      base_url: "https://compatible.example/api/v1",
      model: "synthetic-compatible-model",
    };
    await save_assistant_provider_profile(store, profile);
    expect(store.setItemAsync).toHaveBeenCalledWith(
      ASSISTANT_PROVIDER_PROFILE_NAME,
      JSON.stringify(profile),
    );
    expect(await read_assistant_provider_profile(store)).toEqual(profile);
    expect(JSON.stringify(profile)).not.toMatch(/api_key|synthetic_user_key/i);
  });

  it("rejects unsafe OpenAI-compatible endpoint profiles", async () => {
    const store = secret_store();
    await expect(
      save_assistant_provider_profile(store, {
        selected_provider: "openai_compatible",
        base_url: "http://compatible.example/v1",
        model: "synthetic-model",
      }),
    ).rejects.toThrow("invalid_provider_profile");
    await expect(
      save_assistant_provider_profile(store, {
        selected_provider: "openai_compatible",
        base_url: "https://user:pass@compatible.example/v1",
        model: "synthetic-model",
      }),
    ).rejects.toThrow("invalid_provider_profile");
    await expect(
      save_assistant_provider_profile(store, {
        selected_provider: "openai_compatible",
        base_url: "https://compatible.example/\n",
        model: "synthetic-model",
      }),
    ).rejects.toThrow("invalid_provider_profile");
    await expect(
      save_assistant_provider_profile(store, {
        selected_provider: "openai_compatible",
        base_url: "https://compatible.example/v1",
        model: "bad model",
      }),
    ).rejects.toThrow("invalid_provider_profile");
    expect(store.setItemAsync).not.toHaveBeenCalled();
  });
});

it("preserves the previous legacy key if a replacement write fails", async () => {
  const store = secret_store();
  await save_kilo_key(store, "synthetic-old");
  store.setItemAsync.mockRejectedValueOnce(new Error("write_failed"));
  await expect(save_kilo_key(store, "synthetic-new")).rejects.toThrow(
    "write_failed",
  );
  expect(await read_kilo_key(store)).toBe("synthetic-old");
});
