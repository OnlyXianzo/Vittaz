import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import {
  AssistantPreferencesError,
  defaultAssistantPreferences,
  parseAssistantPreferences,
} from "@vittaz/core";
import type { AssistantPreferencesStore } from "@vittaz/core";
import { app_settings } from "./schema.js";
export function createPreferencesRepository(
  db: BetterSQLite3Database,
  access: <T>(write: boolean, work: () => Promise<T>) => Promise<T>,
): AssistantPreferencesStore {
  return {
    async get() {
      try {
        return await access(false, async () => {
          const row = db
            .select()
            .from(app_settings)
            .where(eq(app_settings.key, "assistant_preferences"))
            .get();
          if (!row) return defaultAssistantPreferences();
          if (row.value_json.length > 256) throw new Error();
          return parseAssistantPreferences(JSON.parse(row.value_json));
        });
      } catch {
        throw new AssistantPreferencesError("unavailable");
      }
    },
    async set(input) {
      const value_json = JSON.stringify(parseAssistantPreferences(input));
      try {
        await access(true, async () => {
          db.insert(app_settings)
            .values({ key: "assistant_preferences", value_json })
            .onConflictDoUpdate({
              target: app_settings.key,
              set: { value_json },
            })
            .run();
        });
      } catch {
        throw new AssistantPreferencesError("unavailable");
      }
    },
  };
}
