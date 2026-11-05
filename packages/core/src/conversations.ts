import { checkSensitiveMessage } from "./privacy/sensitiveFilter.js";
export interface ConversationRow {
  id: string;
  created_at: string;
}
export interface ConversationMessageRow {
  id: string;
  conversation_id: string;
  source: "app" | "cli" | "telegram";
  role: "user" | "assistant";
  content: string;
  created_at: string;
}
export interface ConversationHistoryStore {
  ensureConversation(row: ConversationRow): Promise<void>;
  createConversation(row: ConversationRow): Promise<void>;
  appendMessage(row: ConversationMessageRow): Promise<void>;
  listConversations(limit?: number): Promise<ConversationRow[]>;
  /** Latest bounded window, returned in durable append order (not wall-clock order). */
  listMessages(
    conversation_id: string,
    limit?: number,
  ): Promise<ConversationMessageRow[]>;
}
export class ConversationHistoryError extends Error {
  constructor(
    readonly code: "invalid_input" | "sensitive_message" | "unavailable",
  ) {
    super("Conversation history operation failed");
    this.name = "ConversationHistoryError";
  }
}
function shape(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((k) => Object.hasOwn(value, k))
  )
    throw new Error();
  return value as Record<string, unknown>;
}
export function parseHistoryId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)
  )
    throw new ConversationHistoryError("invalid_input");
  return value;
}
function timestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    new Date(value).toISOString() !== value
  )
    throw new Error();
  return value;
}
export function parseConversation(value: unknown): ConversationRow {
  try {
    const v = shape(value, ["id", "created_at"]);
    return { id: parseHistoryId(v.id), created_at: timestamp(v.created_at) };
  } catch {
    throw new ConversationHistoryError("invalid_input");
  }
}
export function parseConversationMessage(
  value: unknown,
): ConversationMessageRow {
  let row: ConversationMessageRow;
  try {
    const v = shape(value, [
      "id",
      "conversation_id",
      "source",
      "role",
      "content",
      "created_at",
    ]);
    const { source, role, content } = v;
    if (
      (source !== "app" && source !== "cli" && source !== "telegram") ||
      (role !== "user" && role !== "assistant") ||
      typeof content !== "string" ||
      content.length > 8192 ||
      !content.trim() ||
      content.includes("\0")
    )
      throw new Error();
    row = {
      id: parseHistoryId(v.id),
      conversation_id: parseHistoryId(v.conversation_id),
      source,
      role,
      content,
      created_at: timestamp(v.created_at),
    };
  } catch {
    throw new ConversationHistoryError("invalid_input");
  }
  if (checkSensitiveMessage(row.content).sensitive)
    throw new ConversationHistoryError("sensitive_message");
  return row;
}
export function parseHistoryLimit(value: unknown = 50): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 100
  )
    throw new ConversationHistoryError("invalid_input");
  return value;
}
export async function startConversation(
  store: ConversationHistoryStore,
  input: ConversationRow,
): Promise<ConversationRow> {
  const row = parseConversation(input);
  try {
    await store.createConversation({ ...row });
  } catch {
    throw new ConversationHistoryError("unavailable");
  }
  return row;
}
export async function recordConversationMessage(
  store: ConversationHistoryStore,
  input: ConversationMessageRow,
): Promise<
  | { status: "stored"; message: ConversationMessageRow }
  | { status: "sensitive_dropped" }
> {
  try {
    const row = parseConversationMessage(input);
    await store.appendMessage({ ...row });
    return { status: "stored", message: row };
  } catch (error) {
    if (error instanceof ConversationHistoryError) {
      if (error.code === "sensitive_message")
        return { status: "sensitive_dropped" };
      throw new ConversationHistoryError(error.code);
    }
    throw new ConversationHistoryError("unavailable");
  }
}
