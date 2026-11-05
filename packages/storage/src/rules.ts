import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { AssistantRulesError, parseAssistantRules } from "@vittaz/core";
import type { AssistantRulesStore } from "@vittaz/core";
import { app_settings } from "./schema.js";
export function createRulesRepository(
  db: BetterSQLite3Database,
  access: <T>(write: boolean, work: () => Promise<T>) => Promise<T>,
): AssistantRulesStore {
  return {
    async get() {
      try {
        return await access(false, async () => {
          const row = db
            .select()
            .from(app_settings)
            .where(eq(app_settings.key, "assistant_rules"))
            .get();
          if (!row) return [];
          if (row.value_json.length > 2048) throw new Error();
          return parseAssistantRules(JSON.parse(row.value_json));
        });
      } catch {
        throw new AssistantRulesError("unavailable");
      }
    },
    async set(input) {
      const value_json = JSON.stringify(parseAssistantRules(input));
      try {
        await access(true, async () => {
          db.insert(app_settings)
            .values({ key: "assistant_rules", value_json })
            .onConflictDoUpdate({
              target: app_settings.key,
              set: { value_json },
            })
            .run();
        });
      } catch {
        throw new AssistantRulesError("unavailable");
      }
    },
  };
}
