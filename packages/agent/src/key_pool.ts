export interface KeyConfig {
  nickname: string;
  apiKey: string;
  provider?: string;
  model?: string;
}
export interface KeyEntryInternal {
  nickname: string;
  apiKey: string;
  provider: string;
  model: string;
  disabled: boolean;
  cooldownUntil: number;
  lastFailureReason: string | null;
}
export interface KeyStatusSnapshot {
  nickname: string;
  provider: string;
  model: string;
  state: "healthy" | "cooldown" | "disabled";
  lastFailureReason: string | null;
}
export interface KeyFailureRecord {
  nickname: string;
  reason:
    | "unauthorized"
    | "rate_limited"
    | "provider_error"
    | "disabled"
    | "cooldown";
}
export class BadRequestNoFallbackError extends Error {
  readonly status = 400;
  constructor() {
    super("Provider rejected request (400); fallback disabled");
    this.name = "BadRequestNoFallbackError";
  }
}
export class AllKeysFailedError extends Error {
  readonly failures: readonly KeyFailureRecord[];
  constructor(failures: readonly KeyFailureRecord[]) {
    super("Unable to complete AI request because all configured keys failed");
    this.name = "AllKeysFailedError";
    this.failures = failures.map((x) => ({ ...x }));
  }
}
function cooldown(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 86400000)
    throw new Error("Invalid cooldown");
  return value;
}
export class KeyPool {
  #entries: KeyEntryInternal[];
  #now: () => number;
  #cooldown: number;
  constructor(
    keys: readonly KeyConfig[],
    options: { defaultCooldownMs?: number; nowFn?: () => number } = {},
  ) {
    if (
      !Array.isArray(keys) ||
      keys.length === 0 ||
      keys.length > 8 ||
      new Set(keys.map((k) => k.nickname)).size !== keys.length ||
      keys.some(
        (k) =>
          !/^[a-z][a-z0-9_-]{0,31}$/.test(k.nickname) ||
          typeof k.apiKey !== "string" ||
          /\s/.test(k.apiKey) ||
          k.apiKey.length > 4096 ||
          [k.provider, k.model].some(
            (value) =>
              value !== undefined &&
              (typeof value !== "string" ||
                value.length === 0 ||
                value.length > 128 ||
                /[\r\n]/.test(value)),
          ) ||
          k.apiKey === k.nickname,
      )
    )
      throw new Error("Invalid key configuration");
    this.#cooldown = cooldown(options.defaultCooldownMs ?? 30000);
    this.#now = options.nowFn ?? (() => Date.now());
    this.#entries = keys.map((k) => ({
      ...k,
      provider: k.provider ?? "openai-compatible",
      model: k.model ?? "gpt-4o-mini",
      disabled: false,
      cooldownUntil: 0,
      lastFailureReason: null,
    }));
  }
  getCandidateEntries(
    triedNicknames: ReadonlySet<string> = new Set(),
  ): KeyEntryInternal[] {
    const now = this.#now();
    return this.#entries
      .filter(
        (e) =>
          !e.disabled &&
          now >= e.cooldownUntil &&
          !triedNicknames.has(e.nickname),
      )
      .map((e) => ({ ...e }));
  }
  markUnauthorized(nickname: string): void {
    const e = this.#entries.find((e) => e.nickname === nickname);
    if (e) {
      e.disabled = true;
      e.lastFailureReason = "unauthorized";
    }
  }
  markRateLimited(nickname: string, retryAfterMs?: number): void {
    const e = this.#entries.find((e) => e.nickname === nickname);
    if (e) {
      e.cooldownUntil = this.#now() + cooldown(retryAfterMs ?? this.#cooldown);
      e.lastFailureReason = "rate_limited";
    }
  }
  getStatusSnapshot(): KeyStatusSnapshot[] {
    const now = this.#now();
    return this.#entries.map((e) => ({
      nickname: e.nickname,
      provider: e.provider,
      model: e.model,
      state: e.disabled
        ? "disabled"
        : now < e.cooldownUntil
          ? "cooldown"
          : "healthy",
      lastFailureReason: e.lastFailureReason,
    }));
  }
}
