import type {
  AuditLogRow,
  LedgerRepositories,
  LedgerStore,
  ProposalRow,
  ReadLedgerRepositories,
  TransactionRow,
  UnparsedMessageRow,
  WalletRow,
  WriteRepository,
} from "@vittaz/core";
import { LATEST_SCHEMA_VERSION, MIGRATION_STEPS } from "@vittaz/core";

/** Minimal Expo SQLite API used by the adapter; structural for contract tests. */
export interface ExpoSqliteConnection {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: unknown[]): Promise<{ changes: number }>;
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}

type Row =
  WalletRow | TransactionRow | ProposalRow | AuditLogRow | UnparsedMessageRow;

const table_columns = {
  wallets: ["id", "name", "kind", "opening_balance_paise", "created_at"],
  transactions: [
    "id",
    "wallet_id",
    "amount_paise",
    "direction",
    "event_type",
    "category",
    "counterparty_name",
    "account_last4",
    "dedup_key",
    "note",
    "status",
    "source",
    "proposal_id",
    "benefit",
    "benefit_paise",
    "tag",
    "tags_json",
    "import_fingerprint",
    "split_owed_paise",
    "occurred_at",
    "created_at",
    "updated_at",
  ],
  proposals: [
    "id",
    "wallet_id",
    "amount_paise",
    "direction",
    "event_type",
    "category",
    "counterparty_name",
    "note",
    "source",
    "initial_tx_status",
    "status",
    "committed_tx_id",
    "benefit",
    "benefit_paise",
    "tag",
    "tags_json",
    "split_owed_paise",
    "occurred_at",
    "created_at",
  ],
  audit_log: [
    "id",
    "action",
    "entity_type",
    "entity_id",
    "before_state",
    "after_state",
    "related_proposal_before",
    "undone",
    "created_at",
  ],
  unparsed_messages: [
    "id",
    "app_package",
    "sanitized_text",
    "post_time",
    "reason",
    "routed_to",
    "created_at",
  ],
} as const;

type TableName = keyof typeof table_columns;

/**
 * Create a mobile implementation of the core LedgerStore port.
 * Migrations are the exact SQL constants shared with packages/storage; only
 * the driver mechanics differ between better-sqlite3 and Expo SQLite.
 */
export async function createExpoSqliteLedgerStore(
  connection: ExpoSqliteConnection,
): Promise<LedgerStore> {
  await initialize(connection);
  return createStore(connection);
}

async function initialize(db: ExpoSqliteConnection): Promise<void> {
  await db.execAsync("PRAGMA foreign_keys = ON;");
  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version;",
  );
  const previous = Number(versionRow?.user_version ?? 0);
  if (previous > LATEST_SCHEMA_VERSION)
    throw new Error("schema_newer_than_supported");

  for (const step of MIGRATION_STEPS) {
    if (step.version <= previous) continue;
    await db.withTransactionAsync(async () => {
      await db.execAsync(step.sql);
      await db.runAsync(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        step.version,
        step.name,
        new Date().toISOString(),
      );
      await db.execAsync(`PRAGMA user_version = ${step.version};`);
    });
  }
}

function createStore(db: ExpoSqliteConnection): LedgerStore {
  let queue: Promise<void> = Promise.resolve();
  // Synchronous callback entry detection catches direct nested store calls.
  // Callbacks must use their scoped repository handles rather than re-entering
  // the store; this avoids deadlocks while unrelated operations remain queued.
  let invoking_callback = false;
  let closing = false;
  let close_promise: Promise<void> | null = null;

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work, work);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function assertOpen(): void {
    if (closing) throw new Error("repository_closed");
  }

  return {
    read<T>(work: (repos: ReadLedgerRepositories) => Promise<T>): Promise<T> {
      try {
        assertOpen();
        if (invoking_callback) throw new Error("repository_reentrant_access");
      } catch (error) {
        return Promise.reject(error);
      }
      return enqueue(async () => {
        let active = true;
        const repos = makeRepositories(db, false, () => active);
        try {
          invoking_callback = true;
          let result: Promise<T>;
          try {
            result = work(repos);
          } finally {
            invoking_callback = false;
          }
          return await result;
        } finally {
          active = false;
        }
      });
    },
    transaction<T>(
      work: (repos: LedgerRepositories) => Promise<T>,
    ): Promise<T> {
      try {
        assertOpen();
        if (invoking_callback) throw new Error("repository_reentrant_access");
      } catch (error) {
        return Promise.reject(error);
      }
      return enqueue(async () => {
        let active = true;
        let result!: T;
        try {
          // All reads and writes enter through this store's queue, so the
          // regular transaction can safely share the configured connection.
          // Expo documents that exclusive transactions use a fresh connection
          // where PRAGMA foreign_keys does not apply.
          await db.withTransactionAsync(async () => {
            const repos = makeRepositories(db, true, () => active);
            invoking_callback = true;
            let work_result: Promise<T>;
            try {
              work_result = work(repos);
            } finally {
              invoking_callback = false;
            }
            result = await work_result;
          });
          return result;
        } finally {
          active = false;
        }
      });
    },
    close(): Promise<void> {
      if (invoking_callback)
        return Promise.reject(new Error("repository_reentrant_access"));
      if (close_promise) return close_promise;
      closing = true;
      close_promise = enqueue(() => db.closeAsync());
      return close_promise;
    },
  };
}

function makeRepositories(
  db: ExpoSqliteConnection,
  writable: false,
  active: () => boolean,
): ReadLedgerRepositories;
function makeRepositories(
  db: ExpoSqliteConnection,
  writable: true,
  active: () => boolean,
): LedgerRepositories;
function makeRepositories(
  db: ExpoSqliteConnection,
  writable: boolean,
  active: () => boolean,
): ReadLedgerRepositories | LedgerRepositories {
  const repo = <T extends Row>(table: TableName) => {
    const columns = [...table_columns[table]] as string[];
    const base = {
      get: async (id: string): Promise<T | null> => {
        assertActive(active);
        return db.getFirstAsync<T>(`SELECT * FROM ${table} WHERE id = ?`, id);
      },
      list: async (): Promise<T[]> => {
        assertActive(active);
        return db.getAllAsync<T>(`SELECT * FROM ${table}`);
      },
    };
    if (!writable) return base;

    const write: WriteRepository<T> = {
      ...base,
      insert: async (row: T): Promise<void> => {
        assertActive(active);
        const rowValues = row as unknown as Record<string, unknown>;
        const placeholders = columns.map(() => "?").join(", ");
        await db.runAsync(
          `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
          ...columns.map((column) => rowValues[column] ?? null),
        );
      },
      replace: async (row: T): Promise<void> => {
        assertActive(active);
        const rowValues = row as unknown as Record<string, unknown>;
        const updateColumns = columns.filter((column) => column !== "id");
        const result = await db.runAsync(
          `UPDATE ${table} SET ${updateColumns.map((column) => `${column} = ?`).join(", ")} WHERE id = ?`,
          ...updateColumns.map((column) => rowValues[column] ?? null),
          row.id,
        );
        if (result.changes === 0) throw new Error("repository_row_missing");
      },
      remove: async (id: string): Promise<void> => {
        assertActive(active);
        await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, id);
      },
    };
    return write;
  };

  return {
    wallets: repo<WalletRow>("wallets"),
    transactions: repo<TransactionRow>("transactions"),
    proposals: repo<ProposalRow>("proposals"),
    audit: repo<AuditLogRow>("audit_log"),
    unparsed_messages: repo<UnparsedMessageRow>("unparsed_messages"),
  } as ReadLedgerRepositories | LedgerRepositories;
}

function assertActive(active: () => boolean): void {
  if (!active()) throw new Error("repository_scope_expired");
}
