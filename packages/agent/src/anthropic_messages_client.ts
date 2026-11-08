import { z } from "zod";
import { PrivacyRedactor } from "@vittaz/core";
import { AllKeysFailedError, BadRequestNoFallbackError } from "./key_pool.js";
import type { KeyFailureRecord } from "./key_pool.js";
import { ProtocolError, readText } from "./http_body.js";
import type {
  ChatCompletionParams,
  ChatCompletionResult,
  ChatMessage,
  CompletionClient,
  TokenUsage,
  ToolCallPayload,
  ToolSpec,
} from "./provider_client.js";
import { validateCompletionRequest } from "./provider_client.js";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_API_VERSION = "2026-10-21";
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5-5";

const anthropic_usage = z.object({
  input_tokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  output_tokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
const message_content = z.array(z.unknown()).max(16);
const message_response = z.object({
  type: z.literal("message"),
  role: z.literal("assistant"),
  content: message_content,
  usage: anthropic_usage,
  stop_reason: z.string().nullable().optional(),
});
const plain_object = z.custom<Record<string, unknown>>(
  (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value),
);

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}
type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | { type: "tool_result"; tool_use_id: string; content: string };
interface AnthropicRequest {
  model: string;
  max_tokens: number;
  stream: boolean;
  messages: AnthropicMessage[];
  system?: string;
  tools?: AnthropicTool[];
}

function valid_key(value: string): string {
  const key = value.trim();
  const has_control = Array.from(key).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
  if (!key || key.length > 4096 || /\s/.test(key) || has_control)
    throw new Error("Invalid provider configuration");
  return key;
}

function valid_model(value: string): string {
  const model = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model))
    throw new Error("Invalid provider configuration");
  return model;
}

function parse_tool_arguments(text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ProtocolError();
  }
  const parsed = plain_object.safeParse(value);
  if (!parsed.success) throw new ProtocolError();
  return parsed.data;
}

function map_tool_specs(
  tools: readonly ToolSpec[] | undefined,
): AnthropicTool[] {
  return (tools ?? []).map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));
}

function map_messages(messages: readonly ChatMessage[]): {
  messages: AnthropicMessage[];
  system: string | undefined;
} {
  const systems: string[] = [];
  const result: AnthropicMessage[] = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!;
    if (message.role === "system" || message.role === "developer") {
      if (message.content) systems.push(message.content);
      continue;
    }
    if (message.role === "tool") {
      const blocks: AnthropicContentBlock[] = [];
      while (index < messages.length && messages[index]!.role === "tool") {
        const tool_message = messages[index]!;
        if (!tool_message.tool_call_id)
          throw new Error("Invalid provider request");
        blocks.push({
          type: "tool_result",
          tool_use_id: tool_message.tool_call_id,
          content: tool_message.content ?? "",
        });
        index++;
      }
      index--;
      result.push({ role: "user", content: blocks });
      continue;
    }
    if (message.role === "user") {
      result.push({ role: "user", content: message.content ?? "" });
      continue;
    }
    const content: AnthropicContentBlock[] = [];
    if (message.content) content.push({ type: "text", text: message.content });
    for (const call of message.tool_calls ?? []) {
      content.push({
        type: "tool_use",
        id: call.id ?? `call_${result.length}_${content.length}`,
        name: call.function.name,
        input: parse_tool_arguments(call.function.arguments),
      });
    }
    result.push({
      role: "assistant",
      content: content.length ? content : (message.content ?? ""),
    });
  }
  return {
    messages: result,
    system: systems.length ? systems.join("\n") : undefined,
  };
}

function make_request(
  wire: ReturnType<typeof validateCompletionRequest>["wire"],
  model: string,
): AnthropicRequest {
  const mapped = map_messages(wire.messages);
  const tools = map_tool_specs(wire.tools);
  return {
    model,
    max_tokens: wire.maxCompletionTokens ?? 1024,
    stream: wire.stream ?? false,
    messages: mapped.messages,
    ...(mapped.system ? { system: mapped.system } : {}),
    ...(tools.length ? { tools } : {}),
  };
}

function make_usage(input_tokens: number, output_tokens: number): TokenUsage {
  const total = BigInt(input_tokens) + BigInt(output_tokens);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new ProtocolError();
  return {
    prompt_tokens: input_tokens,
    completion_tokens: output_tokens,
    total_tokens: Number(total),
  };
}

function map_response(
  value: unknown,
): Omit<ChatCompletionResult, "keyNickname"> {
  const parsed = message_response.safeParse(value);
  if (!parsed.success) throw new ProtocolError();
  const content: string[] = [];
  const tool_calls: ToolCallPayload[] = [];
  for (const block of parsed.data.content) {
    if (!block || typeof block !== "object" || Array.isArray(block))
      throw new ProtocolError();
    const entry = block as Record<string, unknown>;
    if (entry.type === "text") {
      if (typeof entry.text !== "string") throw new ProtocolError();
      content.push(entry.text);
      continue;
    }
    if (entry.type === "tool_use") {
      if (
        typeof entry.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(entry.id) ||
        typeof entry.name !== "string" ||
        !/^[a-z][a-z0-9_]{0,127}$/.test(entry.name)
      )
        throw new ProtocolError();
      const input = plain_object.safeParse(entry.input);
      if (!input.success) throw new ProtocolError();
      tool_calls.push({
        id: entry.id,
        type: "function",
        function: { name: entry.name, arguments: JSON.stringify(input.data) },
      });
      continue;
    }
    throw new ProtocolError();
  }
  if (tool_calls.length > 16 || Array.from(content.join("")).length > 32768)
    throw new ProtocolError();
  if (parsed.data.stop_reason === "tool_use" && tool_calls.length === 0)
    throw new ProtocolError();
  return {
    content: content.join(""),
    toolCalls: tool_calls,
    usage: make_usage(
      parsed.data.usage.input_tokens,
      parsed.data.usage.output_tokens,
    ),
  };
}

class CallbackError extends Error {
  constructor() {
    super("Provider callback failed");
  }
}
class HttpFailure extends Error {
  constructor(readonly status: number) {
    super("Provider HTTP failure");
  }
}
class ClassifiedFailure extends Error {
  constructor(readonly reason: KeyFailureRecord["reason"]) {
    super("Provider request failed");
  }
}
function cancelled(): Error {
  const error = new Error("Provider request cancelled or timed out");
  error.name = "AbortError";
  return error;
}
function notify(action: () => void): void {
  try {
    action();
  } catch {
    throw new CallbackError();
  }
}
function status_reason(status: number): KeyFailureRecord["reason"] {
  if (status === 401) return "unauthorized";
  if (status === 403) return "access_denied";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "provider_http_error";
}

interface SseFrame {
  event: string;
  data: string;
}
function parse_sse_frame(raw: string): SseFrame {
  let event = "";
  const data: string[] = [];
  for (const line of raw.split(/\r\n|\n|\r/)) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    const value =
      separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "event") event = value;
    if (field === "data") data.push(value);
  }
  return { event, data: data.join("\n") };
}
function take_frames(buffer: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  let rest = buffer;
  const separator = /\r?\n\r?\n|\r\r/;
  while (true) {
    const match = separator.exec(rest);
    if (!match) break;
    frames.push(parse_sse_frame(rest.slice(0, match.index)));
    rest = rest.slice(match.index + match[0].length);
  }
  return { frames, rest };
}

interface StreamBlock {
  kind: "text" | "tool_use" | "ignored";
  stopped: boolean;
  text?: string;
  id?: string;
  name?: string;
  initial_input?: Record<string, unknown>;
  input_json?: string;
}
interface StreamState {
  started: boolean;
  stopped: boolean;
  input_tokens: number;
  output_tokens: number;
  stop_reason: string | null;
  content: string;
  blocks: Map<number, StreamBlock>;
  tool_calls: ToolCallPayload[];
}
function initial_stream_state(): StreamState {
  return {
    started: false,
    stopped: false,
    input_tokens: 0,
    output_tokens: 0,
    stop_reason: null,
    content: "",
    blocks: new Map(),
    tool_calls: [],
  };
}
function as_object(value: unknown): Record<string, unknown> {
  const parsed = plain_object.safeParse(value);
  if (!parsed.success) throw new ProtocolError();
  return parsed.data;
}
function safe_count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new ProtocolError();
  return value;
}
function process_sse_frame(
  frame: SseFrame,
  state: StreamState,
  params: ChatCompletionParams,
): void {
  if (!frame.event) {
    if (!frame.data) return;
    throw new ProtocolError();
  }
  if (
    ![
      "message_start",
      "content_block_start",
      "content_block_delta",
      "content_block_stop",
      "message_delta",
      "message_stop",
      "error",
      "ping",
    ].includes(frame.event)
  )
    return;
  if (frame.event === "ping") return;
  if (!frame.data) throw new ProtocolError();
  let raw: unknown;
  try {
    raw = JSON.parse(frame.data);
  } catch {
    throw new ProtocolError();
  }
  const payload = as_object(raw);
  if (frame.event === "error") {
    const error = as_object(payload.error);
    const type = error.type;
    const reason: KeyFailureRecord["reason"] =
      type === "overloaded_error" ||
      type === "api_error" ||
      type === "timeout_error"
        ? "provider_unavailable"
        : type === "rate_limit_error"
          ? "rate_limited"
          : type === "authentication_error"
            ? "unauthorized"
            : type === "permission_error"
              ? "access_denied"
              : "provider_http_error";
    throw new ClassifiedFailure(reason);
  }
  if (payload.type !== frame.event) throw new ProtocolError();
  if (frame.event === "message_start") {
    if (state.started || state.stopped) throw new ProtocolError();
    const message = as_object(payload.message);
    const usage = as_object(message.usage);
    state.input_tokens = safe_count(usage.input_tokens);
    state.output_tokens = safe_count(usage.output_tokens ?? 0);
    state.started = true;
    return;
  }
  if (!state.started || state.stopped) throw new ProtocolError();
  if (frame.event === "content_block_start") {
    const index = safe_count(payload.index);
    if (index > 15 || state.blocks.has(index)) throw new ProtocolError();
    const block = as_object(payload.content_block);
    const type = block.type;
    if (type === "text") {
      if (typeof block.text !== "string") throw new ProtocolError();
      state.blocks.set(index, {
        kind: "text",
        text: block.text,
        stopped: false,
      });
      if (block.text) {
        state.content += block.text;
        notify(() => params.onStreamDelta?.(block.text as string));
      }
      return;
    }
    if (type === "tool_use") {
      if (
        typeof block.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(block.id) ||
        typeof block.name !== "string" ||
        !/^[a-z][a-z0-9_]{0,127}$/.test(block.name)
      )
        throw new ProtocolError();
      const input = plain_object.safeParse(block.input ?? {});
      if (!input.success) throw new ProtocolError();
      state.blocks.set(index, {
        kind: "tool_use",
        id: block.id,
        name: block.name,
        initial_input: input.data,
        input_json: "",
        stopped: false,
      });
      return;
    }
    if (type === "thinking" || type === "redacted_thinking") {
      state.blocks.set(index, { kind: "ignored", stopped: false });
      return;
    }
    throw new ProtocolError();
  }
  if (frame.event === "content_block_delta") {
    const index = safe_count(payload.index);
    const block = state.blocks.get(index);
    if (!block || block.stopped) throw new ProtocolError();
    const delta = as_object(payload.delta);
    if (delta.type === "text_delta" && block.kind === "text") {
      if (typeof delta.text !== "string") throw new ProtocolError();
      state.content += delta.text;
      if (state.content.length > 32768) throw new ProtocolError();
      notify(() => params.onStreamDelta?.(delta.text as string));
      return;
    }
    if (delta.type === "input_json_delta" && block.kind === "tool_use") {
      if (typeof delta.partial_json !== "string") throw new ProtocolError();
      block.input_json = block.input_json! + delta.partial_json;
      if (block.input_json.length > 65536) throw new ProtocolError();
      return;
    }
    if (
      block.kind === "ignored" &&
      ["thinking_delta", "signature_delta"].includes(String(delta.type))
    )
      return;
    throw new ProtocolError();
  }
  if (frame.event === "content_block_stop") {
    const index = safe_count(payload.index);
    const block = state.blocks.get(index);
    if (!block || block.stopped) throw new ProtocolError();
    block.stopped = true;
    if (block.kind === "tool_use") {
      let input = block.initial_input!;
      if (block.input_json) input = parse_tool_arguments(block.input_json);
      state.tool_calls.push({
        id: block.id!,
        type: "function",
        function: { name: block.name!, arguments: JSON.stringify(input) },
      });
    }
    return;
  }
  if (frame.event === "message_delta") {
    const delta = as_object(payload.delta);
    if (delta.stop_reason !== undefined && delta.stop_reason !== null) {
      if (typeof delta.stop_reason !== "string") throw new ProtocolError();
      state.stop_reason = delta.stop_reason;
    }
    if (payload.usage !== undefined) {
      const usage = as_object(payload.usage);
      if (usage.output_tokens !== undefined)
        state.output_tokens = safe_count(usage.output_tokens);
    }
    return;
  }
  if ([...state.blocks.values()].some((block) => !block.stopped))
    throw new ProtocolError();
  if (state.stop_reason === "tool_use" && state.tool_calls.length === 0)
    throw new ProtocolError();
  state.stopped = true;
  // All other known events have returned or thrown before reaching this point.
}

async function parse_stream(
  response: Response,
  params: ChatCompletionParams,
): Promise<Omit<ChatCompletionResult, "keyNickname">> {
  let buffer = "";
  const state = initial_stream_state();
  for await (const text of readText(response)) {
    buffer += text;
    const parsed = take_frames(buffer);
    buffer = parsed.rest;
    for (const frame of parsed.frames) process_sse_frame(frame, state, params);
  }
  if (buffer.trim()) process_sse_frame(parse_sse_frame(buffer), state, params);
  if (!state.started || !state.stopped || state.blocks.size === 0)
    throw new ProtocolError();
  if (state.content.length > 32768) throw new ProtocolError();
  return {
    content: state.content,
    toolCalls: state.tool_calls,
    usage: make_usage(state.input_tokens, state.output_tokens),
  };
}

async function parse_response(
  response: Response,
  stream: boolean,
  params: ChatCompletionParams,
): Promise<Omit<ChatCompletionResult, "keyNickname">> {
  if (stream) return parse_stream(response, params);
  let body = "";
  for await (const text of readText(response)) body += text;
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new ProtocolError();
  }
  return map_response(raw);
}

/** Direct, API-key-only Anthropic Messages adapter; no SDK, OAuth, DB, or tool execution. */
export class AnthropicMessagesClient implements CompletionClient {
  #api_key: string;
  #model: string;
  #fetch: typeof fetch;
  #timeout: number;
  #redactor: PrivacyRedactor;
  constructor(params: {
    apiKey: string;
    model?: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
    redactor?: PrivacyRedactor;
  }) {
    this.#api_key = valid_key(params.apiKey);
    this.#model = valid_model(params.model ?? ANTHROPIC_DEFAULT_MODEL);
    this.#fetch = params.fetch ?? fetch;
    const timeout = params.timeoutMs ?? 30000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300000)
      throw new Error("Invalid provider configuration");
    this.#timeout = timeout;
    this.#redactor = params.redactor ?? new PrivacyRedactor();
  }
  async chatCompletion(
    params: ChatCompletionParams,
  ): Promise<ChatCompletionResult> {
    const { wire, callerSignal } = validateCompletionRequest(
      params,
      this.#redactor,
    );
    const body = make_request(wire, this.#model);
    const body_text = JSON.stringify(body);
    if (new TextEncoder().encode(body_text).byteLength > 64512)
      throw new Error("Invalid provider request");
    const deadline = AbortSignal.timeout(this.#timeout);
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, deadline])
      : deadline;
    if (signal.aborted) throw cancelled();
    try {
      let response: Response;
      try {
        response = await this.#fetch(ANTHROPIC_MESSAGES_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "anthropic-version": ANTHROPIC_API_VERSION,
            "x-api-key": this.#api_key,
          },
          body: body_text,
          redirect: "error",
          signal,
        });
      } catch {
        if (signal.aborted) throw cancelled();
        throw new ClassifiedFailure("connection_error");
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 400) throw new BadRequestNoFallbackError();
        throw new HttpFailure(response.status);
      }
      let result: Omit<ChatCompletionResult, "keyNickname">;
      try {
        result = await parse_response(response, wire.stream ?? false, params);
      } catch (error) {
        if (error instanceof CallbackError) throw error;
        if (signal.aborted) throw cancelled();
        if (error instanceof ClassifiedFailure) throw error;
        throw new ClassifiedFailure("protocol_error");
      }
      if (signal.aborted) throw cancelled();
      return { ...result, keyNickname: "anthropic_byok" };
    } catch (error) {
      if (wire.stream) notify(() => params.onStreamReset?.());
      if (signal.aborted) throw cancelled();
      if (
        error instanceof CallbackError ||
        error instanceof BadRequestNoFallbackError
      )
        throw error;
      if (error instanceof HttpFailure)
        throw new AllKeysFailedError([
          { nickname: "anthropic_byok", reason: status_reason(error.status) },
        ]);
      if (error instanceof ClassifiedFailure)
        throw new AllKeysFailedError([
          { nickname: "anthropic_byok", reason: error.reason },
        ]);
      throw new AllKeysFailedError([
        { nickname: "anthropic_byok", reason: "provider_error" },
      ]);
    }
  }
}
