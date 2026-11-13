import { jsonSchema, tool } from "ai";
import type { ToolSet } from "ai";
import type {
  ChatMessage,
  ToolCallPayload,
  ToolSpec,
} from "../../provider_client.js";

/**
 * Prompt, tool and result mapping shared by both SDK-backed transports.
 *
 * `ai_sdk.ts` (OpenAI-compatible) and `anthropic.ts` speak the same SDK prompt
 * shape, so this mapping has exactly one implementation. It is a pure
 * translation layer: no policy, no retries, no network, no logging.
 *
 * It is deliberately small and boring. If it grows conditions that depend on
 * which provider is calling, that is a sign something belongs in the SDK
 * instead.
 */

/**
 * Our validated messages -> SDK prompt parts.
 *
 * Two unavoidable conversions, both documented as deliberate:
 *
 *  1. `system` and `developer` messages are lifted into the SDK's
 *     `instructions` option, which is where this SDK version requires them;
 *     they are rejected inside `messages`. `developer` is treated as `system`
 *     because that is what it means, and because many OpenAI-compatible servers
 *     accept `system` but not `developer`. Order and text are preserved
 *     verbatim, joined by a blank line when several are present.
 *  2. Tool results need the tool *name*, which our wire format does not carry
 *     on the tool message (it carries only `tool_call_id`). The name is
 *     recovered from the preceding assistant `tool_calls`, which is where the
 *     protocol defines it.
 */
export function to_sdk_messages(messages: readonly ChatMessage[]) {
  const tool_names = new Map<string, string>();
  for (const message of messages)
    for (const call of message.tool_calls ?? [])
      if (call.id) tool_names.set(call.id, call.function.name);

  const instructions = messages
    .filter(
      (message) => message.role === "system" || message.role === "developer",
    )
    .map((message) => message.content ?? "")
    .join("\n\n");

  const conversation = messages.filter(
    (message) => message.role !== "system" && message.role !== "developer",
  );

  return {
    ...(instructions ? { instructions } : {}),
    messages: conversation.map((message) => {
      if (message.role === "tool")
        return {
          role: "tool" as const,
          content: [
            {
              type: "tool-result" as const,
              toolCallId: message.tool_call_id ?? "",
              toolName: tool_names.get(message.tool_call_id ?? "") ?? "",
              output: { type: "text" as const, value: message.content ?? "" },
            },
          ],
        };
      if (message.role === "assistant" && message.tool_calls?.length) {
        const parts: (
          | { type: "text"; text: string }
          | {
              type: "tool-call";
              toolCallId: string;
              toolName: string;
              input: unknown;
            }
        )[] = [];
        if (message.content)
          parts.push({ type: "text", text: message.content });
        for (const [index, call] of message.tool_calls.entries())
          parts.push({
            type: "tool-call",
            toolCallId: call.id ?? `call_${index}`,
            toolName: call.function.name,
            input: safe_parse(call.function.arguments),
          });
        return { role: "assistant" as const, content: parts };
      }
      return {
        role: message.role as "user" | "assistant",
        content: message.content ?? "",
      };
    }),
  };
}

/** Tool arguments are already validated JSON text; never throw on a re-parse. */
export function safe_parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * Tool specs are already JSON Schema, so they are passed through unchanged
 * rather than round-tripped through Zod. No `execute`: the harness runs tools.
 */
export function to_sdk_tools(
  specs: readonly ToolSpec[] | undefined,
): ToolSet | undefined {
  if (!specs?.length) return undefined;
  return Object.fromEntries(
    specs.map((spec) => [
      spec.function.name,
      tool({
        description: spec.function.description,
        inputSchema: jsonSchema(spec.function.parameters),
      }),
    ]),
  );
}

export function to_tool_calls(
  calls: readonly { toolCallId: string; toolName: string; input: unknown }[],
): ToolCallPayload[] {
  return calls.map((call) => ({
    id: call.toolCallId,
    type: "function" as const,
    function: {
      name: call.toolName,
      arguments: JSON.stringify(call.input ?? {}),
    },
  }));
}

/**
 * Opt-in app-attribution headers, as configured. Returns `undefined` when the
 * configuration sets none, so the request stays byte-identical to before.
 */
export function attribution_headers(
  attribution: { title: string; referer?: string } | undefined,
): Record<string, string> | undefined {
  if (!attribution) return undefined;
  return {
    "X-Title": attribution.title,
    ...(attribution.referer ? { "HTTP-Referer": attribution.referer } : {}),
  };
}
