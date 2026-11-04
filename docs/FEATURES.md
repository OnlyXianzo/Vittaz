# Features and expected behaviour

This document describes the intended v1 user-facing capabilities. It does not imply that every feature has been implemented.

## 1. Manual transaction entry

Users must be able to record a transaction without AI.

A transaction can represent money received or spent, and should be associated with an account. Where relevant, it can include a counterparty, category, note, timestamp, and source.

Manual entries are considered user-confirmed when saved.

## 2. Accounts and balances

The initial account types are cash and UPI or bank accounts. Cash in hand is represented by the balance of the Cash account.

Balances must be derived from the opening balance and recorded movements. Transfers between accounts must not be counted as income or expense.

## 3. Receivables and payables

Vittaz is intended to track money the user has lent and money the user owes. These balances should remain distinguishable from ordinary income and expenses.

The exact accounting treatment for partial repayments, settlement, and write-offs must be specified and tested before implementation.

## 4. Ledger

The ledger presents recorded transactions with useful filters such as date, account, category, counterparty, direction, and status.

The ledger must distinguish confirmed entries from unverified or AI-checked entries.

## 5. AI-assisted entry

Users may describe a transaction in natural language. An AI provider can interpret the input and prepare a structured proposal.

A proposal does not change account balances or create a confirmed transaction. It enters a review queue and must be explicitly approved or rejected by the user.

If parsing is uncertain, the application should preserve that uncertainty and ask the user to correct the proposal rather than invent missing values.

## 6. Review queue

The review queue displays pending proposals and unverified entries. Users can inspect, edit, approve, or reject them.

Approval must be idempotent: repeated approval attempts must not create duplicate transactions. Rejection must not create a financial transaction.

## 7. AI questions and summaries

Cloud or local models may help answer questions about the ledger. Structured queries and calculations should be performed by deterministic application logic, not estimated by a language model.

The model should receive only the minimum information required to formulate an answer. The application must not give the model unrestricted write access.

## 8. Notification-based entry

The proposed Android notification integration is limited to user-approved source applications. It should:

- Apply privacy and sensitive-content checks before parsing.
- Reject promotional and irrelevant notifications.
- Parse supported debit and credit formats.
- Keep unknown formats local for review or local parsing.
- Discard raw notification content when it is no longer needed.
- Create an unverified entry rather than a confirmed transaction.
- Deduplicate bank and payment-app alerts for the same payment.

Notification access is a sensitive Android permission. It must be optional, clearly explained, and tested on real devices. Availability and platform restrictions should be reviewed before distribution.

## 9. Spreadsheet import

Spreadsheet import should support a dry-run preview, clear row-level errors, and idempotent re-import. Imported rows must not silently become confirmed if the import source or mapping is uncertain.

Only synthetic spreadsheets should be used in repository tests and examples.

## 10. Backup, export, import and undo

Users should be able to create a local backup and export a ledger for manual transfer to another device.

Restore and import operations must validate the file before changing the active database. The application should warn users that exported ledgers can contain sensitive financial information.

Undo should reverse an approved change through a recorded audit mechanism. It must not erase the historical fact that the original change occurred.

Backup encryption and key recovery remain design decisions to resolve before backups are treated as secure against access to copied files.

## 11. Telegram

Telegram is an optional channel to the same assistant. It has no AI, memory or finance logic of its own. The user creates a bot with BotFather and enters its token in Vittaz. Vittaz shows a one-time pairing code, and the user sends it to the bot. That pairs the user's chat. See [Telegram](TELEGRAM.md).

Messages from any chat other than the paired one are ignored. Tokens are stored in platform secure storage. Telegram messages join the same conversation history as app and CLI messages, tagged with their source. Only one device polls a given bot token at a time.

Telegram works only while a Vittaz process (the app or the CLI) is running. Alerts while everything is closed are not promised.

## 12. Voice and OCR

Voice transcription and OCR are later input methods. Their output must enter the same validation and proposal workflow as typed input. Neither may directly commit a transaction.

Hindi and Hinglish transcription quality must be evaluated on representative, synthetic test samples before promising reliable support.

## 13. Conversation history

The app chat, the CLI and Telegram share one conversation history, stored locally. Each message records its source (`app`, `cli` or `telegram`). The user can open a conversation started on Telegram from the app and continue it.

## 14. Assistant personalization

Users can set tone, language and level of detail, and add simple custom rules. Rules that can be checked by code (for example, accepting messages only from the paired chat) are enforced in code, not left to the model. There is no automatic long-term memory in v1. See [Assistant](ASSISTANT.md).

## 15. Future connectors

Gmail, WhatsApp and Discord are not part of v1. Each would be added later as a connector, with its own permissions and tests. See [Connectors](CONNECTORS.md).
