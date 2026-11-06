import { openDatabaseAsync } from "expo-sqlite";
import { createExpoSqliteLedgerStore } from "../../../../packages/storage/src/expo_sqlite_store";

/** Opens the persistent on-device Vittaz database and applies pending schema migrations. */
export async function openMobileLedgerStore(databaseName = "vittaz.db") {
  const database = await openDatabaseAsync(databaseName);
  try {
    return await createExpoSqliteLedgerStore(database);
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
}
