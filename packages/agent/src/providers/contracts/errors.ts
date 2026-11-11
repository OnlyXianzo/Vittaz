import { z } from "zod";
import type { KeyFailureRecord } from "../../key_pool.js";

/**
 * Normalized provider errors.
 *
 * These are the only failure shapes the Vittaz provider contract exposes. They
 * never carry credentials, base URLs, request bodies, provider response text or
 * stack traces, so an adapter cannot leak secrets by throwing.
 *
 * The reason vocabulary is the existing `KeyFailureRecord` union: the transport
 * classifiers in `provider_client.ts` and `anthropic_messages_client.ts` are
 * authoritative and are deliberately not re-implemented here.
 */
export type ProviderFailureReason = KeyFailureRecord["reason"];

/** Credentials are missing or unusable. No request may be sent. */
export class MissingCredentialError extends Error {
  constructor() {
    super("Provider credential is not configured");
    this.name = "MissingCredentialError";
  }
}

/** The configuration itself is unusable. No request may be sent. */
export class InvalidProviderConfigError extends Error {
  constructor() {
    super("Invalid provider configuration");
    this.name = "InvalidProviderConfigError";
  }
}

/** An explicitly requested provider configuration is not registered. */
export class ProviderNotConfiguredError extends Error {
  constructor() {
    super("Requested provider configuration is not registered");
    this.name = "ProviderNotConfiguredError";
  }
}

/**
 * Maps a transport failure reason onto the normalized provider reason.
 * Identity for known reasons, `provider_error` for anything unclassified.
 */
export function normalize_failure_reason(
  reason: ProviderFailureReason | undefined,
): ProviderFailureReason {
  switch (reason) {
    case "unauthorized":
    case "rate_limited":
    case "connection_error":
    case "access_denied":
    case "provider_unavailable":
    case "provider_http_error":
    case "protocol_error":
    case "provider_error":
      return reason;
    // A disabled key or an active cooldown is a local scheduling state, not a
    // provider classification. It collapses to the unknown category exactly as
    // the removed adapter did, so no new diagnostic reason is introduced.
    case "disabled":
    case "cooldown":
      return "provider_error";
    default:
      return "provider_error";
  }
}

/**
 * Stable, user-visible configuration id. Same shape the key pool already
 * enforces for nicknames, so an id can always be used as a pool nickname.
 */
export const provider_id_schema = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/);

/**
 * True when a value contains a whitespace or C0/DEL control character.
 *
 * Written as a code-point scan rather than a regular expression so the intent
 * is explicit and the value is never normalised before validation.
 */
export function has_forbidden_characters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** A reference to a secret in secure storage. Never the secret itself. */
export const credential_ref_schema = z
  .string()
  .max(128)
  .refine((value) => value.length === 0 || !has_forbidden_characters(value));

/** Same model-id shape both transports already accept. */
export const model_id_schema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/);
