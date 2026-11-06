import { describe, expect, it, jest } from "@jest/globals";
import {
  KILO_KEY_NAME,
  read_kilo_key,
  remove_kilo_key,
  save_kilo_key,
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
