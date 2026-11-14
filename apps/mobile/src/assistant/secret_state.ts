import type { SecureKeyStore } from "./secure_key";

/**
 * The three situations a stored secret can be in.
 *
 * They are kept apart because they call for different actions, and because
 * collapsing them was a real defect: `null` for all three told a user whose
 * keystore had been invalidated to check their network, and made a corrupt
 * value look like "no key saved".
 *
 * - `absent` — nothing was ever stored, or the user removed it. Ask for a key.
 * - `unreadable` — something is stored but cannot be decrypted or parsed. The
 *   keystore can be invalidated by a lock-screen change on Android, or by a
 *   restored backup. Ask the user to re-enter it, and never delete it for them.
 * - `ok` — a usable value.
 */
export type SecretRead =
  | { readonly state: "ok"; readonly value: string }
  | { readonly state: "absent" }
  | { readonly state: "unreadable" };

/**
 * Read one secret, distinguishing a refusal from an absence.
 *
 * A throw from the store and a value that does not normalise both mean the same
 * thing to the caller — the secret cannot be used — but neither is the same as
 * "there is no key", which is why they do not become `null`.
 */
export async function read_secret(
  store: SecureKeyStore,
  name: string,
  normalize: (value: string) => string,
): Promise<SecretRead> {
  let raw: string | null;
  try {
    raw = await store.getItemAsync(name);
  } catch {
    return { state: "unreadable" };
  }
  // Absent and empty are the same thing to every caller: there is no key here.
  if (raw === null || raw === "") return { state: "absent" };
  try {
    const value = normalize(raw);
    return value ? { state: "ok", value } : { state: "absent" };
  } catch {
    return { state: "unreadable" };
  }
}

/** The value when it is usable, `null` otherwise. */
export function secret_value(read: SecretRead): string | null {
  return read.state === "ok" ? read.value : null;
}

/** The end-user message for a state that needs action, or `null` when it does not. */
export function secret_repair_message(
  read: SecretRead,
  what = "API key",
): string | null {
  if (read.state !== "unreadable") return null;
  return `Your saved ${what} can no longer be read on this device. Re-enter it in Model settings. No ledger changes were made.`;
}
