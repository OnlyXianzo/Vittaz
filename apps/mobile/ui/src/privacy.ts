/**
 * On-device privacy guard for the chat preview.
 *
 * This is a UI-side mock of the backend privacy layer. It never leaves the
 * browser, never stores what it removes, and never logs raw matches. The real
 * enforcement lives in `packages/core` (backend-owned); this module only lets
 * the preview show what the assistant would be allowed to see.
 */

export type SensitiveKind =
  | "account"
  | "card"
  | "ifsc"
  | "upi"
  | "phone"
  | "email"
  | "aadhaar"
  | "pan"
  | "otp"
  | "pin"
  | "cvv"
  | "password"
  | "apikey";

export interface SensitiveFinding {
  kind: SensitiveKind;
  label: string;
  placeholder: string;
  count: number;
}

export interface PrivacyScan {
  /** Text with every sensitive span replaced by a placeholder. */
  safeText: string;
  /** Unique findings in order of first appearance. Never contains raw values. */
  findings: SensitiveFinding[];
  /** Total number of removed spans. */
  removed: number;
  clean: boolean;
}

const LABELS: Record<SensitiveKind, { label: string; placeholder: string }> = {
  account: { label: "account number", placeholder: "[account hidden]" },
  card: { label: "card number", placeholder: "[card hidden]" },
  ifsc: { label: "IFSC code", placeholder: "[IFSC hidden]" },
  upi: { label: "UPI ID", placeholder: "[UPI ID hidden]" },
  phone: { label: "phone number", placeholder: "[phone hidden]" },
  email: { label: "email address", placeholder: "[email hidden]" },
  aadhaar: { label: "Aadhaar number", placeholder: "[Aadhaar hidden]" },
  pan: { label: "PAN", placeholder: "[PAN hidden]" },
  otp: { label: "one-time password", placeholder: "[OTP hidden]" },
  pin: { label: "PIN", placeholder: "[PIN hidden]" },
  cvv: { label: "CVV", placeholder: "[CVV hidden]" },
  password: { label: "password", placeholder: "[password hidden]" },
  apikey: { label: "API key or bot token", placeholder: "[key hidden]" },
};

interface Rule {
  kind: SensitiveKind;
  pattern: RegExp;
  /** When a rule captures a group, only that group is replaced. */
  group?: number;
  accept?: (value: string) => boolean;
}

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = digits.charCodeAt(i) - 48;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Ordered so specific shapes win before the generic digit-run rule. */
const RULES: Rule[] = [
  {
    kind: "apikey",
    pattern: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/g,
  },
  {
    kind: "apikey",
    pattern: /\b(?:sk|pk|rk|ghp|github_pat|xoxb|AIza)[-_.][A-Za-z0-9_-]{8,}\b/g,
  },
  {
    kind: "otp",
    pattern:
      /\b(?:otp|one[\s-]?time[\s-]?(?:password|code|pin))\s*(?:is|:|=|#)?\s*(\d{4,8})\b/gi,
    group: 1,
  },
  {
    kind: "cvv",
    pattern: /\bcvv\s*(?:is|:|=|#)?\s*(\d{3,4})\b/gi,
    group: 1,
  },
  {
    kind: "pin",
    pattern: /\b(?:atm[\s-]?)?m?pin\s*(?:is|:|=|#)?\s*(\d{4,6})\b/gi,
    group: 1,
  },
  {
    kind: "password",
    pattern: /\b(?:password|passwd|pwd)\s*(?:is|:|=)?\s*(\S{3,})/gi,
    group: 1,
  },
  {
    kind: "email",
    pattern:
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g,
  },
  {
    kind: "upi",
    pattern: /\b[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9._-]{1,}\b/g,
  },
  { kind: "ifsc", pattern: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
  { kind: "pan", pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  {
    kind: "phone",
    pattern: /(?:\+91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g,
  },
  {
    kind: "account",
    pattern:
      /\b(?:a\/c|acct|account)\s*(?:no\.?|number|#)?\s*[:#]?\s*(\d{4,})\b/gi,
    group: 1,
  },
  {
    kind: "account",
    pattern: /\b\d(?:[ -]?\d){8,18}\b/g,
    accept: () => true,
  },
];

function classifyDigitRun(raw: string): SensitiveKind | null {
  const digits = raw.replace(/[ -]/g, "");
  if (digits.length === 12) return "aadhaar";
  if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return "card";
  if (digits.length >= 9 && digits.length <= 18) return "account";
  return null;
}

/**
 * Replaces sensitive spans with placeholders and reports what was removed.
 * Amounts, dates and merchant names are intentionally preserved so the demo
 * parser can still draft an entry from the cleaned text.
 */
export function scanAndRedact(input: string): PrivacyScan {
  let safeText = input;
  const counts = new Map<SensitiveKind, number>();
  const order: SensitiveKind[] = [];

  function record(kind: SensitiveKind, times = 1) {
    if (!counts.has(kind)) order.push(kind);
    counts.set(kind, (counts.get(kind) ?? 0) + times);
  }

  for (const rule of RULES) {
    safeText = safeText.replace(rule.pattern, (...args) => {
      const match = args[0] as string;
      const captured =
        rule.group !== undefined ? (args[rule.group] as string) : match;
      if (!captured) return match;
      if (rule.accept && !rule.accept(captured)) return match;

      let kind = rule.kind;
      if (rule.kind === "account" && rule.group === undefined) {
        const detected = classifyDigitRun(captured);
        if (!detected) return match;
        kind = detected;
      }
      // Skip anything already replaced by an earlier rule.
      if (captured.includes("hidden]") || captured.startsWith("["))
        return match;

      record(kind);
      const placeholder = LABELS[kind].placeholder;
      if (rule.group === undefined) return placeholder;
      return match.replace(captured, placeholder);
    });
  }

  // Report in the order the values appeared in the message, not rule order.
  order.sort(
    (a, b) =>
      safeText.indexOf(LABELS[a].placeholder) -
      safeText.indexOf(LABELS[b].placeholder),
  );
  const findings: SensitiveFinding[] = order.map((kind) => ({
    kind,
    label: LABELS[kind].label,
    placeholder: LABELS[kind].placeholder,
    count: counts.get(kind) ?? 0,
  }));
  const removed = findings.reduce((sum, f) => sum + f.count, 0);
  return { safeText, findings, removed, clean: removed === 0 };
}

export function sensitiveLabels(scan: PrivacyScan): string[] {
  return scan.findings.map((f) =>
    f.count > 1 ? `${f.label} ×${f.count}` : f.label,
  );
}
