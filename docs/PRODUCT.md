# Product overview

## Purpose

Vittaz is a local-first personal expense and khata application for an individual user. It helps the user keep a dependable record of money activity and understand their current financial position without depending on a cloud account.

AI is an optional assistant for turning natural-language input into structured proposals and answering questions about the user's ledger. It is not an autonomous bookkeeper: the user remains responsible for approving every proposed financial change.

## Intended audience

The first version is intended for the project author and a small group of friends. Distribution is expected to be through sideloaded Android builds rather than a public Play Store release.

The initial product is personal-use focused. Merchant workflows, GST support, and multi-user business operations are outside the first version.

## Core user needs

- Add an entry quickly, even when AI is unavailable.
- See a trustworthy ledger and account balances.
- Track money owed to or by other people.
- Review uncertain or automatically drafted entries before they affect balances.
- Correct mistakes and understand what changed.
- Keep financial data under the user's control and move it between devices deliberately.

## Product principles

### Manual-first, AI-assisted

Every essential workflow must work manually. AI can reduce typing and help interpret input, but it must not become a dependency for recording or reviewing money.

### Approval before mutation

AI-generated content is a proposal, not a transaction. Approval and rejection are explicit user actions. AI tools must not expose approval, rejection, restore, or undo operations.

### Local-first ownership

The active ledger belongs to one device. The initial design does not include cloud synchronization or a Vittaz-operated backend. Moving data between devices is done through an explicit export and import process.

### Financial correctness

Amounts are represented in integer paise. Calculations, balance updates, imports, reversals, and summaries must be deterministic and testable.

### One assistant, many channels

There is one Vittaz assistant. The Android app, the CLI and Telegram are ways of talking to it. They share the same tools, the same rules and the same conversation history. No channel gets its own AI, its own memory or its own access to the ledger.

### Privacy with honest boundaries

Private information should remain on the device wherever possible. Any cloud AI feature must disclose what information is sent, minimize the payload, and require user choice. Name replacement is a risk-reduction measure, not a guarantee of anonymity.

## Scope

### Initial scope

- Personal cash, receivable, and payable tracking.
- Cash, UPI, and bank accounts.
- Manual transaction entry.
- Ledger and balance views.
- Review and approval of AI proposals.
- Audit history and undo.
- Local backup and user-controlled export/import.
- Optional AI-based parsing and read-only questions.
- Shared assistant conversation history and basic personalization (tone, language, level of detail).
- Optional Telegram access to the same assistant.

### Not planned for the initial version

- Cloud synchronization.
- A Vittaz-operated backend.
- iOS.
- Public Play Store distribution.
- Merchant GST and merchant-mode workflows.
- Autonomous AI writes or approvals.
- Multi-user shared ledgers.
- Gmail and other data-source connectors.
- WhatsApp and Discord.
- An MCP server or MCP client.
- Automatic long-term AI memory.

## Success criteria

The first useful release should allow a user to add an entry manually, inspect the ledger, understand account balances, review a proposed entry, approve or reject it, and recover from an accidental change. These workflows must remain usable without an AI provider or network connection.
