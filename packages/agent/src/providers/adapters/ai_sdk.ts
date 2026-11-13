import { generateText, streamText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { PrivacyRedactor } from "@vittaz/core";
import {
  AllKeysFailedError,
  BadRequestNoFallbackError,
  KeyPool,
} from "../../key_pool.js";
import type { KeyFailureRecord } from "../../key_pool.js";
import {
  report_agent_diagnostic,
  type AgentDiagnosticReason,
} from "../../diagnostics.js";
import {
  validateCompletionRequest,
  type ChatCompletionParams,
  type ChatCompletionResult,
  type ToolCallPayload,
} from "../../provider_client.js";
import type { ModelCapabilities } from "../contracts/capabilities.js";
import {
  InvalidProviderConfigError,
  MissingCredentialError,
} from "../contracts/errors.js";
import {
  key_nickname_for,
  resolve_model,
  validate_provider_config,
  type ProviderAdapter,
  type ProviderAuth,
  type ProviderConfig,
  type ProviderDependencies,
} from "../contracts/provider.js";
import { capabilities_for_model } from "../registry/model_registry.js";
import {
  attribution_headers,
  to_sdk_messages,
  to_sdk_tools,
  to_tool_calls,
} from "./sdk_prompt.js";

/**
 * OpenAI-compatible transport backed by the Vercel AI SDK.
 *
 * The split is deliberate and is the whole point of this file:
 *
 *   SDK owns wire plumbing
 *     request encoding, SSE framing, tool-call fragment assembly, usage
 *     extraction. Everything that has to change when OpenAI ships a new field
 *     lives in `ai` / `@ai-sdk/openai-compatible`, not here.
 *
 *   Vittaz still owns the guarantees
 *     `validateCompletionRequest` (the single preflight: strict schema,
 *     sensitive-input rejection, outbound redaction, 64 KiB cap), endpoint
 *     safety, the key pool and its retry/cooldown policy, `BadRequestNoFallback`
 *     on HTTP 400, the eight `AllKeysFailedError` reasons, cancellation, and the
 *     codebook-only diagnostics stream. The SDK has no equivalent of any of
 *     these, so removing them would be a safety regression, not a cleanup.
 *
 * Tools are passed as *definitions only* (no `execute`). The SDK therefore stops
 * with `finishReason: "tool-calls"` and hands the calls back, and the Vittaz
 * harness stays the only thing that runs a tool, enforces the read-only
 * allowlist, and creates a pending proposal. Letting the SDK execute tools
 * would move policy into a library.
 */

/** Only https, or http on loopback, with no embedded credentials or params. */
function validate_endpoint(base_url: string, api_suffix = "/v1"): string {
  let url: URL;
  try {
    url = new URL(base_url);
  } catch {
    throw new InvalidProviderConfigError();
  }
  const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new InvalidProviderConfigError();
  // Configurations carry the host prefix (e.g. `https://host/api`); the API
  // path segment is the transport's to add, and the SDK appends
  // `/chat/completions`. The suffix defaults to `/v1` but is configurable:
  // some servers put the compatible API under `/v1beta/openai`, or at the root.
  return url.href.replace(/\/+$/, "") + api_suffix;
}

/**
 * The SDK swallows exceptions thrown inside `onChunk`, so a throwing UI callback
 * would otherwise be ignored and the answer would be delivered as if nothing had
 * happened. The previous transport treated that as a hard, non-retryable
 * `Provider callback failed`. Preserve it: record the failure, abort the stream,
 * and rethrow this instead of a cancellation.
 */
class CallbackError extends Error {
  constructor() {
    super("Provider callback failed");
  }
}

function cancelled(): Error {
  const error = new Error("Provider request cancelled or timed out");
  error.name = "AbortError";
  return error;
}

/** HTTP status -> the existing failure vocabulary. Never a new reason code. */
function http_reason(status: number): KeyFailureRecord["reason"] {
  if (status === 401) return "unauthorized";
  if (status === 403) return "access_denied";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "provider_http_error";
}

function diagnostic_reason(
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

function status_of(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" && Number.isInteger(status)
    ? status
    : undefined;
}

/**
 * Where the key goes on the wire, and any static extra headers.
 *
 * The key is placed here rather than passed as `apiKey` whenever the
 * configuration asks for a non-default header, because the SDK only knows how
 * to send `Authorization: Bearer`. Which header is used is configuration, so
 * no provider name appears in this function.
 */
function credential_headers(
  api_key: string | undefined,
  auth: ProviderAuth | undefined,
  extra: Readonly<Record<string, string>> | undefined,
): Record<string, string> | undefined {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  const header = auth?.header ?? "authorization";
  if (api_key && header !== "authorization") {
    const scheme = auth?.scheme ?? "";
    headers[header] = scheme ? `${scheme} ${api_key}` : api_key;
  }
  return Object.keys(headers).length ? headers : undefined;
}

export function create_ai_sdk_provider(
  config: ProviderConfig,
  deps: ProviderDependencies,
  options: { model?: string } = {},
): ProviderAdapter {
  const validated = validate_provider_config(config);
  if (validated.kind !== "openai_compatible")
    throw new InvalidProviderConfigError();
  const base_url = validate_endpoint(
    validated.base_url ?? "",
    validated.api_suffix,
  );
  const model_id = resolve_model(validated, options.model);
  const attribution = attribution_headers(validated.attribution);
  const timeout_ms = deps.timeout_ms ?? 30000;
  if (
    !Number.isSafeInteger(timeout_ms) ||
    timeout_ms < 1 ||
    timeout_ms > 300000
  )
    throw new InvalidProviderConfigError();
  const redactor = deps.redactor ?? new PrivacyRedactor();

  let pool: KeyPool | undefined;
  async function resolve_pool(): Promise<KeyPool> {
    if (pool) return pool;
    // An injected pool is authoritative: the caller already owns key policy.
    if (deps.key_pool) {
      pool = deps.key_pool;
      return pool;
    }
    let api_key = "";
    if (validated.credential_ref) {
      const resolved = await deps.resolve_credential(validated.credential_ref);
      // Fail closed: never send a request for a config that expects a key.
      if (!resolved) throw new MissingCredentialError();
      api_key = resolved;
    }
    try {
      pool = new KeyPool([
        {
          nickname: key_nickname_for(validated),
          apiKey: api_key,
          provider: validated.kind,
          model: model_id,
        },
      ]);
    } catch {
      throw new InvalidProviderConfigError();
    }
    return pool;
  }

  return {
    id: validated.id,
    kind: "openai_compatible",
    model: model_id,
    capabilities: (): ModelCapabilities =>
      capabilities_for_model("openai_compatible", model_id),
    async chatCompletion(
      params: ChatCompletionParams,
    ): Promise<ChatCompletionResult> {
      // The single preflight, unchanged and still the only authority.
      const { wire, callerSignal } = validateCompletionRequest(
        params,
        redactor,
      );
      const deadline = AbortSignal.timeout(timeout_ms);
      const signal = callerSignal
        ? AbortSignal.any([callerSignal, deadline])
        : deadline;
      const active_pool = await resolve_pool();
      const tools = to_sdk_tools(wire.tools);
      const tried = new Set<string>();
      const failures: KeyFailureRecord[] = [];

      while (true) {
        if (signal.aborted) throw cancelled();
        const entry = active_pool.getCandidateEntries(tried)[0];
        if (!entry) {
          if (failures.length === 0)
            for (const snapshot of active_pool.getStatusSnapshot())
              if (snapshot.state !== "healthy")
                failures.push({
                  nickname: snapshot.nickname,
                  reason: snapshot.state,
                });
          report_agent_diagnostic(params.onDiagnostic, {
            event_code: "provider_failure_classified",
            source: "provider_protocol",
            outcome: "failed",
            reason_code: diagnostic_reason(failures.at(-1)?.reason),
          });
          throw new AllKeysFailedError(failures);
        }
        tried.add(entry.nickname);

        const started_at = Date.now();
        report_agent_diagnostic(params.onDiagnostic, {
          event_code: "provider_request_started",
          source: "provider_http",
          outcome: "started",
        });

        // Hoisted so the catch can tell a callback failure from a cancellation.
        // (The SDK reports the callback-triggered abort as a generic API error.)
        let callback_failed = false;

        try {
          const custom_auth = validated.auth?.header
            ? validated.auth.header !== "authorization"
            : false;
          const headers = credential_headers(
            entry.apiKey,
            validated.auth,
            validated.extra_headers,
          );
          const provider = createOpenAICompatible({
            name: "vittaz-byok",
            baseURL: base_url,
            // Keyless configurations (Kilo Auto Free) must send no header at
            // all. A custom auth header means the key is sent below instead.
            ...(entry.apiKey && !custom_auth ? { apiKey: entry.apiKey } : {}),
            ...(headers ? { headers } : {}),
            ...(deps.fetch ? { fetch: deps.fetch } : {}),
            // Opt-in only; absent means the wire is unchanged.
            ...(attribution ? { headers: attribution } : {}),
            // NOTE: the SDK sets its own `user-agent`
            // ("ai/7.0.169 ai-sdk-provider-utils/5.0.79 node.js/24") after
            // merging caller headers, so it cannot be overridden from here.
            // It contains no key or user data, but it does fingerprint the
            // client stack to the provider; recorded as a known difference in
            // DECISIONS.md rather than silently accepted.
          });
          const model = provider(entry.model);
          const prompt = to_sdk_messages(wire.messages);
          const common = {
            model,
            messages: prompt.messages,
            ...(prompt.instructions
              ? { instructions: prompt.instructions }
              : {}),
            ...(tools ? { tools } : {}),
            ...(wire.maxCompletionTokens
              ? { maxOutputTokens: wire.maxCompletionTokens }
              : {}),
            // The SDK retries twice by default. Vittaz's key-pool policy is the
            // only retry authority: 400 must fail immediately, and a retryable
            // status rotates to the next KEY, never a silent repeat against the
            // same one. Without this the transport would add retries the
            // previous implementation never had.
            maxRetries: 0,
            abortSignal: signal,
          };

          let text: string;
          let tool_calls: ToolCallPayload[];
          let prompt_tokens = 0;
          let completion_tokens = 0;
          let finish_reason: string;

          if (wire.stream) {
            // A separate controller so a callback failure can stop the stream
            // without looking like a caller cancellation.
            const callback_abort = new AbortController();
            const streamed = streamText({
              ...common,
              // Do not let the SDK's own retries or our abort mask the reason.
              abortSignal: callback_abort.signal,
              onChunk: ({ chunk }) => {
                if (chunk.type !== "text-delta" || !params.onStreamDelta)
                  return;
                try {
                  params.onStreamDelta(chunk.text);
                } catch {
                  callback_failed = true;
                  callback_abort.abort();
                }
              },
            });
            text = await streamed.text;
            tool_calls = to_tool_calls(await streamed.toolCalls);
            const usage = await streamed.usage;
            prompt_tokens = usage.inputTokens ?? 0;
            completion_tokens = usage.outputTokens ?? 0;
            finish_reason = await streamed.finishReason;
          } else {
            const generated = await generateText(common);
            text = generated.text;
            tool_calls = to_tool_calls(generated.toolCalls);
            prompt_tokens = generated.usage.inputTokens ?? 0;
            completion_tokens = generated.usage.outputTokens ?? 0;
            finish_reason = generated.finishReason;
          }

          report_agent_diagnostic(params.onDiagnostic, {
            event_code: "provider_http_response",
            source: "provider_http",
            outcome: "completed",
            reason_code: "ok",
            http_status: 200,
            elapsed_ms: Math.max(0, Date.now() - started_at),
          });

          if (signal.aborted) throw cancelled();

          // In-band SSE errors: a 200 response whose stream carried an error
          // frame resolves with empty text and finishReason "error". Treating
          // that as a success would surface an empty answer, which is exactly
          // the historical KILO_UNKNOWN symptom. Classify it as a protocol
          // failure instead.
          if (finish_reason === "error" || finish_reason === "content-filter")
            throw Object.assign(new Error("provider_in_band_error"), {
              __protocol: true,
            });
          if (!text.trim() && tool_calls.length === 0)
            throw Object.assign(new Error("provider_empty_completion"), {
              __protocol: true,
            });

          report_agent_diagnostic(params.onDiagnostic, {
            event_code: "provider_response_parsed",
            source: "provider_protocol",
            outcome: "completed",
            reason_code: "ok",
            http_status: 200,
            elapsed_ms: Math.max(0, Date.now() - started_at),
            count: tool_calls.length,
          });

          return {
            content: text,
            toolCalls: tool_calls,
            usage: {
              prompt_tokens,
              completion_tokens,
              total_tokens: prompt_tokens + completion_tokens,
            },
            keyNickname: entry.nickname,
          };
        } catch (error) {
          if (callback_failed) throw new CallbackError();
          if (error instanceof CallbackError) throw error;
          if (signal.aborted) throw cancelled();
          if (
            error instanceof MissingCredentialError ||
            error instanceof InvalidProviderConfigError
          )
            throw error;
          const status = status_of(error);
          if (status === 400) {
            report_agent_diagnostic(params.onDiagnostic, {
              event_code: "provider_failure_classified",
              source: "provider_protocol",
              outcome: "failed",
              reason_code: "request_rejected",
              http_status: 400,
            });
            throw new BadRequestNoFallbackError();
          }
          const is_protocol =
            (error as { __protocol?: unknown } | null)?.__protocol === true;
          const reason: KeyFailureRecord["reason"] = is_protocol
            ? "protocol_error"
            : status !== undefined
              ? http_reason(status)
              : "connection_error";

          // The SDK performs the HTTP call internally, so the response event
          // the previous transport emitted must be reconstructed here or the
          // diagnostics stream would silently lose every HTTP status.
          if (status !== undefined)
            report_agent_diagnostic(params.onDiagnostic, {
              event_code: "provider_http_response",
              source: "provider_http",
              outcome: "failed",
              reason_code: diagnostic_reason(http_reason(status)),
              http_status: status,
              elapsed_ms: Math.max(0, Date.now() - started_at),
            });

          report_agent_diagnostic(params.onDiagnostic, {
            event_code: "provider_response_parsed",
            source: "provider_protocol",
            outcome: "failed",
            reason_code: diagnostic_reason(reason),
            http_status: status,
            elapsed_ms: Math.max(0, Date.now() - started_at),
          });

          if (status === 401) active_pool.markUnauthorized(entry.nickname);
          else if (status === 429) active_pool.markRateLimited(entry.nickname);
          failures.push({ nickname: entry.nickname, reason });

          report_agent_diagnostic(params.onDiagnostic, {
            event_code: "provider_failure_classified",
            source: "provider_protocol",
            outcome: "failed",
            reason_code: diagnostic_reason(reason),
            http_status: status,
            elapsed_ms: Math.max(0, Date.now() - started_at),
          });

          // Every failure rotates to the next key and the pool reports
          // exhaustion on the next pass, exactly as the previous transport did.
        }
      }
    },
  };
}
