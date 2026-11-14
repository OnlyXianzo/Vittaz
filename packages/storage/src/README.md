# Storage Implementation

## Overview

SQLite persistence layer powered by `better-sqlite3` and `drizzle-orm`, providing ACID transactions, versioned migrations, re-entrant serialized execution, backup/restore with SHA-256 validation, and XLSX spreadsheet decoding.

## Interface

- **Store Lifecycle & Concrete Repositories (`repositories.ts`, `expo_sqlite_store.ts`)**:
  - `openLedgerStore(filename: string): OperationalStore`: Opens operational SQLite database backing `@vittaz/core` repositories.
  - `openReadOnlyLedgerStore(filename: string): Pick<SnapshotStore, 'read' | 'close'>`: Opens read-only store asserting current schema.
  - `createExpoSqliteLedgerStore(db: ExpoSqliteConnection): Promise<OperationalStore>`: Creates mobile SQLite store adapting `expo-sqlite`.
  - `createHistoryRepository(db: Database)`: Returns concrete conversation history store.
  - `createPreferencesRepository(db: Database)`: Returns concrete assistant preferences repository.
  - `createRulesRepository(db: Database)`: Returns concrete assistant rules repository.
  - `OperationalStore`, `SnapshotStore`, `ExpoSqliteConnection`.
- **Drizzle Table Schemas (`schema.ts`)**:
  - `wallets`, `transactions`, `proposals`, `audit_log`, `counterparties`, `app_settings`, `unparsed_messages`, `ai_analytics_log`, `conversations`, `messages`.
- **Migrations (`migrations.ts`)**:
  - `migrate(db: Database.Database, options?: MigrateOptions): MigrateResult`.
  - `getCurrentSchemaVersion(db: Database.Database): number`.
  - `MigrateOptions`, `MigrateResult`.
- **Backup & Restore (`backup.ts`, `backup_schema.ts`)**:
  - `createBackup(store: SnapshotStore, exportedAt?: string): Promise<string>`.
  - `restoreBackup(store: SnapshotStore, data: unknown): Promise<{ restoredTransactions: number }>`.
  - `EXPORT_PRIVACY_WARNING`, `BackupPayload`, `LedgerBackup`, `KhataclawBackup`, `payloadSchema`, `walletSchema`, `transactionSchema`, `proposalSchema`, `auditSchema`, `counterpartySchema`, `settingSchema`.
- **Excel Ingestion & Validation (`excel.ts`, `excel_zip.ts`)**:
  - `importExcelBuffer(store: LedgerStore, buffer: Uint8Array, options?: ExcelImportOptions, runtime?: LedgerRuntime): Promise<ExcelImportResult>`.
  - `validateWorkbookZip(zip: Buffer): void`.
- **Analytics Metadata (`analytics.ts`)**:
  - `parseAnalyticsMetadata(value: unknown): AiAnalyticsMetadata`.

## Invariants

- Database transactions are serialized through `AsyncLocalStorage` context queues to prevent re-entrant or concurrent SQLite locking conflicts.
- Read-only stores enforce `PRAGMA query_only = ON` and require database schema to match `LATEST_SCHEMA_VERSION` exactly.
- Migrations execute sequentially within `BEGIN IMMEDIATE` transactions, recording version numbers in `schema_migrations` and updating `user_version` pragma; downgrades are rejected.
- Backups (`khataclaw-backup-v1`) enforce schemaVersion 2, include `EXPORT_PRIVACY_WARNING`, and verify SHA-256 checksums before restoring snapshots.
- Spreadsheet buffer parsing validates zip signatures, bounds dimensions (<=64 columns, <=10,000 rows, <=1MB), and strips formula execution.

## Side Effects

- Creates, reads, and mutates SQLite database files on disk.
- Executes schema migrations and DDL table modifications.
- Computes SHA-256 cryptographic hashes using Node crypto module.

## Verification

- Run: `npm test`
