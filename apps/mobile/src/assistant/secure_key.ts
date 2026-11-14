import { read_secret, secret_value, type SecretRead } from "./secret_state";

export const KILO_KEY_NAME = "kilo_gateway_api_key";
export const OPENAI_COMPATIBLE_KEY_NAME = "openai_compatible_api_key";
export const ANTHROPIC_API_KEY_NAME = "anthropic_api_key";
export const ASSISTANT_PROVIDER_PROFILE_NAME = "assistant_provider_profile";

export interface SecureKeyStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export type AssistantProviderSelection =
  "kilo" | "openai_compatible" | "anthropic";

export interface AssistantProviderProfile {
  selected_provider: AssistantProviderSelection;
  base_url: string;
  model: string;
}

export const DEFAULT_ASSISTANT_PROVIDER_PROFILE: AssistantProviderProfile = {
  selected_provider: "kilo",
  base_url: "https://api.openai.com/v1",
  model: "",
};

function has_control_character(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function normalize_key(value: string): string {
  const key = value.trim();
  if (key.length > 4096 || /\s/.test(key) || has_control_character(key))
    throw new Error("invalid_api_key");
  return key;
}

function validate_profile(
  profile: AssistantProviderProfile,
): AssistantProviderProfile {
  if (
    !profile ||
    (profile.selected_provider !== "kilo" &&
      profile.selected_provider !== "openai_compatible" &&
      profile.selected_provider !== "anthropic") ||
    typeof profile.base_url !== "string" ||
    typeof profile.model !== "string" ||
    profile.base_url.length > 2048 ||
    profile.model.length > 128 ||
    has_control_character(profile.base_url) ||
    has_control_character(profile.model)
  )
    throw new Error("invalid_provider_profile");

  const base_url = profile.base_url.trim();
  const model = profile.model.trim();
  if (profile.selected_provider === "openai_compatible") {
    if (base_url) {
      try {
        const parsed = new URL(base_url);
        if (
          parsed.protocol !== "https:" ||
          parsed.username ||
          parsed.password ||
          parsed.search ||
          parsed.hash
        )
          throw new Error();
      } catch {
        throw new Error("invalid_provider_profile");
      }
    }
    if (model && !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model))
      throw new Error("invalid_provider_profile");
  }
  return { ...profile, base_url, model };
}

async function save_key(
  store: SecureKeyStore,
  name: string,
  value: string,
): Promise<void> {
  const key = normalize_key(value);
  if (!key) {
    await store.deleteItemAsync(name);
    return;
  }
  await store.deleteItemAsync(name).catch(() => undefined);
  await store.setItemAsync(name, key);
}

/**
 * The three-state read, for callers that must tell a locked keystore from a
 * missing key. `read_key` below keeps the older `string | null` shape for
 * callers that only render a presence flag.
 */
export async function read_key_state(
  store: SecureKeyStore,
  name: string,
): Promise<SecretRead> {
  return read_secret(store, name, normalize_key);
}

async function read_key(
  store: SecureKeyStore,
  name: string,
): Promise<string | null> {
  return secret_value(await read_key_state(store, name));
}

/** Store an optional Kilo Gateway key in the platform secure store only. */
export async function save_kilo_key(
  store: SecureKeyStore,
  value: string,
): Promise<void> {
  await save_key(store, KILO_KEY_NAME, value);
}

/** Returns null for absent or malformed stored values; never logs credential data. */
export async function read_kilo_key(
  store: SecureKeyStore,
): Promise<string | null> {
  return read_key(store, KILO_KEY_NAME);
}

/** Absent, unreadable or usable — never logged. */
export async function read_kilo_key_state(
  store: SecureKeyStore,
): Promise<SecretRead> {
  return read_key_state(store, KILO_KEY_NAME);
}

export async function remove_kilo_key(store: SecureKeyStore): Promise<void> {
  await store.deleteItemAsync(KILO_KEY_NAME);
}

/** Store the OpenAI-compatible BYOK credential in SecureStore only. */
export async function save_openai_compatible_key(
  store: SecureKeyStore,
  value: string,
): Promise<void> {
  await save_key(store, OPENAI_COMPATIBLE_KEY_NAME, value);
}

/** Returns null for absent or malformed OpenAI-compatible credentials. */
export async function read_openai_compatible_key(
  store: SecureKeyStore,
): Promise<string | null> {
  return read_key(store, OPENAI_COMPATIBLE_KEY_NAME);
}

export async function read_openai_compatible_key_state(
  store: SecureKeyStore,
): Promise<SecretRead> {
  return read_key_state(store, OPENAI_COMPATIBLE_KEY_NAME);
}

export async function remove_openai_compatible_key(
  store: SecureKeyStore,
): Promise<void> {
  await store.deleteItemAsync(OPENAI_COMPATIBLE_KEY_NAME);
}

/** Store a direct Anthropic API key in Expo SecureStore only. */
export async function save_anthropic_api_key(
  store: SecureKeyStore,
  value: string,
): Promise<void> {
  await save_key(store, ANTHROPIC_API_KEY_NAME, value);
}

/** Returns null for absent or malformed Anthropic API keys. */
export async function read_anthropic_api_key(
  store: SecureKeyStore,
): Promise<string | null> {
  return read_key(store, ANTHROPIC_API_KEY_NAME);
}

export async function read_anthropic_api_key_state(
  store: SecureKeyStore,
): Promise<SecretRead> {
  return read_key_state(store, ANTHROPIC_API_KEY_NAME);
}

export async function remove_anthropic_api_key(
  store: SecureKeyStore,
): Promise<void> {
  await store.deleteItemAsync(ANTHROPIC_API_KEY_NAME);
}

/** Persist provider selection and endpoint metadata; API keys are stored separately. */
export async function save_assistant_provider_profile(
  store: SecureKeyStore,
  profile: AssistantProviderProfile,
): Promise<void> {
  const normalized = validate_profile(profile);
  await store.setItemAsync(
    ASSISTANT_PROVIDER_PROFILE_NAME,
    JSON.stringify(normalized),
  );
}

/** Malformed profile data fails closed to an explicit invalid selected profile. */
export async function read_assistant_provider_profile(
  store: SecureKeyStore,
): Promise<AssistantProviderProfile> {
  const value = await store.getItemAsync(ASSISTANT_PROVIDER_PROFILE_NAME);
  if (value === null) return DEFAULT_ASSISTANT_PROVIDER_PROFILE;
  try {
    const parsed: unknown = JSON.parse(value);
    return validate_profile(parsed as AssistantProviderProfile);
  } catch {
    return {
      selected_provider: "openai_compatible",
      base_url: "",
      model: "",
    };
  }
}
