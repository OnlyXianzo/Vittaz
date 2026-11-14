# CLI Application Source

## Overview

Command-line driver implementation for the Vittaz financial ledger. Parses CLI flags, executes repository use cases, exposes the read-only AI assistant, and produces structured JSON output.

## Interface

- `runCli(argv: readonly string[], deps?: CliDeps): Promise<number>`: Main entrypoint function executing CLI commands against dependency injectors.
- `CliDeps`: Dependency injection container providing `env`, `stdout`, `stderr`, `read_file`, `write_file`, `fetch`, and `assistant_factory`.
- Commands:
  - `add`: Records a manual ledger transaction (`--amount_paise`, `--direction`, `--wallet_id`, etc.).
  - `ledger`: Queries transactions with optional `--status`, `--wallet_id`, and `--limit`.
  - `inbox list`: Lists pending proposals.
  - `inbox approve <ids...>`: Batch approves pending proposals.
  - `inbox reject <id>`: Rejects a proposal.
  - `undo <audit_id>`: Reverses a previous audit transaction.
  - `balance [wallet_id]`: Calculates wallet balances and cash flows.
  - `import <file>`: Imports Excel XLSX transactions with optional `--dry_run`.
  - `backup <file>`: Serializes database contents to a plaintext JSON backup.
  - `restore <file>`: Restores a database backup from a JSON file.
  - `ask <text>`: Submits a read-only question to the shared AI assistant.

## Invariants

- All output is emitted as structured JSON on standard output (`{ ok: true, ... }` or `{ ok: false, error_code: ... }`).
- JSON object keys, tool names, and database columns strictly use `snake_case`.
- Ledger backups are written with restricted file permissions (`0o600`) and embed `EXPORT_PRIVACY_WARNING`.
- Assistant queries are read-only and enforce privacy redaction via `PrivacyRedactor`; no assistant prompt can mutate the ledger.

## Side Effects

- Opens and closes SQLite database connections via `openLedgerStore`.
- Reads and writes files to the filesystem during import, backup, and restore operations.
- Emits serialized JSON lines to `stdout` and error JSON lines to `stderr`.

## Verification

- Run: `npm test`
