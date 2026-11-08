import { getRandomValues } from "expo-crypto";

/**
 * Hermes (the React Native JS engine) ships no Web Crypto global, so
 * `globalThis.crypto.getRandomValues` is absent on device. LangChain's UUID v7
 * run-id generation (`@langchain/core` callbacks) calls the global
 * `crypto.getRandomValues` *before* any provider HTTP request. Without it,
 * `BaseChatModel.invoke` throws and every chat question fails at the
 * `provider_call` stage with a generic `langchain_error` (the long-standing
 * "KILO_UNKNOWN" symptom). Node and the jest-expo test runner provide a global
 * `crypto`, which is why unit tests passed while the device failed.
 *
 * Install a CSPRNG-backed `getRandomValues` from the already-present
 * `expo-crypto` (the same package the ledger runtime uses for `randomUUID`).
 * This must run at app entry, before any LangChain import is evaluated.
 *
 * Idempotent and non-destructive: an existing native implementation (Node/web)
 * is never replaced.
 */
function has_get_random_values(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { getRandomValues?: unknown }).getRandomValues ===
      "function"
  );
}

export function install_web_crypto(): void {
  const global_object = globalThis as { crypto?: unknown };
  if (has_get_random_values(global_object.crypto)) return;
  const existing =
    typeof global_object.crypto === "object" && global_object.crypto !== null
      ? (global_object.crypto as Record<string, unknown>)
      : {};
  try {
    existing.getRandomValues = getRandomValues;
    global_object.crypto = existing;
  } catch {
    // A frozen native crypto object cannot be mutated; replace it instead.
    global_object.crypto = { getRandomValues };
  }
}

install_web_crypto();
