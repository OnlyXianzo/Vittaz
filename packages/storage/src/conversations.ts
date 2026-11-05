import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { desc, eq } from "drizzle-orm";
import {
  ConversationHistoryError,
  parseConversation,
  parseConversationMessage,
  parseHistoryId,
  parseHistoryLimit,
} from "@vittaz/core";
import type { ConversationHistoryStore } from "@vittaz/core";
import { conversations, messages } from "./schema.js";
type Access = <T>(write: boolean, work: () => Promise<T>) => Promise<T>;
/** Shares parent store's connection, transaction queue and closed/reentrant guard. */
export function createHistoryRepository(
  db: BetterSQLite3Database,
  access: Access,
): ConversationHistoryStore {
  async function run<T>(write: boolean, work: () => Promise<T>): Promise<T> {
    try {
      return await access(write, work);
    } catch {
      throw new ConversationHistoryError("unavailable");
    }
  }
  return {
    async ensureConversation(input) {
      const row = parseConversation(input);
      return run(true, async () => {
        db.insert(conversations)
          .values(row)
          .onConflictDoNothing({ target: conversations.id })
          .run();
      });
    },
    async createConversation(input) {
      const row = parseConversation(input);
      return run(true, async () => {
        db.insert(conversations).values(row).run();
      });
    },
    async appendMessage(input) {
      const row = parseConversationMessage(input);
      return run(true, async () => {
        db.insert(messages).values(row).run();
      });
    },
    async listConversations(input) {
      const limit = parseHistoryLimit(input);
      return run(false, async () =>
        db
          .select()
          .from(conversations)
          .orderBy(desc(conversations.created_at), desc(conversations.id))
          .limit(limit)
          .all(),
      );
    },
    async listMessages(input, count) {
      const id = parseHistoryId(input);
      const limit = parseHistoryLimit(count);
      return run(false, async () =>
        db
          .select({
            id: messages.id,
            conversation_id: messages.conversation_id,
            source: messages.source,
            role: messages.role,
            content: messages.content,
            created_at: messages.created_at,
          })
          .from(messages)
          .where(eq(messages.conversation_id, id))
          .orderBy(desc(messages.sequence))
          .limit(limit)
          .all()
          .reverse(),
      );
    },
  };
}
