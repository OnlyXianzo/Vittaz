# Core Spreadsheet Importers

## Overview

Spreadsheet transaction ingestion engine with zero external or native workbook dependencies, row-level privacy filtering, and deterministic duplicate fingerprinting.

## Interface

- `importExcelRows(store: LedgerStore, grid: ExcelGrid, options?: ExcelImportOptions, runtime?: LedgerRuntime): Promise<ExcelImportResult>`: Core spreadsheet transaction ingestion runner.
- `interface ExcelRowError`: Row processing failure record `{ rowNumber: number; message: string }`.
- `interface ExcelImportResult`: Ingestion summary `{ dryRun: boolean; totalRows: number; validRows: number; importedCount: number; skippedDuplicates: number; extraColumns: string[]; errors: ExcelRowError[] }`.
- `interface ExcelGrid`: In-memory tabular representation `{ headers: unknown[]; rows: { rowNumber: number; values: unknown[]; invalid?: boolean }[]; date1904: boolean }`.
- `interface ExcelImportOptions`: Import configuration `{ dryRun?: boolean; walletId?: string }`.

## Invariants

- Zero external or native workbook dependencies; processes pure in-memory `ExcelGrid` structure.
- Limits spreadsheets to a maximum of 64 headers and 10,000 rows.
- Requires `date` and `amount` header columns; rejects duplicate mapped columns.
- Rejects formula cells and invalid error cells (`row.invalid`).
- Text cell lengths must not exceed 4096 NFKC normalized characters.
- Enforces privacy check via `checkSensitiveMessage` on every string cell; drops any row containing sensitive credentials or authentication patterns.
- All monetary values are parsed into safe non-negative integer paise via `parseRupeesToPaise`.
- Generates deterministic SHA-256 idempotency fingerprint per input row occurrence (`[1, input]#occurrence`) to prevent duplicate transaction insertions.

## Side Effects

- In non-dry-run mode, inserts transactions into `transactions` table and creates audit log entries in `audit_log` within a `store.transaction` unit.
- Calculates cryptographic SHA-256 hashes using Web Crypto subtle digest.

## Verification

- Run: `npm test`
