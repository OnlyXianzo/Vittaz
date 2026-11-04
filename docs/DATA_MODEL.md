# Data model

This document describes the conceptual data model for the initial personal-use product. Exact columns, constraints, indexes, and migration details belong in the implementation schema.

## Money representation

- The currency for v1 is Indian rupees.
- Store monetary values as integer paise.
- Do not use JavaScript floating-point values as the authoritative representation of money.
- Parse user-entered rupee amounts from decimal strings and validate precision and range.
- Reject invalid numeric values, including `NaN`, infinities, and negative zero where relevant.

## Core entities

### Accounts

Represents a place where the user's money is held, initially Cash, UPI, or a bank account.

An account has an opening balance and a current balance derived from its recorded movements. Cash in hand is the balance of the Cash account.

### Counterparties

Represents a person or organization associated with lending, borrowing, payments, or receipts.

Counterparty names are private data. Any use in cloud AI requests must be subject to the privacy rules in [Privacy](PRIVACY.md).

### Transactions

Represents a financial movement or an event affecting what the user owes or is owed.

The initial specification identifies these attributes:

- Unique identifier.
- Account.
- Amount in paise.
- Direction.
- Counterparty, when applicable.
- Category.
- Note.
- Timestamp.
- Verification status.
- Source.
- Reference hash for deduplication.
- Benefit amount in paise, for cashback or offers, when applicable.
- Tag, a user label for grouping such as a month and purpose.

The model must distinguish ordinary income and expense from transfers, lending, borrowing, repayments, refunds, and reversals. These distinctions are necessary to avoid incorrect summaries and balances.

### Proposals

Represents an uncommitted transaction draft produced by AI or an input parser.

A proposal should retain its proposed values, source type, validation issues, and review state. It must not affect account balances until approved.

### Audit log

Records approved financial mutations and the information needed to reverse them safely.

An undo operation should create a compensating change or otherwise preserve an accurate history; it should not silently erase the original audit event.

### Settings

Stores non-ledger preferences such as model selection, digest schedule, and device-specific integration settings.

Secrets such as provider keys and Telegram tokens belong in platform secure storage, not ordinary settings rows or logs.

## Transaction status

The product specification proposes the following forward progression:

`unverified` → `ai_checked` → `user_confirmed`

Manual entries begin as `user_confirmed`.

Implementation must define what happens when a user edits an entry, rejects a proposal, imports a previously confirmed transaction, or reverses a transaction. Status changes should not be used as a substitute for explicit proposal and audit records.

## Source values

The initial source categories are:

- `manual`
- `chat`
- `telegram`
- `voice`
- `ocr`
- `notification`
- `import`

Future connectors may add values such as `email`. Telegram messages use `telegram`.

Source values should be stable, validated identifiers. Database values and serialized JSON use `snake_case`.

## Important accounting rules to settle

Before the schema is finalized, define and test:

- Transfers between the user's own accounts.
- Partial lending and repayments.
- Partial borrowing and repayments.
- Refunds and payment reversals.
- Duplicate notification and spreadsheet imports.
- Editing or deleting a confirmed entry.
- Undo after later transactions depend on the original entry.
- Opening balance changes and reconciliation.
- Currency and timestamp handling for future expansion.

## Integrity requirements

- Use foreign keys for relationships.
- Use database transactions for related writes.
- Ensure a proposal can be approved at most once.
- Ensure the financial write and its audit record commit atomically.
- Use unique constraints or idempotency keys where they prevent duplicate imports or approvals.
- Keep schema migrations versioned and tested.

## Assistant data

### Conversations and messages

A conversation has an identifier and timestamps. A message records its conversation, role (`user`, `assistant` or `tool`), content, creation time, and a `source` (`app`, `cli` or `telegram`). The source says where a message came from, not which AI answered it. Messages from unpaired Telegram chats are not stored.

### User preferences

One row per user setting for tone, language and response detail.

### Custom rules

A rule has a category (`assistant_behavior` or `message_condition`), a rule type, a validated structured configuration, an enabled flag and timestamps. The configuration is validated JSON, never free-form instructions that are executed.

### Assistant analytics

One row per model call: provider, model, key nickname (never the key), token counts, latency, estimated cost and result. Never prompt text or reply text.

### Proposals

Proposals also record their source and, when relevant, the message that produced them.
