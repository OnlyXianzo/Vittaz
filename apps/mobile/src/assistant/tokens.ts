/**
 * Token usage presentation.
 *
 * The QA loop already computes `tokensUsed` for the token budget; until now the
 * app threw it away. These helpers only format numbers that already exist, so
 * nothing new is measured and no prompt or reply text is involved.
 *
 * Kept pure and separate from React so it can be unit-tested and reused by the
 * chat screen and any future usage screen.
 */

/** Format a token count for display, e.g. 1234 -> "1,234". */
export function format_tokens(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0";
  return Math.trunc(value).toLocaleString("en-US");
}

/**
 * One-line usage summary. `undefined` means "no answer in this session yet",
 * which the caller should render as nothing rather than "0 tokens".
 */
export function describe_usage(
  last_tokens: number | undefined,
  session_tokens: number | undefined,
): string | null {
  if (last_tokens === undefined && session_tokens === undefined) return null;
  const last = format_tokens(last_tokens ?? 0);
  const session = format_tokens(session_tokens ?? 0);
  return `${last} tokens · ${session} this session`;
}
