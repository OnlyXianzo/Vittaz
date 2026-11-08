import { readText, ProtocolError } from "./http_body.js";
import { z } from "zod";
import { checkSensitiveMessage, PrivacyRedactor } from "@vittaz/core";
import { AllKeysFailedError, BadRequestNoFallbackError } from "./key_pool.js";
import type { KeyFailureRecord, KeyPool } from "./key_pool.js";
import { report_agent_diagnostic } from "./diagnostics.js";
import type {
  AgentDiagnosticReason,
  AgentDiagnosticReporter,
} from "./diagnostics.js";
const toolCall = z.object({
  id: z.string().max(128).optional(),
  type: z.literal("function").optional(),
  function: z.object({
    name: z.string().regex(/^[a-z][a-z0-9_]{0,127}$/),
    arguments: z.string().max(65536),
  }),
});
const toolSpec = z.strictObject({
  type: z.literal("function"),
  function: z.strictObject({
    name: z.string().regex(/^[a-z][a-z0-9_]{0,127}$/),
    description: z.string().max(4096),
    parameters: z.record(z.string(), z.unknown()),
  }),
});
const message = z.strictObject({
  role: z.enum(["system", "developer", "user", "assistant", "tool"]),
  content: z.string().max(32768).nullable(),
  tool_calls: z.array(toolCall).max(16).optional(),
  tool_call_id: z.string().max(128).optional(),
});
const usage = z.object({
  prompt_tokens: z.int().nonnegative(),
  completion_tokens: z.int().nonnegative(),
  total_tokens: z.int().nonnegative(),
});
const request = z.strictObject({
  stream: z.boolean().optional(),
  messages: z.array(message).min(1).max(64),
  tools: z.array(toolSpec).max(16).optional(),
  maxCompletionTokens: z.int().min(1).max(8192).optional(),
});
const completion = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z.array(toolCall).max(16).optional(),
        }),
      }),
    )
    .length(1),
  usage: usage.nullish(),
});
const delta = z.object({
  content: z.string().nullable().optional(),
  tool_calls: z
    .array(
      z.object({
        index: z.int().min(0).max(15),
        id: z.string().max(128).optional(),
        type: z.literal("function").optional(),
        function: z
          .object({
            name: z.string().optional(),
            arguments: z.string().optional(),
          })
          .optional(),
      }),
    )
    .max(16)
    .optional(),
});
const chunk = z.object({
  choices: z
    .array(
      z.object({
        index: z.literal(0).optional(),
        delta: delta.optional(),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .max(1)
    .optional(),
  usage: usage.nullish(),
});
export type ChatMessage = z.infer<typeof message>;
export type ToolCallPayload = z.infer<typeof toolCall>;
export type ToolSpec = z.infer<typeof toolSpec>;
export type TokenUsage = z.infer<typeof usage>;
export interface ChatCompletionResult {
  content: string;
  toolCalls: ToolCallPayload[];
  usage: TokenUsage;
  keyNickname: string;
}
export interface ChatCompletionParams {
  messages: ChatMessage[];
  tools?: readonly ToolSpec[];
  stream?: boolean;
  signal?: AbortSignal;
  onStreamDelta?: ((delta: string) => void) | null;
  onStreamReset?: (() => void) | null;
  maxCompletionTokens?: number;
  /** Optional codebook-only reporter. Never receives request or response content. */
  onDiagnostic?: AgentDiagnosticReporter;
}
export interface CompletionClient {
  chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult>;
}
function sanitizeJsonText(text: string, redactor: PrivacyRedactor): string {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === "object")
      return JSON.stringify(sanitizeValue(parsed, redactor));
  } catch {
    /* not JSON; sanitize as plain text */
  }
  return redactor.redactOutboundText(text);
}
function sanitizeValue(value: unknown, redactor: PrivacyRedactor): unknown {
  if (typeof value === "string") return redactor.redactOutboundText(value);
  if (Array.isArray(value))
    return value.map((item) => sanitizeValue(item, redactor));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitizeValue(item, redactor),
      ]),
    );
  return value;
}
function sanitizeWire(
  wire: z.infer<typeof request>,
  redactor: PrivacyRedactor,
): z.infer<typeof request> {
  return {
    ...wire,
    messages: wire.messages.map((message) => ({
      ...message,
      content:
        message.content === null
          ? null
          : sanitizeJsonText(message.content, redactor),
      ...(message.tool_calls
        ? {
            tool_calls: message.tool_calls.map((call) => ({
              ...call,
              function: {
                ...call.function,
                arguments: sanitizeJsonText(call.function.arguments, redactor),
              },
            })),
          }
        : {}),
    })),
    ...(wire.tools
      ? {
          tools: wire.tools.map((tool) => ({
            ...tool,
            function: {
              ...tool.function,
              description: redactor.redactOutboundText(
                tool.function.description,
              ),
              parameters: tool.function.parameters,
            },
          })),
        }
      : {}),
  };
}
/** Shared preflight before framework callbacks or HTTP. Owns a cloned wire snapshot. */
export function validateCompletionRequest(
  params: ChatCompletionParams,
  redactor: PrivacyRedactor = new PrivacyRedactor(),
) {
  let wire: z.infer<typeof request>;
  let callerSignal: AbortSignal | undefined;
  try {
    callerSignal = z.instanceof(AbortSignal).optional().parse(params.signal);
    wire = request.parse({
      stream: params.stream,
      messages: params.messages,
      tools: params.tools,
      maxCompletionTokens: params.maxCompletionTokens,
    });
  } catch {
    throw new Error("Invalid provider request");
  }
  if (checkSensitiveMessage(JSON.stringify(wire)).sensitive)
    throw new Error("Sensitive provider input rejected");
  try {
    wire = request.parse(sanitizeWire(wire, redactor));
    const bodySize = new TextEncoder().encode(JSON.stringify(wire)).byteLength;
    if (bodySize > 64512) throw new Error();
  } catch {
    throw new Error("Invalid provider request");
  }
  return { wire, callerSignal };
}

class CallbackError extends Error {
  constructor() {
    super("Provider callback failed");
  }
}
class HttpFailure extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super("Provider HTTP failure");
  }
}
class ClassifiedFailure extends Error {
  constructor(readonly reason: KeyFailureRecord["reason"]) {
    super("Provider request failed");
  }
}
function cancelled(): Error {
  const e = new Error("Provider request cancelled or timed out");
  e.name = "AbortError";
  return e;
}
function notify(action: () => void): void {
  try {
    action();
  } catch {
    throw new CallbackError();
  }
}
const zeroUsage = (): TokenUsage => ({
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
});
function diagnostic_failure_reason(
  reason: KeyFailureRecord["reason"] | undefined,
): AgentDiagnosticReason {
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
    default:
      return "provider_error";
  }
}
function http_failure_reason(status: number) {
  if (status === 400) return "request_rejected" as const;
  if (status === 401) return "unauthorized" as const;
  if (status === 403) return "access_denied" as const;
  if (status === 429) return "rate_limited" as const;
  if (status >= 500) return "provider_unavailable" as const;
  return "provider_http_error" as const;
}
function retryAfter(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Math.min(Number(value) * 1000, 86400000);
  if (
    !/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
      value,
    )
  )
    return undefined;
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.min(86400000, Math.max(0, date - now))
    : undefined;
}

async function parseResponse(
  response: Response,
  stream: boolean,
  params: ChatCompletionParams,
): Promise<Omit<ChatCompletionResult, "keyNickname">> {
  if (!stream) {
    let body = "";
    for await (const text of readText(response)) body += text;
    const parsed = completion.parse(JSON.parse(body));
    const first = parsed.choices[0]!.message;
    return {
      content: first.content ?? "",
      toolCalls: first.tool_calls ?? [],
      usage: parsed.usage ?? zeroUsage(),
    };
  }
  let buffer = "",
    content = "",
    seen = false;
  let tokens = zeroUsage();
  const calls = new Map<
    number,
    {
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }
  >();
  for await (const text of readText(response)) {
    buffer += text;
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(buffer)) !== null) {
      const event = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (!data) continue;
      if (data === "[DONE]") {
        if (!seen) throw new ProtocolError();
        return {
          content,
          toolCalls: z
            .array(toolCall)
            .parse(
              [...calls.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([, value]) => value),
            ),
          usage: tokens,
        };
      }
      const raw = JSON.parse(data) as object;
      if (raw && "error" in raw) throw new ProtocolError();
      const parsed = chunk.parse(raw);
      if (parsed.usage) tokens = parsed.usage;
      for (const choice of parsed.choices ?? []) {
        seen = true;
        const d = choice.delta;
        if (!d) continue;
        if (d.content) {
          content += d.content;
          notify(() => params.onStreamDelta?.(d.content!));
        }
        for (const c of d.tool_calls ?? []) {
          const current = calls.get(c.index) ?? {
            id: `call_${c.index}`,
            type: "function" as const,
            function: { name: "", arguments: "" },
          };
          if (c.id) current.id = c.id;
          if (c.function?.name) current.function.name += c.function.name;
          if (c.function?.arguments)
            current.function.arguments += c.function.arguments;
          calls.set(c.index, current);
        }
      }
    }
  }
  throw new ProtocolError();
}
/** Low-level protocol adapter, no DB/logger/tool execution. Service must redact outbound context. */
export class OpenAICompatibleClient {
  #url: string;
  #pool: KeyPool;
  #fetch: typeof fetch;
  #timeout: number;
  #now: () => number;
  #redactor: PrivacyRedactor;
  constructor(params: {
    baseUrl: string;
    keyPool: KeyPool;
    fetch?: typeof fetch;
    timeoutMs?: number;
    nowFn?: () => number;
    redactor?: PrivacyRedactor;
  }) {
    try {
      const url = new URL(params.baseUrl);
      const timeout = params.timeoutMs ?? 30000;
      if (
        (url.protocol !== "https:" &&
          !(
            url.protocol === "http:" &&
            ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)
          )) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !Number.isSafeInteger(timeout) ||
        timeout < 1 ||
        timeout > 300000
      )
        throw new Error();
      this.#url = url.href.replace(/\/+$/, "") + "/v1/chat/completions";
      this.#timeout = timeout;
    } catch {
      throw new Error("Invalid provider configuration");
    }
    this.#pool = params.keyPool;
    this.#fetch = params.fetch ?? fetch;
    this.#now = params.nowFn ?? (() => Date.now());
    this.#redactor = params.redactor ?? new PrivacyRedactor();
  }
  async chatCompletion(
    params: ChatCompletionParams,
  ): Promise<ChatCompletionResult> {
    const { wire, callerSignal } = validateCompletionRequest(
      params,
      this.#redactor,
    );
    const deadline = AbortSignal.timeout(this.#timeout);
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, deadline])
      : deadline;
    const tried = new Set<string>();
    const failures: KeyFailureRecord[] = [];
    while (true) {
      if (signal.aborted) throw cancelled();
      const entry = this.#pool.getCandidateEntries(tried)[0];
      if (!entry) {
        if (failures.length === 0)
          for (const s of this.#pool.getStatusSnapshot())
            if (s.state !== "healthy")
              failures.push({ nickname: s.nickname, reason: s.state });
        throw new AllKeysFailedError(failures);
      }
      tried.add(entry.nickname);
      const request_started_at = this.#now();
      report_agent_diagnostic(params.onDiagnostic, {
        event_code: "provider_request_started",
        source: "provider_http",
        outcome: "started",
      });
      try {
        let response: Response;
        try {
          response = await this.#fetch(this.#url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(entry.apiKey
                ? { Authorization: `Bearer ${entry.apiKey}` }
                : {}),
            },
            body: JSON.stringify({
              model: entry.model,
              messages: wire.messages,
              stream: wire.stream ?? false,
              ...(params.stream
                ? { stream_options: { include_usage: true } }
                : {}),
              ...(wire.tools?.length ? { tools: wire.tools } : {}),
              ...(wire.maxCompletionTokens
                ? { max_completion_tokens: wire.maxCompletionTokens }
                : {}),
            }),
            redirect: "error",
            signal,
          });
        } catch {
          const was_cancelled = callerSignal?.aborted === true;
          report_agent_diagnostic(params.onDiagnostic, {
            event_code: "provider_fetch_failed",
            source: "provider_http",
            outcome: "failed",
            reason_code: signal.aborted
              ? was_cancelled
                ? "cancelled"
                : "timeout"
              : "connection_error",
            elapsed_ms: Math.max(0, this.#now() - request_started_at),
          });
          if (signal.aborted) throw cancelled();
          throw new ClassifiedFailure("connection_error");
        }
        const response_reason = response.ok
          ? "ok"
          : http_failure_reason(response.status);
        report_agent_diagnostic(params.onDiagnostic, {
          event_code: "provider_http_response",
          source: "provider_http",
          outcome: response.ok ? "completed" : "failed",
          reason_code: response_reason,
          http_status: response.status,
          elapsed_ms: Math.max(0, this.#now() - request_started_at),
        });
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          if (response.status === 400) throw new BadRequestNoFallbackError();
          throw new HttpFailure(
            response.status,
            retryAfter(response.headers.get("retry-after"), this.#now()),
          );
        }
        let result: Omit<ChatCompletionResult, "keyNickname">;
        try {
          result = await parseResponse(response, wire.stream ?? false, params);
        } catch (error) {
          const callback_failed = error instanceof CallbackError;
          report_agent_diagnostic(params.onDiagnostic, {
            event_code: "provider_response_parsed",
            source: "provider_protocol",
            outcome: "failed",
            reason_code: callback_failed ? "callback_error" : "protocol_error",
            http_status: response.status,
            elapsed_ms: Math.max(0, this.#now() - request_started_at),
          });
          if (callback_failed) throw error;
          if (signal.aborted) throw cancelled();
          throw new ClassifiedFailure("protocol_error");
        }
        report_agent_diagnostic(params.onDiagnostic, {
          event_code: "provider_response_parsed",
          source: "provider_protocol",
          outcome: "completed",
          reason_code: "ok",
          http_status: response.status,
          elapsed_ms: Math.max(0, this.#now() - request_started_at),
          count: result.toolCalls.length,
        });
        if (signal.aborted) throw cancelled();
        return { ...result, keyNickname: entry.nickname };
      } catch (error) {
        if (wire.stream) notify(() => params.onStreamReset?.());
        if (signal.aborted) throw cancelled();
        if (
          error instanceof CallbackError ||
          error instanceof BadRequestNoFallbackError
        )
          throw error;
        if (error instanceof HttpFailure && error.status === 401) {
          this.#pool.markUnauthorized(entry.nickname);
          failures.push({ nickname: entry.nickname, reason: "unauthorized" });
        } else if (error instanceof HttpFailure && error.status === 429) {
          this.#pool.markRateLimited(entry.nickname, error.retryAfterMs);
          failures.push({ nickname: entry.nickname, reason: "rate_limited" });
        } else if (error instanceof HttpFailure && error.status === 403) {
          failures.push({ nickname: entry.nickname, reason: "access_denied" });
        } else if (error instanceof HttpFailure && error.status >= 500) {
          failures.push({
            nickname: entry.nickname,
            reason: "provider_unavailable",
          });
        } else if (error instanceof HttpFailure) {
          failures.push({
            nickname: entry.nickname,
            reason: "provider_http_error",
          });
        } else if (error instanceof ClassifiedFailure) {
          failures.push({ nickname: entry.nickname, reason: error.reason });
        } else {
          failures.push({ nickname: entry.nickname, reason: "provider_error" });
        }
        const latest_failure = failures[failures.length - 1];
        report_agent_diagnostic(params.onDiagnostic, {
          event_code: "provider_failure_classified",
          source: "provider_protocol",
          outcome: "failed",
          reason_code: diagnostic_failure_reason(latest_failure?.reason),
          http_status: error instanceof HttpFailure ? error.status : undefined,
          elapsed_ms: Math.max(0, this.#now() - request_started_at),
        });
      }
    }
  }
}
