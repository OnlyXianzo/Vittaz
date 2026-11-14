# Core Ledger Accounting

## Overview

Deterministic double-entry financial accounting core, exact integer paise arithmetic, versioned SQL migration steps, approval state machines, snapshot-based audit logging with reversible undo, and wallet/allowance calculation.

## Interface

- **Money**: `MoneyValidationError`, `assertIntegerPaise`, `assertPositivePaise`, `assertNonNegativePaise`, `sumPaise`, `parseRupeesToPaise`, `formatPaiseToRupees`, `normalizeIndicDigits`.
- **Schema & Repositories**: `LATEST_SCHEMA_VERSION`, `MIGRATION_STEPS`, `TransactionDirection`, `TransactionEventType`, `TransactionStatus`, `ProposalStatus`, `ProposalRow`, `TransactionRow`, `AuditLogRow`, `WalletRow`, `UnparsedMessageRow`, `ReadRepository`, `WriteRepository`, `ReadLedgerRepositories`, `LedgerRepositories`, `LedgerStore`.
- **Ledger Core Operations**: `LedgerError`, `InvalidStatusTransitionError`, `defaultLedgerRuntime`, `createManualTransaction`, `insertAutoCapturedTransaction`, `insertCapturedTransactionInUnit`, `getTransaction`, `transitionTransactionStatus`, `writeTransactionAudit`, `validateInput`, `LedgerRuntime`, `CreateManualTransactionInput`, `AutoCapturedTransactionInput`, `TransactionWriteResult`.
- **Proposals & Approvals**: `createProposal`, `getProposal`, `approveProposal`, `batchApproveProposals`, `rejectProposal`, `CreateProposalInput`, `ApproveProposalResult`.
- **Audit & Reversible Undo**: `updateTransaction`, `undoAuditEntry`, `UpdateTransactionPatch`.
- **Wallet**: `createWallet`, `setWalletOpeningBalance`, `getWalletSummary`, `WalletSummary`.
- **Allowance**: `calculateDailyAllowance`, `getDaysInMonth`, `DailyAllowanceInput`, `DailyAllowanceResult`.

## Invariants

- All monetary figures are strictly safe integer paise; floating-point rupee multiplication and negative zero (`-0`) are strictly forbidden.
- Transaction verification statuses follow a strictly unidirectional lifecycle: `unverified` -> `ai_checked` -> `user_confirmed`.
- Proposals start in `pending` status. Approval creates a transaction and marks proposal `approved` with `committed_tx_id` (idempotent if already approved). Rejection marks status `rejected`. Approved proposals cannot be rejected, and rejected proposals cannot be approved.
- Transaction status cannot be changed via `updateTransaction`; it must use `transitionTransactionStatus`.
- Every transaction creation, update, status change, or proposal approval generates an immutable audit row with full `before_state` and `after_state` JSON snapshots.
- `undoAuditEntry` performs atomic state comparison between current database record and the `after_state` snapshot before restoring `before_state`, preventing stale overwrites.
- Allowance calculations default to Indian Standard Time (`Asia/Kolkata`) calendar dates and distribute remaining disposable paise over days left in the month.
- AI tools must never receive write repository handles; AI interactions can only create pending proposals for user approval.

## Side Effects

- Inserts, updates, or deletes rows across `wallets`, `transactions`, `proposals`, and `audit_log` tables within ACID database transactions.
- Generates UUID identifiers via `globalThis.crypto.randomUUID()`.

## Verification

- Run: `npm test`
