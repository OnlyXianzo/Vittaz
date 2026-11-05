import type Database from "better-sqlite3";
export interface MigrateOptions {
  targetVersion?: number;
}
export interface MigrateResult {
  previousVersion: number;
  currentVersion: number;
  applied: number[];
}
export const LATEST_SCHEMA_VERSION = 3;
const steps = [
  {
    version: 1,
    name: "001_initial_ledger",
    sql: "\n        CREATE TABLE schema_migrations (\n          version INTEGER PRIMARY KEY,\n          name TEXT NOT NULL,\n          applied_at TEXT NOT NULL\n        ) STRICT;\n\n        CREATE TABLE wallets (\n          id TEXT PRIMARY KEY,\n          name TEXT NOT NULL,\n          kind TEXT NOT NULL CHECK (kind IN ('cash', 'bank', 'upi')),\n          opening_balance_paise INTEGER NOT NULL CHECK (typeof(opening_balance_paise) = 'integer' AND opening_balance_paise BETWEEN -9007199254740991 AND 9007199254740991),\n          created_at TEXT NOT NULL\n        ) STRICT;\n\n        CREATE TABLE counterparties (\n          id TEXT PRIMARY KEY,\n          name TEXT NOT NULL UNIQUE,\n          placeholder TEXT NOT NULL UNIQUE,\n          created_at TEXT NOT NULL\n        ) STRICT;\n\n        CREATE TABLE proposals (\n          id TEXT PRIMARY KEY,\n          wallet_id TEXT NOT NULL REFERENCES wallets(id),\n          amount_paise INTEGER NOT NULL CHECK (typeof(amount_paise) = 'integer' AND amount_paise BETWEEN 1 AND 9007199254740991),\n          direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),\n          event_type TEXT NOT NULL DEFAULT 'normal' CHECK (event_type IN ('normal', 'refund', 'reversal')),\n          category TEXT NOT NULL DEFAULT 'uncategorized',\n          counterparty_name TEXT,\n          note TEXT,\n          source TEXT NOT NULL DEFAULT 'ai',\n          initial_tx_status TEXT NOT NULL DEFAULT 'ai_checked' CHECK (initial_tx_status IN ('unverified', 'ai_checked', 'user_confirmed')),\n          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),\n          committed_tx_id TEXT,\n          occurred_at TEXT NOT NULL,\n          created_at TEXT NOT NULL\n        ) STRICT;\n\n        CREATE TABLE transactions (\n          id TEXT PRIMARY KEY,\n          wallet_id TEXT NOT NULL REFERENCES wallets(id),\n          amount_paise INTEGER NOT NULL CHECK (typeof(amount_paise) = 'integer' AND amount_paise BETWEEN 1 AND 9007199254740991),\n          direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),\n          event_type TEXT NOT NULL DEFAULT 'normal' CHECK (event_type IN ('normal', 'refund', 'reversal')),\n          category TEXT NOT NULL DEFAULT 'uncategorized',\n          counterparty_name TEXT,\n          account_last4 TEXT CHECK (account_last4 IS NULL OR length(account_last4) = 4),\n          dedup_key TEXT UNIQUE,\n          note TEXT,\n          status TEXT NOT NULL CHECK (status IN ('unverified', 'ai_checked', 'user_confirmed')),\n          source TEXT NOT NULL DEFAULT 'manual',\n          proposal_id TEXT,\n          occurred_at TEXT NOT NULL,\n          created_at TEXT NOT NULL,\n          updated_at TEXT NOT NULL\n        ) STRICT;\n\n        CREATE TABLE audit_log (\n          id TEXT PRIMARY KEY,\n          action TEXT NOT NULL,\n          entity_type TEXT NOT NULL,\n          entity_id TEXT NOT NULL,\n          before_state TEXT,\n          after_state TEXT,\n          related_proposal_before TEXT,\n          undone INTEGER NOT NULL DEFAULT 0 CHECK (undone IN (0, 1)),\n          created_at TEXT NOT NULL\n        ) STRICT;\n\n        INSERT OR IGNORE INTO wallets (id, name, kind, opening_balance_paise, created_at)\n        VALUES ('cash', 'Cash Wallet', 'cash', 0, '2026-11-01T00:00:00.000Z'),\n               ('bank_default', 'Primary Bank', 'bank', 0, '2026-11-01T00:00:00.000Z');\n      ",
  },
  {
    version: 2,
    name: "002_v1_spec_tags_imports_analytics_indexes",
    sql: "\n        ALTER TABLE transactions ADD COLUMN benefit TEXT NOT NULL DEFAULT 'self';\n        ALTER TABLE transactions ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';\n        ALTER TABLE transactions ADD COLUMN import_fingerprint TEXT;\n        ALTER TABLE transactions ADD COLUMN split_owed_paise INTEGER NOT NULL DEFAULT 0 CHECK (typeof(split_owed_paise) = 'integer' AND split_owed_paise BETWEEN 0 AND 9007199254740991);\n\n        ALTER TABLE proposals ADD COLUMN benefit TEXT NOT NULL DEFAULT 'self';\n        ALTER TABLE proposals ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';\n        ALTER TABLE proposals ADD COLUMN split_owed_paise INTEGER NOT NULL DEFAULT 0 CHECK (typeof(split_owed_paise) = 'integer' AND split_owed_paise BETWEEN 0 AND 9007199254740991);\n\n        CREATE UNIQUE INDEX idx_tx_import_fingerprint\n          ON transactions(import_fingerprint)\n          WHERE import_fingerprint IS NOT NULL;\n\n        CREATE INDEX idx_tx_occurred_at\n          ON transactions(occurred_at);\n\n        CREATE INDEX idx_tx_status\n          ON transactions(status);\n\n        CREATE INDEX idx_tx_month_dir_event\n          ON transactions(occurred_at, direction, event_type);\n\n        CREATE TABLE unparsed_messages (\n          id TEXT PRIMARY KEY,\n          app_package TEXT NOT NULL,\n          sanitized_text TEXT NOT NULL,\n          post_time TEXT NOT NULL,\n          reason TEXT NOT NULL,\n          routed_to TEXT NOT NULL CHECK (routed_to IN ('local_parser', 'unparsed_list')),\n          created_at TEXT NOT NULL\n        ) STRICT;\n\n        CREATE TABLE ai_analytics_log (\n          id TEXT PRIMARY KEY,\n          provider TEXT NOT NULL,\n          model TEXT NOT NULL,\n          key_nickname TEXT NOT NULL,\n          prompt_tokens INTEGER NOT NULL CHECK (typeof(prompt_tokens) = 'integer'),\n          completion_tokens INTEGER NOT NULL CHECK (typeof(completion_tokens) = 'integer'),\n          total_tokens INTEGER NOT NULL CHECK (typeof(total_tokens) = 'integer'),\n          latency_ms INTEGER NOT NULL CHECK (typeof(latency_ms) = 'integer'),\n          cost_estimate_micros INTEGER NOT NULL CHECK (typeof(cost_estimate_micros) = 'integer'),\n          outcome TEXT NOT NULL,\n          created_at TEXT NOT NULL\n        ) STRICT;\n\n        CREATE TABLE app_settings (\n          key TEXT PRIMARY KEY,\n          value_json TEXT NOT NULL\n        ) STRICT;\n\n        INSERT OR IGNORE INTO app_settings (key, value_json)\n        VALUES ('send_notes_to_cloud', 'false');\n      \nALTER TABLE transactions ADD COLUMN benefit_paise INTEGER NOT NULL DEFAULT 0 CHECK (benefit_paise BETWEEN 0 AND 9007199254740991);\nALTER TABLE transactions ADD COLUMN tag TEXT;\nALTER TABLE proposals ADD COLUMN benefit_paise INTEGER NOT NULL DEFAULT 0 CHECK (benefit_paise BETWEEN 0 AND 9007199254740991);\nALTER TABLE proposals ADD COLUMN tag TEXT;\n",
  },
  {
    version: 3,
    name: "003_conversation_history",
    sql: `
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
        created_at TEXT NOT NULL CHECK (length(created_at) = 24)
      ) STRICT;
      CREATE TABLE messages (
        sequence INTEGER PRIMARY KEY,
        id TEXT NOT NULL UNIQUE CHECK (length(id) BETWEEN 1 AND 128),
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        source TEXT NOT NULL CHECK (source IN ('app', 'cli', 'telegram')),
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 8192 AND instr(content, char(0)) = 0),
        created_at TEXT NOT NULL CHECK (length(created_at) = 24)
      ) STRICT;
      CREATE INDEX idx_conversations_recent ON conversations(created_at, id);
      CREATE INDEX idx_messages_conversation_recent ON messages(conversation_id, sequence);
    `,
  },
] as const;
export function getCurrentSchemaVersion(db: Database.Database): number {
  return db.pragma("user_version", { simple: true }) as number;
}
export function migrate(
  db: Database.Database,
  options: MigrateOptions = {},
): MigrateResult {
  const target = options.targetVersion ?? LATEST_SCHEMA_VERSION;
  if (!Number.isInteger(target) || target < 0 || target > LATEST_SCHEMA_VERSION)
    throw new Error("invalid_schema_target");
  if (db.inTransaction) throw new Error("migration_requires_idle_connection");
  const previousVersion = getCurrentSchemaVersion(db);
  if (previousVersion > LATEST_SCHEMA_VERSION)
    throw new Error("schema_newer_than_supported");
  if (target < previousVersion)
    throw new Error("schema_downgrade_not_supported");
  const applied: number[] = [];
  for (const step of steps) {
    if (step.version <= previousVersion || step.version > target) continue;
    db.transaction(() => {
      db.exec(step.sql);
      db.prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
      ).run(step.version, step.name, new Date().toISOString());
      db.pragma("user_version = " + step.version);
    }).immediate();
    applied.push(step.version);
  }
  return {
    previousVersion,
    currentVersion: getCurrentSchemaVersion(db),
    applied,
  };
}
