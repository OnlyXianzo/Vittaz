import { z } from "zod";
import { checkSensitiveMessage } from "@vittaz/core";
import type { AssistantService } from "@vittaz/core";
import { readText } from "./http_body.js";
const id = z.number().int().safe();
const offset = id.nonnegative().max(Number.MAX_SAFE_INTEGER - 1);
const digest = z.strictObject({
  unverified_count: id.nonnegative(),
  daily_allowance_paise: id,
});
export function buildTelegramDigest(input: unknown): string {
  const v = digest.parse(input);
  const n = BigInt(v.daily_allowance_paise);
  const abs = n < 0n ? -n : n;
  return `Unverified entries: ${v.unverified_count}\nDaily allowance: INR ${n < 0n ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
export interface TelegramSettingsPort {
  read(): Promise<unknown>;
  write(patch: { paired_chat_id?: number; offset?: number }): Promise<void>;
}
const stateSchema = z.strictObject({
  token: z.string().nullable(),
  primary_device: z.boolean(),
  paired_chat_id: id.positive().nullable(),
  offset,
});
const updateSchema = z.object({
  update_id: offset,
  message: z
    .object({
      chat: z.object({ id, type: z.string() }),
      text: z.string().max(8192).optional(),
    })
    .optional(),
});
const envelope = z.object({
  ok: z.boolean(),
  result: z.unknown().optional(),
  error_code: z.number().int().optional(),
  parameters: z.object({ retry_after: id.positive().max(86400) }).optional(),
});
type HttpCode = "conflict" | "rate_limited" | "unavailable";
export class TelegramHttpError extends Error {
  constructor(
    readonly code: HttpCode,
    readonly retry_after_ms: number | null = null,
  ) {
    super(`telegram_${code}`);
  }
}
export class TelegramHttpApi {
  #base: string;
  #fetch: typeof fetch;
  #timeout: number;
  constructor(
    options: {
      base_url?: string;
      fetch?: typeof fetch;
      timeout_ms?: number;
    } = {},
  ) {
    const url = new URL(options.base_url ?? "https://api.telegram.org");
    if (
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        )) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error("telegram_invalid_base_url");
    this.#base = url.origin;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeout = z
      .number()
      .int()
      .min(1)
      .max(30000)
      .parse(options.timeout_ms ?? 30000);
  }
  async #request<T>(
    token: string,
    method: "getUpdates" | "sendMessage",
    body: unknown,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    try {
      if (!/^\d{1,20}:[A-Za-z0-9_-]{20,200}$/.test(token)) throw new Error();
      const response = await this.#fetch(
        `${this.#base}/bot${token}/${method}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          redirect: "error",
          signal: AbortSignal.any([
            AbortSignal.timeout(this.#timeout),
            ...(signal ? [signal] : []),
          ]),
        },
      );
      let text = "";
      for await (const chunk of readText(response)) text += chunk;
      const parsed = envelope.parse(JSON.parse(text));
      if (response.status === 409) throw new TelegramHttpError("conflict");
      if (response.status === 429)
        throw new TelegramHttpError(
          "rate_limited",
          (parsed.parameters?.retry_after ?? 60) * 1000,
        );
      if (!response.ok || !parsed.ok) throw new Error();
      return schema.parse(parsed.result);
    } catch (error) {
      if (error instanceof TelegramHttpError) throw error;
      throw new TelegramHttpError("unavailable");
    }
  }
  getUpdates(token: string, from: number, signal?: AbortSignal) {
    return this.#request(
      token,
      "getUpdates",
      { offset: from, limit: 100, timeout: 25, allowed_updates: ["message"] },
      z.array(updateSchema).max(100),
      signal,
    );
  }
  async sendMessage(
    token: string,
    chat_id: number,
    text: string,
    signal?: AbortSignal,
  ) {
    await this.#request(
      token,
      "sendMessage",
      { chat_id, text: text.replaceAll(token, "[REDACTED]").slice(0, 4096) },
      z.object({ message_id: id }),
      signal,
    );
  }
}
export interface TelegramConnectorDependencies {
  settings: TelegramSettingsPort;
  assistant: AssistantService;
  api: TelegramHttpApi;
  generate_pairing_code: () => string;
  now: () => number;
}
type Status =
  | "ok"
  | "sent"
  | "inactive"
  | "busy"
  | "conflict"
  | "rate_limited"
  | "unavailable"
  | "aborted";
export interface TelegramResult {
  status: Status;
  retry_after_ms: number | null;
}
const result = (
  status: Status,
  retry_after_ms: number | null = null,
): TelegramResult => ({ status, retry_after_ms });
class TelegramPairingError extends Error {
  constructor(reason: "inactive" | "already_paired" | "unavailable") {
    super(`telegram_${reason}`);
  }
}
export class TelegramConnector {
  #code: { value: string; expires: number; attempts: number } | null = null;
  #busy = false;
  #conflict = false;
  #blockedUntil = 0;
  constructor(private readonly deps: TelegramConnectorDependencies) {}
  async beginPairing() {
    try {
      const state = stateSchema.parse(await this.deps.settings.read());
      if (!state.primary_device || !state.token)
        throw new TelegramPairingError("inactive");
      if (state.paired_chat_id !== null)
        throw new TelegramPairingError("already_paired");
      const value = z
        .string()
        .regex(/^\d{6}$/)
        .parse(this.deps.generate_pairing_code());
      const expires = this.#now() + 300000;
      this.#code = { value, expires, attempts: 0 };
      return { pairing_code: value, expires_at: expires };
    } catch (error) {
      if (error instanceof TelegramPairingError) throw error;
      throw new TelegramPairingError("unavailable");
    }
  }

  #now() {
    return z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 300000)
      .parse(this.deps.now());
  }
  #failure(error: unknown, signal?: AbortSignal): TelegramResult {
    if (signal?.aborted) return result("aborted");
    if (error instanceof TelegramHttpError) {
      if (error.code === "conflict") this.#conflict = true;
      if (error.code === "rate_limited")
        this.#blockedUntil = this.#now() + error.retry_after_ms!;
      return result(error.code, error.retry_after_ms);
    }
    return result("unavailable");
  }
  async #message(
    update: z.infer<typeof updateSchema>,
    state: z.infer<typeof stateSchema>,
    signal?: AbortSignal,
  ) {
    const message = update.message;
    if (
      !message ||
      message.chat.type !== "private" ||
      message.chat.id <= 0 ||
      !message.text ||
      checkSensitiveMessage(message.text).sensitive
    )
      return;
    const text = message.text.trim();
    if (state.paired_chat_id === null) {
      if (!this.#code) return;
      if (this.#now() >= this.#code.expires) {
        this.#code = null;
        return;
      }
      const code = this.#code;
      code.attempts++;
      if (text !== code.value && text !== `/start ${code.value}`) {
        if (code.attempts >= 5) this.#code = null;
        return;
      }
      this.#code = null;
      await this.deps.settings.write({
        paired_chat_id: message.chat.id,
        offset: update.update_id + 1,
      });
      state.paired_chat_id = message.chat.id;
      await this.deps.api.sendMessage(
        state.token!,
        message.chat.id,
        "Paired with Vittaz.",
        signal,
      );
      return;
    }
    if (state.paired_chat_id !== message.chat.id) return;
    const reply = await this.deps.assistant.handle(
      {
        request_id: `telegram_${state.token!.split(":")[0]}_${update.update_id}`,
        conversation_id: "main",
        action: "question",
        text,
      },
      { source: "telegram", authenticated: true, paired_telegram: true },
      { signal },
    );
    if (reply.text !== null && reply.status === "answered")
      await this.deps.api.sendMessage(
        state.token!,
        message.chat.id,
        reply.text,
        signal,
      );
  }
  async pollOnce(signal?: AbortSignal): Promise<TelegramResult> {
    if (signal?.aborted) return result("aborted");
    if (this.#busy) return result("busy");
    if (this.#conflict) return result("conflict");
    this.#busy = true;
    try {
      if (this.#now() < this.#blockedUntil)
        return result("rate_limited", this.#blockedUntil - this.#now());
      const state = stateSchema.parse(await this.deps.settings.read());
      if (!state.primary_device || !state.token) return result("inactive");
      const updates = await this.deps.api.getUpdates(
        state.token,
        state.offset,
        signal,
      );
      for (const update of updates.sort((a, b) => a.update_id - b.update_id)) {
        if (signal?.aborted) return result("aborted");
        if (update.update_id < state.offset) continue;
        await this.#message(update, state, signal);
        state.offset = update.update_id + 1;
        await this.deps.settings.write({ offset: state.offset });
      }
      return result("ok");
    } catch (error) {
      return this.#failure(error, signal);
    } finally {
      this.#busy = false;
    }
  }
  async sendDigest(
    input: unknown,
    signal?: AbortSignal,
  ): Promise<TelegramResult> {
    if (signal?.aborted) return result("aborted");
    if (this.#busy) return result("busy");
    if (this.#conflict) return result("conflict");
    this.#busy = true;
    try {
      if (this.#now() < this.#blockedUntil)
        return result("rate_limited", this.#blockedUntil - this.#now());
      const state = stateSchema.parse(await this.deps.settings.read());
      if (
        !state.primary_device ||
        !state.token ||
        state.paired_chat_id === null
      )
        return result("inactive");
      await this.deps.api.sendMessage(
        state.token,
        state.paired_chat_id,
        buildTelegramDigest(input),
        signal,
      );
      return result("sent");
    } catch (error) {
      return this.#failure(error, signal);
    } finally {
      this.#busy = false;
    }
  }
}
