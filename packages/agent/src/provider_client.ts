import { z } from "zod";
import { checkSensitiveMessage, PrivacyRedactor } from "@vittaz/core";
import type { AgentDiagnosticReporter } from "./diagnostics.js";
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
const request = z.strictObject({
  stream: z.boolean().optional(),
  messages: z.array(message).min(1).max(64),
  tools: z.array(toolSpec).max(16).optional(),
  maxCompletionTokens: z.int().min(1).max(8192).optional(),
});

export type ChatMessage = z.infer<typeof message>;
export type ToolCallPayload = z.infer<typeof toolCall>;
export type ToolSpec = z.infer<typeof toolSpec>;
/** Usage is a plain record now: the SDK parses the wire, not this module. */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
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
