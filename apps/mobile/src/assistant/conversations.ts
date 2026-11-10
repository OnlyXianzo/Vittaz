import Storage from "expo-sqlite/kv-store";
import { parseConversationMessage } from "@vittaz/core";
import type { ChatMessage } from "../domain";
import { CHAT_HISTORY_KEY } from "./chat_history";

export const CONVERSATIONS_KEY = "vittaz.chat.conversations.v2";
const MAX_CONVERSATIONS = 100;
const MAX_MESSAGES = 50;
const valid_id = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

export interface LocalConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
}
export interface ConversationIndex {
  version: 2;
  active_id: string | null;
  conversations: LocalConversation[];
}

let queue: Promise<void> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
function clean_messages(id: string, messages: ChatMessage[]): ChatMessage[] {
  const output: ChatMessage[] = [];
  for (const message of messages.slice(-MAX_MESSAGES)) {
    try {
      const row = parseConversationMessage({
        id: message.id,
        conversation_id: id,
        source: "app",
        role: message.role,
        content: message.text.slice(0, 8192),
        created_at: new Date().toISOString(),
      });
      output.push({ id: row.id, role: row.role, text: row.content });
    } catch {
      // Invalid or sensitive rows do not enter persisted conversation history.
    }
  }
  return output;
}
function title_for(messages: ChatMessage[]): string {
  return (
    messages.find((message) => message.role === "user")?.text.slice(0, 60) ||
    "New conversation"
  );
}
function parse_index(raw: string): ConversationIndex {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") throw new Error();
    const data = value as Record<string, unknown>;
    if (
      data.version !== 2 ||
      !Array.isArray(data.conversations) ||
      data.conversations.length > MAX_CONVERSATIONS ||
      !(data.active_id === null || typeof data.active_id === "string")
    )
      throw new Error();
    const ids = new Set<string>();
    const conversations: LocalConversation[] = data.conversations.map(
      (item: unknown) => {
        if (!item || typeof item !== "object") throw new Error();
        const c = item as Record<string, unknown>;
        if (
          typeof c.id !== "string" ||
          !valid_id.test(c.id) ||
          ids.has(c.id) ||
          !Array.isArray(c.messages)
        )
          throw new Error();
        ids.add(c.id);
        const messages = clean_messages(c.id, c.messages as ChatMessage[]);
        return { id: c.id, title: title_for(messages), messages };
      },
    );
    if (typeof data.active_id === "string" && !ids.has(data.active_id))
      throw new Error();
    return {
      version: 2,
      active_id: data.active_id as string | null,
      conversations,
    };
  } catch {
    throw new Error("conversation_storage_invalid");
  }
}
async function read_index(): Promise<ConversationIndex> {
  const raw = await Storage.getItemAsync(CONVERSATIONS_KEY);
  if (raw !== null) {
    const index = parse_index(raw);
    await Storage.removeItemAsync(CHAT_HISTORY_KEY);
    return index;
  }
  const legacy = await Storage.getItemAsync(CHAT_HISTORY_KEY);
  const messages: ChatMessage[] = [];
  if (legacy !== null) {
    let rows: unknown;
    try {
      rows = JSON.parse(legacy);
      if (!Array.isArray(rows)) throw new Error();
    } catch {
      throw new Error("conversation_legacy_invalid");
    }
    for (const value of (rows as unknown[]).slice(-MAX_MESSAGES)) {
      try {
        const row = parseConversationMessage(value);
        if (row.source === "app" && row.conversation_id === "app_chat")
          messages.push({ id: row.id, role: row.role, text: row.content });
      } catch {
        // Legacy invalid or sensitive rows remain excluded.
      }
    }
  }
  const index: ConversationIndex = {
    version: 2,
    active_id: messages.length ? "app_chat" : null,
    conversations: messages.length
      ? [{ id: "app_chat", title: title_for(messages), messages }]
      : [],
  };
  await Storage.setItemAsync(CONVERSATIONS_KEY, JSON.stringify(index));
  if (legacy !== null) await Storage.removeItemAsync(CHAT_HISTORY_KEY);
  return index;
}
async function write_index(index: ConversationIndex): Promise<void> {
  await Storage.setItemAsync(CONVERSATIONS_KEY, JSON.stringify(index));
}
export function load_conversations(): Promise<ConversationIndex> {
  return serialized(read_index);
}
export function create_conversation(id: string): Promise<void> {
  return serialized(async () => {
    const index = await read_index();
    if (!valid_id.test(id) || index.conversations.some((c) => c.id === id))
      throw new Error("conversation_id_invalid");
    if (index.conversations.length >= MAX_CONVERSATIONS)
      throw new Error("conversation_limit_reached");
    index.conversations.unshift({
      id,
      title: "New conversation",
      messages: [],
    });
    index.active_id = id;
    await write_index(index);
  });
}
export function save_conversation_messages(
  id: string,
  messages: ChatMessage[],
): Promise<void> {
  return serialized(async () => {
    const index = await read_index();
    const chat = index.conversations.find((c) => c.id === id);
    if (!chat) throw new Error("conversation_not_found");
    chat.messages = clean_messages(id, messages);
    chat.title = title_for(chat.messages);
    await write_index(index);
  });
}
export function select_conversation(id: string): Promise<void> {
  return serialized(async () => {
    const index = await read_index();
    if (!index.conversations.some((c) => c.id === id))
      throw new Error("conversation_not_found");
    index.active_id = id;
    await write_index(index);
  });
}
export function delete_conversation(id: string): Promise<void> {
  return serialized(async () => {
    const index = await read_index();
    if (!index.conversations.some((c) => c.id === id))
      throw new Error("conversation_not_found");
    index.conversations = index.conversations.filter((c) => c.id !== id);
    if (index.active_id === id)
      index.active_id = index.conversations[0]?.id ?? null;
    await write_index(index);
  });
}
