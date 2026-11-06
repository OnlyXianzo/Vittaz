export const KILO_KEY_NAME = "kilo_gateway_api_key";

export interface SecureKeyStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

function normalize_key(value: string): string {
  const key = value.trim();
  const has_control_character = Array.from(key).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
  if (key.length > 4096 || /\s/.test(key) || has_control_character)
    throw new Error("invalid_api_key");
  return key;
}

/** Store an optional Kilo Gateway key in the platform secure store only. */
export async function save_kilo_key(
  store: SecureKeyStore,
  value: string,
): Promise<void> {
  const key = normalize_key(value);
  if (!key) {
    await store.deleteItemAsync(KILO_KEY_NAME);
    return;
  }
  await store.setItemAsync(KILO_KEY_NAME, key);
}

/** Returns null for absent or malformed stored values; never logs credential data. */
export async function read_kilo_key(
  store: SecureKeyStore,
): Promise<string | null> {
  const value = await store.getItemAsync(KILO_KEY_NAME);
  if (value === null) return null;
  try {
    const key = normalize_key(value);
    return key || null;
  } catch {
    return null;
  }
}

export async function remove_kilo_key(store: SecureKeyStore): Promise<void> {
  await store.deleteItemAsync(KILO_KEY_NAME);
}
