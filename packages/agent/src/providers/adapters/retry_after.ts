/**
 * The longest cooldown the key pool will accept for one key.
 *
 * A provider may ask for more, and a hostile one may ask for a decade. Both are
 * capped here rather than being allowed to disable a key for good: the pool
 * rejects out-of-range values outright, and a rejected cooldown would turn a
 * rate limit into a crash.
 */
const MAX_COOLDOWN_MS = 86400000;

/**
 * `Retry-After` from an SDK error, in milliseconds.
 *
 * The SDK puts the raw response headers on its call errors and the pool has
 * always accepted a cooldown, but nothing ever connected the two: every 429 was
 * cooled down for the pool's 30 s default no matter what the provider asked
 * for. Returns `undefined` when the header is absent or unusable, so the caller
 * keeps its default.
 *
 * Both header forms are supported — delta-seconds and an HTTP date — because
 * providers use both.
 */
export function retry_after_ms(
  error: unknown,
  now: number = Date.now(),
): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const headers = (error as { responseHeaders?: unknown }).responseHeaders;
  if (typeof headers !== "object" || headers === null) return undefined;

  let raw: unknown;
  for (const [name, value] of Object.entries(
    headers as Record<string, unknown>,
  )) {
    if (name.toLowerCase() !== "retry-after") continue;
    raw = value;
    break;
  }
  if (typeof raw !== "string" || !raw.trim()) return undefined;

  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    // A number too large to be a safe integer is still a request to wait a long
    // time, so it is capped like any other oversized wait rather than being
    // dismissed as unparseable.
    if (!Number.isSafeInteger(seconds)) return MAX_COOLDOWN_MS;
    return Math.min(seconds * 1000, MAX_COOLDOWN_MS);
  }

  const when = Date.parse(trimmed);
  if (Number.isNaN(when)) return undefined;
  // A date in the past means "retry now"; never a negative cooldown.
  return Math.min(Math.max(0, when - now), MAX_COOLDOWN_MS);
}
