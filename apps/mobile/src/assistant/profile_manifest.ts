import {
  parse_connection_check,
  type ConnectionCheck,
} from "./connection_check";

/**
 * A plain-storage copy of the key profile list.
 *
 * Why this exists: on Android, SecureStore entries are invalidated when the
 * lock-screen credential changes. That is not the user's mistake and not a
 * corrupt file — the key material simply cannot be decrypted any more. Until
 * now the profile list lived in the same place as the secrets, so a woken-up
 * keystore took the list with it: profiles vanished and the screen looked like
 * a fresh install.
 *
 * This copy holds **no secret**. Only the fields needed to re-draw the rows and
 * to re-ask for a key: the id, the provider kind, the label, the endpoint and
 * model the user typed, the wire shape, and the last connection check. It is
 * readable at rest by anything that can read the app's data.
 *
 * Two rules make it safe:
 *
 * 1. **An explicit allowlist, never a spread.** A profile object is passed in
 *    by the registry writer; copying it wholesale would mirror whatever else it
 *    grows later, and one day that will be a credential.
 * 2. **Nothing here throws.** The manifest is read exactly when the keystore
 *    has already failed, so a second failure would replace a usable message
 *    with a crash.
 */
export const KEY_MANIFEST_NAME = "vittaz.assistant.key_manifest.v1";

const MAX_PROFILES = 64;
const MAX_LABEL = 64;
const MAX_URL = 2048;
const MAX_MODEL = 128;
const MAX_SUFFIX = 64;
const MAX_SCHEME = 32;

/**
 * The slice of `expo-sqlite/kv-store` this module needs. `removeItemAsync`
 * resolves to a boolean there, so the contract allows it rather than forcing
 * every caller through a wrapper.
 */
export interface ManifestStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<unknown>;
  removeItemAsync(key: string): Promise<unknown>;
}

export type ManifestProvider = "kilo" | "openai_compatible" | "anthropic";

export interface ManifestProfile {
  id: string;
  provider: ManifestProvider;
  label: string;
  base_url: string;
  model: string;
  api_suffix?: string;
  auth_header?: "authorization" | "api-key" | "x-api-key" | "x-goog-api-key";
  auth_scheme?: string;
}

export interface KeyManifest {
  active_id: string | null;
  profiles: ManifestProfile[];
  /** Last connection check per profile id. */
  checks: Record<string, ConnectionCheck>;
}

function has_control_character(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function bounded(
  value: unknown,
  max: number,
  allow_empty: boolean,
): string | null {
  if (typeof value !== "string") return null;
  if (value.length > max) return null;
  if (has_control_character(value)) return null;
  if (!allow_empty && !value.trim()) return null;
  return value;
}

const PROVIDERS: readonly ManifestProvider[] = [
  "kilo",
  "openai_compatible",
  "anthropic",
];
const AUTH_HEADERS: readonly ManifestProfile["auth_header"][] = [
  "authorization",
  "api-key",
  "x-api-key",
  "x-goog-api-key",
];

/**
 * The allowlisted copy of one profile, or null if it could never be shown.
 *
 * Field-by-field on purpose. This is the one place a credential would leak into
 * plain storage, so it does not iterate or spread the input.
 */
function to_manifest_profile(value: unknown): ManifestProfile | null {
  if (value === null || typeof value !== "object") return null;
  const profile = value as Record<string, unknown>;
  const id = bounded(profile.id, 64, false);
  if (id === null || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  const provider = profile.provider;
  if (!PROVIDERS.includes(provider as ManifestProvider)) return null;
  const label = bounded(profile.label, MAX_LABEL, false);
  if (label === null) return null;
  // Absent means empty, not invalid: Kilo and Anthropic profiles have no
  // user-supplied endpoint, so a manifest written by an older build may omit
  // the field entirely.
  const base_url = bounded(profile.base_url ?? "", MAX_URL, true);
  if (base_url === null) return null;
  const model = bounded(profile.model ?? "", MAX_MODEL, true);
  if (model === null) return null;
  const entry: ManifestProfile = {
    id,
    provider: provider as ManifestProvider,
    label,
    base_url,
    model,
  };
  const api_suffix = bounded(profile.api_suffix, MAX_SUFFIX, true);
  if (api_suffix !== null && api_suffix !== undefined)
    entry.api_suffix = api_suffix;
  if (profile.auth_header !== undefined) {
    if (!AUTH_HEADERS.includes(profile.auth_header as never)) return null;
    entry.auth_header = profile.auth_header as ManifestProfile["auth_header"];
  }
  const auth_scheme = bounded(profile.auth_scheme, MAX_SCHEME, true);
  if (auth_scheme !== null && auth_scheme !== undefined)
    entry.auth_scheme = auth_scheme;
  return entry;
}

function parse_manifest(raw: string): KeyManifest | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    return null;
  const source = payload as {
    active_id?: unknown;
    profiles?: unknown;
    checks?: unknown;
  };
  if (!Array.isArray(source.profiles)) return null;
  const profiles: ManifestProfile[] = [];
  for (const entry of source.profiles.slice(0, MAX_PROFILES)) {
    const profile = to_manifest_profile(entry);
    // One unusable row must not cost the user the rest of the list.
    if (profile) profiles.push(profile);
  }
  const ids = new Set(profiles.map((profile) => profile.id));
  const checks: Record<string, ConnectionCheck> = {};
  if (source.checks !== null && typeof source.checks === "object") {
    for (const [id, check] of Object.entries(
      source.checks as Record<string, unknown>,
    )) {
      if (!ids.has(id)) continue;
      const parsed = parse_connection_check(check);
      if (parsed.state !== "untested") checks[id] = parsed;
    }
  }
  const active_id =
    typeof source.active_id === "string" && ids.has(source.active_id)
      ? source.active_id
      : null;
  return { active_id, profiles, checks };
}

/** The stored manifest, or null when there is nothing usable to recover from. */
export async function read_manifest(
  store: ManifestStore,
): Promise<KeyManifest | null> {
  let raw: string | null;
  try {
    raw = await store.getItemAsync(KEY_MANIFEST_NAME);
  } catch {
    return null;
  }
  if (raw === null) return null;
  // Never repaired in place: a read is not consent to discard.
  return parse_manifest(raw);
}

export async function write_manifest(
  store: ManifestStore,
  registry: { active_id: string | null; profiles: readonly unknown[] },
  checks: Record<string, ConnectionCheck> = {},
): Promise<void> {
  const existing = await read_manifest(store);
  const profiles: ManifestProfile[] = [];
  for (const entry of registry.profiles.slice(0, MAX_PROFILES)) {
    const profile = to_manifest_profile(entry);
    if (profile) profiles.push(profile);
  }
  const ids = new Set(profiles.map((profile) => profile.id));
  const kept_checks: Record<string, ConnectionCheck> = {};
  for (const [id, check] of Object.entries({
    ...existing?.checks,
    ...checks,
  })) {
    if (!ids.has(id)) continue;
    const parsed = parse_connection_check(check);
    if (parsed.state !== "untested") kept_checks[id] = parsed;
  }
  const payload = {
    version: 1,
    active_id: ids.has(registry.active_id ?? "") ? registry.active_id : null,
    profiles,
    checks: kept_checks,
  };
  try {
    await store.setItemAsync(KEY_MANIFEST_NAME, JSON.stringify(payload));
  } catch {
    // A mirror of the list is not worth failing a key save over; the key store
    // is the authority and it already succeeded by the time this runs.
  }
}

/** Persist one check, dropping entries for profiles that are no longer listed. */
export async function record_manifest_check(
  store: ManifestStore,
  id: string,
  check: ConnectionCheck,
): Promise<void> {
  const manifest = await read_manifest(store);
  if (!manifest) return;
  if (!manifest.profiles.some((profile) => profile.id === id)) return;
  await write_manifest(store, manifest, { [id]: check });
}

/** Drop one profile's remembered check. */
export async function remove_manifest_check(
  store: ManifestStore,
  id: string,
): Promise<void> {
  const manifest = await read_manifest(store);
  if (!manifest || !(id in manifest.checks)) return;
  const payload = {
    version: 1,
    active_id: manifest.active_id,
    profiles: manifest.profiles,
    checks: Object.fromEntries(
      Object.entries(manifest.checks).filter(([key]) => key !== id),
    ),
  };
  try {
    await store.setItemAsync(KEY_MANIFEST_NAME, JSON.stringify(payload));
  } catch {
    // Same as a failed write elsewhere: the key store is the authority.
  }
}

export async function clear_manifest(store: ManifestStore): Promise<void> {
  try {
    await store.removeItemAsync(KEY_MANIFEST_NAME);
  } catch {
    // Nothing to do: an unreachable store means there is nothing to clear.
  }
}
