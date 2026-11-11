import { getRandomValues } from "expo-crypto";

/**
 * Hermes (the React Native JS engine) ships no Web Crypto global, so
 * `globalThis.crypto` and `crypto.getRandomValues` are absent on device.
 *
 * History: this shim was added because LangChain's UUID v7 run-id generation
 * (`@langchain/core` callbacks) read the global `crypto.getRandomValues`
 * *before* any provider HTTP request, so every chat question failed at the
 * `provider_call` stage with a generic error (the long-standing "KILO_UNKNOWN"
 * symptom). Node and the jest-expo runner both provide a global `crypto`, which
 * is why unit tests passed while the device failed.
 *
 * That adapter has since been removed, and
 * `apps/mobile/src/assistant/web_crypto.test.ts` now proves the assistant path
 * answers end-to-end *without* the polyfill. The shim is retained deliberately:
 *
 *   - it is the only place the app records that Hermes has no Web Crypto global,
 *     while `packages/core/src/ledger/ledger.ts` still defaults `makeId` to
 *     `globalThis.crypto.randomUUID` (mobile overrides it via `ledger_runtime`),
 *   - it is idempotent and never replaces a native implementation, so it cannot
 *     change Node/browser behaviour, and
 *   - deleting it would be an unverified Android runtime change.
 *
 * Remove it only with device evidence that no bundled code touches the global.
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
