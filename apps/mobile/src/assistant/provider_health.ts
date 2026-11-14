/**
 * Per-profile provider health, for the life of the app process.
 *
 * Why this exists: the app builds a new agent — and therefore a new key pool —
 * for every question (`create_mobile_qa_agent`). A 429 marked a key as cooling
 * down inside a pool that was then thrown away, so tapping "send" again
 * immediately repeated the same failing request, with the same wait, forever.
 *
 * The record is deliberately in memory only:
 *
 * - It is operational metadata about a key, not the key itself: an outcome, a
 *   reason and a timestamp.
 * - It is not worth a storage decision. Surviving a relaunch needs somewhere
 *   non-secret to live, which is a privacy call that has not been made yet (see
 *   `docs/BYOK_CREDENTIAL_LIFECYCLE.md`). Losing it on relaunch only costs one
 *   extra request, which is a fair trade for not writing key state to disk
 *   without a decision.
 */

export type ProviderOutcome =
  "ok" | "auth_failed" | "rate_limited" | "connection_failed" | "unavailable";

export interface ProviderHealth {
  readonly outcome: ProviderOutcome;
  readonly at: number;
  /** When a new request may be attempted, when the outcome implies a wait. */
  readonly retry_at?: number;
}

/** How long to hold off after a failure the provider did not put a time on. */
const DEFAULT_COOLDOWN_MS = 30000;

const health = new Map<string, ProviderHealth>();

export function record_provider_outcome(
  profile_id: string,
  outcome: ProviderOutcome,
  now: number = Date.now(),
  retry_after_ms?: number,
): void {
  health.set(profile_id, {
    outcome,
    at: now,
    ...(outcome === "rate_limited" || outcome === "unavailable"
      ? {
          retry_at:
            now +
            Math.min(
              Math.max(0, retry_after_ms ?? DEFAULT_COOLDOWN_MS),
              86400000,
            ),
        }
      : {}),
  });
}

export function read_provider_health(
  profile_id: string,
): ProviderHealth | undefined {
  return health.get(profile_id);
}

/** Remaining hold-off in whole seconds, or 0 when a request may go now. */
export function cooldown_remaining_seconds(
  profile_id: string,
  now: number = Date.now(),
): number {
  const entry = health.get(profile_id);
  if (!entry?.retry_at) return 0;
  return Math.max(0, Math.ceil((entry.retry_at - now) / 1000));
}

/** Called when a question succeeds, so a stale failure stops being shown. */
export function clear_provider_health(profile_id: string): void {
  health.delete(profile_id);
}

/** Tests only: the map is process-wide. */
export function reset_provider_health(): void {
  health.clear();
}
