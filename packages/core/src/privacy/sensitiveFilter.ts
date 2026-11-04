export type SensitiveReason =
  | "invalid_input"
  | "otp"
  | "pin"
  | "cvv"
  | "password"
  | "do_not_share"
  | "hinglish_do_not_share"
  | "hinglish_secret"
  | "hindi_sensitive";

export type SensitiveCheckResult =
  | { sensitive: true; reason: SensitiveReason }
  | { sensitive: false; reason: null };

// Unicode letters/marks protect Indic words; adjacent digits still trigger a drop.
const bounded = (pattern: string): RegExp =>
  new RegExp(
    String.raw`(?<![\p{L}\p{M}_])(?:${pattern})(?![\p{L}\p{M}_])`,
    "iu",
  );

const patterns: ReadonlyArray<readonly [SensitiveReason, RegExp]> = [
  [
    "otp",
    bounded(
      String.raw`otp|one[\s-]*time[\s-]*password|(?:verification|auth(?:entication)?|security)[\s-]+code`,
    ),
  ],
  ["pin", bounded(String.raw`(?:upi\s*|atm\s*|m|t)?pin`)],
  ["cvv", bounded(String.raw`cvv2?|cvc2?`)],
  [
    "password",
    bounded(String.raw`password|passcode|secret\s+code|netbanking\s+login`),
  ],
  [
    "do_not_share",
    bounded(String.raw`do[\s-]+not[\s-]+share|don['’]?t\s+share|never\s+share`),
  ],
  [
    "hinglish_do_not_share",
    bounded(
      String.raw`kisi\s+(?:ko|se|ke\s+saath)\s+(?:mat\s+bata(?:na|o|iye)|share\s+(?:na|mat)\s+kar(?:e|ein|o|na))|share\s+(?:mat|na)\s+kar(?:o|e|ein)|mat\s+batana`,
    ),
  ],
  [
    "hinglish_secret",
    bounded(
      String.raw`gupt\s+(?:code|pin|password)|apna\s+(?:pin|otp|cvv|password)`,
    ),
  ],
  [
    "hindi_sensitive",
    bounded(
      String.raw`ओटीपी|पिन|पासवर्ड|सीवीवी|गुप्त\s+कोड|साझा\s+न\s+करें|किसी\s+को\s+(?:न|मत)\s+बताएं|शेयर\s+(?:न|मत)\s+करें`,
    ),
  ],
];

/** Pure classification only. Never return matched text or attach diagnostics. */
export function checkSensitiveMessage(text: unknown): SensitiveCheckResult {
  if (typeof text !== "string")
    return { sensitive: true, reason: "invalid_input" };
  const normalized = text.normalize("NFKC").replace(/\p{Cf}/gu, "");
  if (normalized.trim().length === 0)
    return { sensitive: true, reason: "invalid_input" };
  for (const [reason, pattern] of patterns) {
    if (pattern.test(normalized)) return { sensitive: true, reason };
  }
  return { sensitive: false, reason: null };
}

/** Future ingress callers must use this BEFORE storing, logging or sending text. */
export async function withNonSensitiveMessage<T>(
  text: unknown,
  process: (text: string) => T | Promise<T>,
): Promise<
  { dropped: true; reason: SensitiveReason } | { dropped: false; value: T }
> {
  const input = typeof text === "string" ? text : "";
  const check = checkSensitiveMessage(input);
  if (check.sensitive) return { dropped: true, reason: check.reason };
  return { dropped: false, value: await process(input) };
}
