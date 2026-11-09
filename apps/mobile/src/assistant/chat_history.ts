import Storage from "expo-sqlite/kv-store";
import { parseConversationMessage } from "@vittaz/core";
import type { ChatMessage } from "../domain";

export const CHAT_HISTORY_KEY = "vittaz.chat.history.v1";
const CONVERSATION_ID = "app_chat";
const MAX_MESSAGES = 50;

/** Local-only chat history. Sensitive or invalid rows are dropped, never stored. */
export async function load_chat_history(): Promise<ChatMessage[]> {
  try {
    const raw = await Storage.getItemAsync(CHAT_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const messages: ChatMessage[] = [];
    for (const value of parsed.slice(-MAX_MESSAGES)) {
      try {
        const row = parseConversationMessage(value);
        if (row.source !== "app" || row.conversation_id !== CONVERSATION_ID)
          continue;
        messages.push({ id: row.id, role: row.role, text: row.content });
      } catch {
        // Corrupt or sensitive rows are not restored.
      }
    }
    return messages;
  } catch {
    return [];
  }
}

export async function save_chat_history(
  messages: ChatMessage[],
): Promise<void> {
  const rows = [];
  for (const message of messages.slice(-MAX_MESSAGES)) {
    if (!message.text.trim()) continue;
    try {
      rows.push(
        parseConversationMessage({
          id: message.id,
          conversation_id: CONVERSATION_ID,
          source: "app",
          role: message.role,
          content: message.text.slice(0, 8192),
          created_at: new Date().toISOString(),
        }),
      );
    } catch {
      // Sensitive or invalid messages are not persisted.
    }
  }
  await Storage.setItemAsync(CHAT_HISTORY_KEY, JSON.stringify(rows));
}

export async function clear_chat_history(): Promise<void> {
  await Storage.removeItemAsync(CHAT_HISTORY_KEY);
}
