import { fetch as expo_fetch } from "expo/fetch";
import {
  ANTHROPIC_API_VERSION,
  ANTHROPIC_DEFAULT_MODEL,
  type ProviderPreset,
} from "../../../../packages/agent/src/providers";
import { KILO_FREE_MODEL, KILO_GATEWAY_BASE_URL } from "./mobile_qa";
import {
  DEFAULT_ASSISTANT_PROVIDER_PROFILE,
  read_anthropic_api_key,
  read_assistant_provider_profile,
  read_kilo_key,
  read_openai_compatible_key,
  save_anthropic_api_key,
  save_assistant_provider_profile,
  save_kilo_key,
  save_openai_compatible_key,
} from "./secure_key";
import type { AssistantProviderSelection, SecureKeyStore } from "./secure_key";

export const KEY_PROFILES_NAME = "assistant_key_profiles_v1";
export type KeyProvider = AssistantProviderSelection;

export type AuthHeader =
  "authorization" | "api-key" | "x-api-key" | "x-goog-api-key";

export interface KeyProfile {
  id: string;
  provider: KeyProvider;
  label: string;
  base_url: string;
  model: string;
  /**
   * API path the transport appends to `base_url`. Absent means the default
   * `/v1`; `""` means `base_url` is already the complete prefix. Stored because
   * "OpenAI-compatible" servers disagree — Google's compatibility layer lives
   * at `/v1beta/openai`, and with a hard-coded `/v1` every request was a 404.
   */
  api_suffix?: string;
  /** Where the key goes on the wire. Absent means `Authorization: Bearer`. */
  auth_header?: AuthHeader;
  /** Prefix before the key; `""` sends the bare key. */
  auth_scheme?: string;
}

/**
 * The header a profile's key travels in, and its full value.
 *
 * One implementation shared by model discovery and chat, so the two can never
 * disagree about where the key goes. Defaults match the OpenAI convention;
 * a custom header sends the bare key unless a scheme was configured.
 */
export function auth_header_for(
  profile: Pick<KeyProfile, "auth_header" | "auth_scheme">,
  secret: string,
): { name: string; value: string } {
  const name = profile.auth_header ?? "authorization";
  const scheme =
    profile.auth_scheme ?? (name === "authorization" ? "Bearer" : "");
  return { name, value: scheme ? `${scheme} ${secret}` : secret };
}

/** The API path a profile actually uses. */
export function profile_api_suffix(profile: KeyProfile): string {
  if (profile.provider === "anthropic") return "";
  return profile.api_suffix ?? "/v1";
}

export interface KeyProfileRegistry {
  active_id: string | null;
  profiles: KeyProfile[];
}

export interface ModelChoice {
  id: string;
  label: string;
}

function secret_name(id: string): string {
  return `assistant_key_${id}`;
}

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

function normalize_base_url(value: string): string {
  const url = new URL(value.trim());
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("invalid_base_url");
  return (url.origin + url.pathname).replace(/\/+$/, "").replace(/\/v1$/i, "");
}

/**
 * Bounded, path-only suffix. Rejects traversal, query, fragment and whitespace,
 * so a profile can never redirect the request somewhere the user cannot see.
 */
function normalize_api_suffix(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const suffix = value.trim();
  if (suffix.length > 64) throw new Error("invalid_api_suffix");
  if (suffix !== "" && !suffix.startsWith("/"))
    throw new Error("invalid_api_suffix");
  if (
    suffix.includes("..") ||
    /[?#\s]/.test(suffix) ||
    has_control_character(suffix)
  )
    throw new Error("invalid_api_suffix");
  return suffix;
}

const AUTH_HEADERS: readonly AuthHeader[] = [
  "authorization",
  "api-key",
  "x-api-key",
  "x-goog-api-key",
];

function normalize_auth_header(
  value: string | undefined,
): AuthHeader | undefined {
  if (value === undefined) return undefined;
  if (!AUTH_HEADERS.includes(value as AuthHeader))
    throw new Error("invalid_auth_header");
  return value as AuthHeader;
}

function normalize_auth_scheme(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const scheme = value.trim();
  if (scheme.length > 32 || has_control_character(scheme))
    throw new Error("invalid_auth_scheme");
  return scheme;
}

function validate_profile(
  input: Omit<KeyProfile, "id">,
): Omit<KeyProfile, "id"> {
  const label = input.label.trim();
  if (
    !label ||
    label.length > 64 ||
    has_control_character(label) ||
    (input.provider !== "kilo" &&
      input.provider !== "openai_compatible" &&
      input.provider !== "anthropic")
  )
    throw new Error("invalid_profile");
  let base_url = "";
  let model = input.model.trim();
  let api_suffix = normalize_api_suffix(input.api_suffix);
  const auth_header = normalize_auth_header(input.auth_header);
  const auth_scheme = normalize_auth_scheme(input.auth_scheme);
  if (input.provider === "openai_compatible") {
    base_url = normalize_base_url(input.base_url);
    // A pasted URL that already ends with the configured path is stored
    // without it, because the transport appends the suffix itself. Otherwise
    // the user would get `…/v1beta/openai/v1beta/openai`.
    const effective = api_suffix ?? "/v1";
    if (effective && base_url.toLowerCase().endsWith(effective.toLowerCase()))
      base_url = base_url.slice(0, -effective.length).replace(/\/+$/, "");
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model))
      throw new Error("invalid_model");
  } else if (input.provider === "anthropic") {
    model = model || ANTHROPIC_DEFAULT_MODEL;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model))
      throw new Error("invalid_model");
  } else {
    model = model || KILO_FREE_MODEL;
  }
  if (input.provider === "anthropic") {
    // Anthropic has a pinned endpoint; wire-shape overrides do not apply.
    api_suffix = undefined;
  }
  return {
    provider: input.provider,
    label,
    base_url,
    model,
    ...(api_suffix !== undefined ? { api_suffix } : {}),
    ...(auth_header !== undefined ? { auth_header } : {}),
    ...(auth_scheme !== undefined ? { auth_scheme } : {}),
  };
}

let id_counter = 0;
function next_id(): string {
  id_counter += 1;
  return `key_${Date.now()}_${id_counter}`;
}

async function write_registry(
  store: SecureKeyStore,
  registry: KeyProfileRegistry,
): Promise<void> {
  await store.setItemAsync(KEY_PROFILES_NAME, JSON.stringify(registry));
}

function parse_registry(value: unknown): KeyProfileRegistry {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Array.isArray((value as KeyProfileRegistry).profiles)
  )
    throw new Error("invalid_registry");
  const registry = value as KeyProfileRegistry;
  const profiles = registry.profiles.map((profile) => ({
    id: String(profile.id),
    ...validate_profile(profile),
  }));
  const active_id =
    registry.active_id && profiles.some((p) => p.id === registry.active_id)
      ? registry.active_id
      : null;
  return { active_id, profiles };
}

/** Migrates the legacy single-key profile once, without deleting legacy values. */
export async function read_key_registry(
  store: SecureKeyStore,
): Promise<KeyProfileRegistry> {
  const raw = await store.getItemAsync(KEY_PROFILES_NAME);
  if (raw !== null) {
    try {
      return parse_registry(JSON.parse(raw));
    } catch {
      return { active_id: null, profiles: [] };
    }
  }
  const legacy = await read_assistant_provider_profile(store);
  const profiles: KeyProfile[] = [];
  const kilo = await read_kilo_key(store);
  const openai = await read_openai_compatible_key(store);
  const anthropic = await read_anthropic_api_key(store);
  if (kilo)
    profiles.push({
      id: next_id(),
      provider: "kilo",
      label: "Kilo Gateway",
      base_url: "",
      model: KILO_FREE_MODEL,
    });
  if (openai)
    profiles.push({
      id: next_id(),
      provider: "openai_compatible",
      label: "OpenAI-compatible",
      base_url: legacy.base_url || DEFAULT_ASSISTANT_PROVIDER_PROFILE.base_url,
      model: legacy.model || "gpt-4o-mini",
    });
  if (anthropic)
    profiles.push({
      id: next_id(),
      provider: "anthropic",
      label: "Anthropic",
      base_url: "",
      model: ANTHROPIC_DEFAULT_MODEL,
    });
  const active =
    profiles.find((profile) => profile.provider === legacy.selected_provider) ??
    profiles[0];
  const registry = { active_id: active?.id ?? null, profiles };
  if (profiles.length > 0) {
    for (const profile of profiles) {
      const secret =
        profile.provider === "kilo"
          ? kilo
          : profile.provider === "openai_compatible"
            ? openai
            : anthropic;
      if (secret) await store.setItemAsync(secret_name(profile.id), secret);
    }
    await write_registry(store, registry);
    if (active) await activate_key_profile(store, active.id);
  }
  return registry;
}

export async function read_key_secret(
  store: SecureKeyStore,
  id: string,
): Promise<string | null> {
  const value = await store.getItemAsync(secret_name(id));
  if (value === null) return null;
  try {
    return normalize_key(value) || null;
  } catch {
    return null;
  }
}

/** The one provider the phone flow lets a user save without a credential. */
const MOBILE_KEYLESS_PRESET_ID = "kilo";

/**
 * Whether the phone flow can actually save this preset.
 *
 * Two rules decide it, and both come from this app rather than from the
 * provider: the key flow requires `https` (a phone app has no loopback/LAN
 * endpoint it can dial on the user's behalf), and a profile without a
 * credential is only allowed for Kilo. A preset that breaks either rule would
 * be offered and then refuse to save, so it is not offered at all.
 */
export function mobile_supports_preset(
  preset: Pick<ProviderPreset, "base_url" | "keyless" | "id">,
): boolean {
  if (preset.base_url !== undefined && !/^https:\/\//i.test(preset.base_url))
    return false;
  return !preset.keyless || preset.id === MOBILE_KEYLESS_PRESET_ID;
}

export async function add_key_profile(
  store: SecureKeyStore,
  input: Omit<KeyProfile, "id"> & { api_key: string; activate?: boolean },
): Promise<KeyProfile> {
  const registry = await read_key_registry(store);
  const profile = { id: next_id(), ...validate_profile(input) };
  const key = normalize_key(input.api_key);
  if (!key && profile.provider !== "kilo") throw new Error("invalid_api_key");
  if (key) await store.setItemAsync(secret_name(profile.id), key);
  registry.profiles.push(profile);
  await write_registry(store, registry);
  if (input.activate) await activate_key_profile(store, profile.id);
  return profile;
}

export async function update_key_profile(
  store: SecureKeyStore,
  id: string,
  input: Partial<Omit<KeyProfile, "id">> & { api_key?: string },
): Promise<void> {
  const registry = await read_key_registry(store);
  const index = registry.profiles.findIndex((profile) => profile.id === id);
  if (index < 0) throw new Error("profile_not_found");
  const current = registry.profiles[index]!;
  const next = {
    ...current,
    ...validate_profile({
      provider: input.provider ?? current.provider,
      label: input.label ?? current.label,
      base_url: input.base_url ?? current.base_url,
      model: input.model ?? current.model,
    }),
  };
  if (input.api_key !== undefined) {
    const key = normalize_key(input.api_key);
    if (!key && next.provider !== "kilo") throw new Error("invalid_api_key");
    if (key) await store.setItemAsync(secret_name(id), key);
    else await store.deleteItemAsync(secret_name(id));
  }
  registry.profiles[index] = next;
  await write_registry(store, registry);
  if (registry.active_id === id) await activate_key_profile(store, id);
}

export async function activate_key_profile(
  store: SecureKeyStore,
  id: string,
): Promise<void> {
  const registry = await read_key_registry(store);
  const profile = registry.profiles.find((candidate) => candidate.id === id);
  if (!profile) throw new Error("profile_not_found");
  const secret = await read_key_secret(store, id);
  if (profile.provider === "kilo") {
    await save_kilo_key(store, secret ?? "");
    await save_assistant_provider_profile(store, {
      selected_provider: "kilo",
      base_url: DEFAULT_ASSISTANT_PROVIDER_PROFILE.base_url,
      model: profile.model || KILO_FREE_MODEL,
    });
  } else if (profile.provider === "openai_compatible") {
    await save_openai_compatible_key(store, secret ?? "");
    await save_assistant_provider_profile(store, {
      selected_provider: "openai_compatible",
      base_url: profile.base_url,
      model: profile.model,
    });
  } else {
    await save_anthropic_api_key(store, secret ?? "");
    await save_assistant_provider_profile(store, {
      selected_provider: "anthropic",
      base_url: DEFAULT_ASSISTANT_PROVIDER_PROFILE.base_url,
      model: profile.model || ANTHROPIC_DEFAULT_MODEL,
    });
  }
  registry.active_id = id;
  await write_registry(store, registry);
}

export async function remove_key_profile(
  store: SecureKeyStore,
  id: string,
): Promise<void> {
  const registry = await read_key_registry(store);
  const profile = registry.profiles.find((candidate) => candidate.id === id);
  if (!profile) return;
  await store.deleteItemAsync(secret_name(id));
  registry.profiles = registry.profiles.filter(
    (candidate) => candidate.id !== id,
  );
  if (registry.active_id === id) {
    registry.active_id = null;
    if (profile.provider === "kilo") await save_kilo_key(store, "");
    else if (profile.provider === "openai_compatible")
      await save_openai_compatible_key(store, "");
    else await save_anthropic_api_key(store, "");
  }
  await write_registry(store, registry);
}

function model_url(profile: KeyProfile): string {
  if (profile.provider === "kilo") return `${KILO_GATEWAY_BASE_URL}/v1/models`;
  if (profile.provider === "anthropic")
    return "https://api.anthropic.com/v1/models";
  // Same suffix the transport will use, so discovery and chat cannot disagree.
  return `${normalize_base_url(profile.base_url)}${profile_api_suffix(profile)}/models`;
}

/** Fetches model ids from the selected provider; never logs keys or raw bodies. */
export async function fetch_model_choices(
  store: SecureKeyStore,
  profile: KeyProfile,
  fetch_impl: typeof fetch = expo_fetch,
  secret_override?: string,
): Promise<ModelChoice[]> {
  const secret =
    secret_override !== undefined
      ? normalize_key(secret_override)
      : await read_key_secret(store, profile.id);
  if (profile.provider !== "kilo" && !secret)
    throw new Error("missing_api_key");
  const headers: Record<string, string> = { accept: "application/json" };
  if (profile.provider === "anthropic") {
    headers["x-api-key"] = secret!;
    headers["anthropic-version"] = ANTHROPIC_API_VERSION;
  } else if (secret) {
    const { name, value } = auth_header_for(profile, secret);
    headers[name] = value;
  }
  const response = await fetch_impl(model_url(profile), { headers });
  if (!response.ok) throw new Error("model_fetch_failed");
  const payload: unknown = await response.json();
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) throw new Error("model_fetch_failed");
  const choices: ModelChoice[] = [];
  for (const item of data.slice(0, 100)) {
    if (item === null || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id !== "string" || !id.trim()) continue;
    const display = (item as { display_name?: unknown }).display_name;
    choices.push({
      id,
      label: typeof display === "string" && display.trim() ? display : id,
    });
  }
  return choices;
}
