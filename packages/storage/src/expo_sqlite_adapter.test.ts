import { expect, test } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLedgerStore } from "./repositories.js";
import { ledgerStoreContractCases } from "../../core/test/ledger_store_contract.js";
import {
  createExpoSqliteLedgerStore,
  type ExpoSqliteConnection,
} from "../../../apps/mobile/src/storage/expo_sqlite_store.js";

// The adapter talks only the public async Expo SQLite API. This bridge uses a
// real SQLite engine so the exact same framework-neutral contract cases run
// against both implementations in CI without a device or native-module mock.
function openNodeSqlitePort(filename = ":memory:"): ExpoSqliteConnection {
  const db = new Database(filename);
  return {
    execAsync: async (sql) => {
      db.exec(sql);
    },
    runAsync: async (sql, ...params) => {
      const result = db.prepare(sql).run(...(params as never[]));
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    getFirstAsync: async <T>(sql: string, ...params: unknown[]) =>
      (db.prepare(sql).get(...(params as never[])) as T | undefined) ?? null,
    getAllAsync: async <T>(sql: string, ...params: unknown[]) =>
      db.prepare(sql).all(...(params as never[])) as T[],
    withTransactionAsync: async (work) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        await work();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    closeAsync: async () => {
      db.close();
    },
  };
}

const assertions = {
  equal(actual: unknown, expected: unknown) {
    expect(actual).toEqual(expected);
  },
  deepEqual(actual: unknown, expected: unknown) {
    expect(actual).toEqual(expected);
  },
  async asyncRejects(promise: Promise<unknown>, message: string) {
    await expect(promise).rejects.toThrow(message);
  },
};

for (const contract of ledgerStoreContractCases(async () =>
  openLedgerStore(":memory:"),
)) {
  test(`node_${contract.name}`, () => contract.run(assertions));
}
for (const contract of ledgerStoreContractCases(async () =>
  createExpoSqliteLedgerStore(openNodeSqlitePort()),
)) {
  test(`expo_${contract.name}`, () => contract.run(assertions));
}

test("expo_migrations_use_the_same_versioned_sql_as_node_storage", async () => {
  const db = openNodeSqlitePort();
  const expo_store = await createExpoSqliteLedgerStore(db);
  const version = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version;",
  );
  expect(version?.user_version).toBe(3);
  await expo_store.close();
});

test("expo_sqlite_store_persists_rows_across_close_and_reopen", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vittaz-expo-adapter-"));
  try {
    const filename = join(dir, "synthetic.sqlite");
    const first = await createExpoSqliteLedgerStore(
      openNodeSqlitePort(filename),
    );
    const wallet = {
      id: "persistent_wallet",
      name: "Synthetic Persistent Wallet",
      kind: "cash" as const,
      opening_balance_paise: 77,
      created_at: "2026-11-06T00:00:00.000Z",
    };
    await first.transaction((repos) => repos.wallets.insert(wallet));
    await first.close();
    const second = await createExpoSqliteLedgerStore(
      openNodeSqlitePort(filename),
    );
    expect(await second.read((repos) => repos.wallets.get(wallet.id))).toEqual(
      wallet,
    );
    await second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
