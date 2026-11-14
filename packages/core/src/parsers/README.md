# Notification Parsers

## Overview

Deterministic notification parser and financial event extractor for Android/SMS/UPI alerts, featuring privacy gates, promotional message rejection, and sliding-window deduplication.

## Interface

- `DEFAULT_ALLOWED_PACKAGES: ReadonlySet<string>`: Set of allowlisted Android financial package identifiers.
- `processNotification(store: LedgerStore, notification: IncomingNotification | null | undefined, options?: ProcessNotificationOptions, runtime?: LedgerRuntime): Promise<ProcessNotificationResult>`: Main notification parsing pipeline.
- `captureDeduplicatedNotification(store: LedgerStore, input: NotificationCapture, windowMs: number, runtime: LedgerRuntime): Promise<{ deduplicated: boolean; transaction: TransactionRow }>`: Sliding-window deduplication and enrichment handler.
- `interface IncomingNotification`: Incoming raw notification `{ appPackage: string; text: unknown; postTime: unknown }`.
- `interface ProcessNotificationOptions`: Ingestion flags `{ allowedPackages?: ReadonlySet<string>; localParserAvailable?: boolean; dedupWindowMs?: number }`.
- `interface ProcessNotificationResult`: Processing outcome `{ action: string; committed: boolean; reason?: string; amountPaise?: number; occurredAt?: string; transaction?: TransactionRow; routedTo?: 'local_parser' | 'unparsed_list'; unparsedId?: string }`.

## Invariants

- Ingress filter immediately drops notifications from packages not in `allowedPackages` (action: `'dropped_unallowed_app'`).
- Strict privacy filter immediately drops messages containing sensitive authentication data like OTPs, PINs, passwords, or CVVs (action: `'dropped_sensitive'`).
- Notifications exposing unmasked account numbers with 8+ consecutive digits are dropped (action: `'dropped_unmasked_account'`).
- Promotional and marketing messages lacking confirmed debit/credit fund movement are rejected (action: `'rejected_promotional'`).
- Extracts amounts, directions (debit/credit), event types (normal/refund/reversal), masked account last 4 digits, counterparty names, and UTR/UPI reference numbers.
- Deduplication window (default 300,000ms / 5 min; max 24h) enriches matching existing records instead of creating duplicate transactions.
- Unrecognized notification formats are scrubbed of outbound PII, have digit sequences >= 6 masked as `[DIGITS]`, and are routed to `unparsed_messages` table.

## Side Effects

- Writes captured transactions to `transactions` table, audit records to `audit_log`, and unparsed message entries to `unparsed_messages` table via `store.transaction`.

## Verification

- Run: `npm test`
