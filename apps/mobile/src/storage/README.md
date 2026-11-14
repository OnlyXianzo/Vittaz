# Mobile Storage Adapter

## Overview

Persistence adapter initializing on-device SQLite database storage for the Expo / React Native mobile app using `expo-sqlite`.

## Interface

- `openMobileLedgerStore(databaseName?: string)`: Asynchronously opens an `expo-sqlite` database and constructs a schema-migrated `ExpoSqliteLedgerStore`.

## Invariants

- Database schema and migrations are shared identically with `packages/storage`.
- In case of an initialization or migration failure, the SQLite database connection is explicitly closed before propagating the error.
- Operates in write-ahead logging (WAL) mode where supported by SQLite.

## Side Effects

- Creates or opens the SQLite database file on device storage (`vittaz.db`).
- Applies DDL schema migrations and indices.

## Verification

- Run: `npm test`
