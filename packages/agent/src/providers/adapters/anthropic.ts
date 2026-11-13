import { generateText, streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { PrivacyRedactor } from "@vittaz/core";
import {
  AllKeysFailedError,
  BadRequestNoFallbackError,
} from "../../key_pool.js";
import type { KeyFailureRecord } from "../../key_pool.js";
import {
  validateCompletionRequest,
  type ChatCompletionParams,
  type ChatCompletionResult,
  type ChatMessage,
  type ToolCallPayload,
} from "../../provider_client.js";
import type { ModelCapabilities } from "../contracts/capabilities.js";
import { bounded_fetch } from "./bounded_fetch.js";
import {
  InvalidProviderConfigError,
  MissingCredentialError,
} from "../contracts/errors.js";
import {
  key_nickname_for,
  resolve_model,
  validate_provider_config,
  type ProviderAdapter,
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
 * Anthropic transport, backed by `@ai-sdk/anthropic`.
 *
 * The split is the same as `ai_sdk.ts`, and the same reasons apply: the SDK
 * owns the Messages API request encoding, SSE framing and usage extraction;
 * Vittaz keeps preflight, credential handling, the failure vocabulary,
 * cancellation and the result contract. The one structural difference is that
 * Anthropic is a single pinned endpoint with a single key, so there is no key
 * pool rotation — a failure maps straight onto `AllKeysFailedError` with one
 * record, which is what the previous hand-written client did.
 *
 * Tools are passed as definitions only (no `execute`), so the SDK stops and
 * hands the calls back; the Vittaz harness remains the only tool executor.
 */

/** Anthropic publishes one endpoint; it is never taken from configuration. */
export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
/** The `anthropic-version` this project has been verifying against. */
export const ANTHROPIC_API_VERSION = "2026-10-21";
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5-5";

/**
 * Reply budget when the caller does not set one.
 *
 * The SDK's own default is the model maximum (128000 tokens). The previous
 * transport capped a default request at 1024, and silently multiplying the
 * worst-case cost of every un-capped request by two orders of magnitude is not
 * a change to make on the way past. Kept at 1024.
 */
const DEFAULT_MAX_TOKENS = 1024;
/** Bounds the previous transport enforced on the reply text and tool list. */
const MAX_REPLY_CHARS = 32768;
const MAX_TOOL_CALLS = 16;

function cancelled(): Error {
  const error = new Error("Provider request cancelled or timed out");
  error.name = "AbortError";
  return error;
}

/**
 * The SDK swallows exceptions thrown inside `onChunk`, so a throwing UI callback
 * would otherwise be ignored and the answer delivered as if nothing happened.
 * The previous transport reported this as a hard, non-retryable
 * `Provider callback failed`; that behaviour is preserved here.
 */
class CallbackError extends Error {
  constructor() {
    super("Provider callback failed");
  }
}

class ProtocolError extends Error {
  constructor() {
    super("Invalid provider response");
  }
}

/** Key shape rules stay here: this is configuration, not wire format. */
function valid_key(value: string): string {
  const key = value.trim();
  const has_control = Array.from(key).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
  if (!key || key.length > 4096 || /\s/.test(key) || has_control)
    throw new InvalidProviderConfigError();
  return key;
}

/** HTTP status -> the existing failure vocabulary. Never a new reason code. */
function status_reason(status: number): KeyFailureRecord["reason"] {
  if (status === 401) return "unauthorized";
  if (status === 403) return "access_denied";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "provider_http_error";
}

/**
 * Token counts the SDK reports as optional.
 *
 * The SDK types every usage field as possibly `undefined` because not every
 * provider reports every count, but Anthropic's own response schema requires
 * them, so the fallback can never fire on a parsed message. Keeping it in one
 * tested function means the call sites carry no unreachable branch.
 */
export function token_count(value: number | undefined): number {
  return value ?? 0;
}

function status_of(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" && Number.isInteger(status)
    ? status
    : undefined;
}

/**
 * A `tool` message must answer a real preceding tool call.
 *
 * The deleted client enforced this before any HTTP call, and it still matters
 * for a different reason: the SDK looks the tool *name* up by id, so an
 * unpaired tool message becomes an empty name on the wire rather than an error.
 * Rejecting it here keeps the old fail-fast behaviour.
 */
function assert_tool_pairing(messages: readonly ChatMessage[]): void {
  const known = new Set<string>();
  for (const message of messages) {
    for (const call of message.tool_calls ?? [])
      if (call.id) known.add(call.id);
    if (message.role !== "tool") continue;
    if (!message.tool_call_id || !known.has(message.tool_call_id))
      throw new Error("Invalid provider request");
  }
}

/**
 * The SDK parses the response, so the bounds the previous transport applied to
 * the parsed message are re-applied to the mapped result. These are cheap
 * invariants about the shape of an assistant reply, not an SSE parser.
 */
function assert_result_shape(
  text: string,
  tool_calls: readonly ToolCallPayload[],
): void {
  if (tool_calls.length > MAX_TOOL_CALLS) throw new ProtocolError();
  if (Array.from(text).length > MAX_REPLY_CHARS) throw new ProtocolError();
  for (const call of tool_calls) {
    if (call.id !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(call.id))
      throw new ProtocolError();
    if (!/^[a-z][a-z0-9_]{0,127}$/.test(call.function.name))
      throw new ProtocolError();
  }
}

export function create_anthropic_provider(
  config: ProviderConfig,
  deps: ProviderDependencies,
  options: { model?: string } = {},
): ProviderAdapter {
  const validated = validate_provider_config(config);
  if (validated.kind !== "anthropic") throw new InvalidProviderConfigError();
  // Anthropic is a fixed endpoint. A caller-supplied base URL is a
  // configuration mistake, not something to silently ignore.
  if (validated.base_url) throw new InvalidProviderConfigError();
  const model_id = resolve_model(validated, options.model);
  const attribution = attribution_headers(validated.attribution);
  const timeout_ms = deps.timeout_ms ?? 30000;
  if (
    !Number.isSafeInteger(timeout_ms) ||
    timeout_ms < 1 ||
    timeout_ms > 300000
  )
    throw new InvalidProviderConfigError();
  const nickname = key_nickname_for(validated);
  return {
    id: validated.id,
    kind: "anthropic",
    model: model_id,
    capabilities: (): ModelCapabilities =>
      capabilities_for_model("anthropic", model_id),
    async chatCompletion(
      params: ChatCompletionParams,
    ): Promise<ChatCompletionResult> {
      const { wire, callerSignal } = validateCompletionRequest(
        params,
        deps.redactor ?? new PrivacyRedactor(),
      );
      const deadline = AbortSignal.timeout(timeout_ms);
      const signal = callerSignal
        ? AbortSignal.any([callerSignal, deadline])
        : deadline;
      if (signal.aborted) throw cancelled();

      // Fail closed: Anthropic is never called without an API key. As before,
      // the key is resolved per request and never stored on a config object.
      if (!validated.credential_ref) throw new MissingCredentialError();
      const resolved = await deps.resolve_credential(validated.credential_ref);
      if (!resolved) throw new MissingCredentialError();
      const api_key = resolved;

      const provider = createAnthropic({
        apiKey: valid_key(api_key),
        // Pinned; the SDK appends `/messages`.
        baseURL: ANTHROPIC_MESSAGES_URL.replace(/\/messages$/, ""),
        fetch: bounded_fetch(deps.fetch),
        // Preserve the documented version this project verifies against. The
        // SDK defaults to its own (`2023-06-01`) and adds a beta header; the
        // override is verified to reach the wire.
        headers: {
          "anthropic-version": ANTHROPIC_API_VERSION,
          ...(attribution ?? {}),
        },
      });

      assert_tool_pairing(wire.messages);
      const prompt = to_sdk_messages(wire.messages);
      const tools = to_sdk_tools(wire.tools);
      const common = {
        model: provider(model_id),
        messages: prompt.messages,
        ...(prompt.instructions ? { instructions: prompt.instructions } : {}),
        ...(tools ? { tools } : {}),
        maxOutputTokens: wire.maxCompletionTokens ?? DEFAULT_MAX_TOKENS,
        // The SDK retries twice by default; the harness owns retry policy.
        maxRetries: 0,
      };

      let text: string;
      let tool_calls: ToolCallPayload[];
      let prompt_tokens: number;
      let completion_tokens: number;
      let finish_reason: string;
      let callback_failed = false;
      // Set only by the SDK's stream error callback, before `text` rejects.
      let stream_error: unknown;

      try {
        if (wire.stream) {
          const callback_abort = new AbortController();
          const streamed = streamText({
            ...common,
            // The caller's cancellation and the deadline must still reach the
            // request while streaming; only replacing the signal would strand a
            // stalled stream until the caller gives up.
            abortSignal: AbortSignal.any([signal, callback_abort.signal]),
            // Without `onError` the SDK writes the error — request values and
            // raw response body included — to the console. Capture, never log.
            onError: ({ error }) => {
              stream_error = error;
            },
            onChunk: ({ chunk }) => {
              if (chunk.type !== "text-delta" || !params.onStreamDelta) return;
              try {
                params.onStreamDelta(chunk.text);
              } catch {
                callback_failed = true;
                callback_abort.abort();
              }
            },
          });
          try {
            text = await streamed.text;
          } catch (error) {
            // `NoOutputGeneratedError` carries no HTTP status, so a streamed
            // 400 would be classified as a connection fault and rotate the key
            // instead of failing closed. Rethrow what the SDK actually saw.
            throw stream_error ?? error;
          }
          tool_calls = to_tool_calls(await streamed.toolCalls);
          const usage = await streamed.usage;
          prompt_tokens = token_count(usage.inputTokens);
          completion_tokens = token_count(usage.outputTokens);
          finish_reason = await streamed.finishReason;
        } else {
          const generated = await generateText({
            ...common,
            abortSignal: signal,
          });
          text = generated.text;
          tool_calls = to_tool_calls(generated.toolCalls);
          prompt_tokens = token_count(generated.usage.inputTokens);
          completion_tokens = token_count(generated.usage.outputTokens);
          finish_reason = generated.finishReason;
        }
      } catch (error) {
        if (callback_failed) {
          // The delta callback only runs while streaming, so a callback failure
          // always has a stream to reset.
          params.onStreamReset?.();
          throw new CallbackError();
        }
        if (signal.aborted) {
          if (wire.stream) params.onStreamReset?.();
          throw cancelled();
        }
        if (
          error instanceof MissingCredentialError ||
          error instanceof InvalidProviderConfigError
        )
          throw error;
        const status = status_of(error);
        if (status === 400) throw new BadRequestNoFallbackError();
        // Measured SDK behaviour: a malformed or unusable response body throws
        // `AI_APICallError` carrying the *HTTP* status 200. That is a protocol
        // failure, not an HTTP one, and must not be reported as 200-ok.
        const reason: KeyFailureRecord["reason"] =
          status === undefined
            ? "connection_error"
            : status === 200
              ? "protocol_error"
              : status_reason(status);
        if (wire.stream) params.onStreamReset?.();
        throw new AllKeysFailedError([{ nickname, reason }]);
      }

      if (signal.aborted) {
        // Only a non-streamed call can arrive here with the signal aborted: a
        // streamed one is cancelled inside the request, where the stream is
        // reset, because the abort reaches the socket.
        throw cancelled();
      }

      // In-band SSE errors resolve with partial text and `finishReason: "error"`.
      // Delivering that partial answer would be exactly the silent-truncation
      // bug the previous transport refused: fail statically instead.
      if (finish_reason === "error" || finish_reason === "content-filter") {
        if (wire.stream) params.onStreamReset?.();
        throw new AllKeysFailedError([{ nickname, reason: "protocol_error" }]);
      }
      if (!text.trim() && tool_calls.length === 0) {
        if (wire.stream) params.onStreamReset?.();
        throw new AllKeysFailedError([{ nickname, reason: "protocol_error" }]);
      }
      try {
        assert_result_shape(text, tool_calls);
      } catch {
        if (wire.stream) params.onStreamReset?.();
        throw new AllKeysFailedError([{ nickname, reason: "protocol_error" }]);
      }

      return {
        content: text,
        toolCalls: tool_calls,
        usage: {
          prompt_tokens,
          completion_tokens,
          total_tokens: prompt_tokens + completion_tokens,
        },
        keyNickname: nickname,
      };
    },
  };
}
