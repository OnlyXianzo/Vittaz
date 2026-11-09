import { fetch as expo_fetch } from "expo/fetch";
import {
  ANTHROPIC_API_VERSION,
  ANTHROPIC_DEFAULT_MODEL,
} from "../../../../packages/agent/src/anthropic_messages_client";
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

export interface KeyProfile {
  id: string;
  provider: KeyProvider;
  label: string;
  base_url: string;
  model: string;
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
  if (input.provider === "openai_compatible") {
    base_url = normalize_base_url(input.base_url);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model))
      throw new Error("invalid_model");
  } else if (input.provider === "anthropic") {
    model = model || ANTHROPIC_DEFAULT_MODEL;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model))
      throw new Error("invalid_model");
  } else {
    model = model || KILO_FREE_MODEL;
  }
  return { provider: input.provider, label, base_url, model };
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
  return `${normalize_base_url(profile.base_url)}/v1/models`;
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
    headers.authorization = `Bearer ${secret}`;
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
