# Roadmap

This roadmap is directional. Sequencing may change as compatibility, privacy and usability are validated. [Plan.md](../Plan.md) holds the step-by-step build plan.

## 1. Foundation

Repository, tooling, continuous integration on GitHub, and package boundaries.

**Outcome:** a reproducible project where tests run on every push.

## 2. Reliable financial core

Money, accounts, transactions, balances, receivables and payables, proposals, approval, audit history and undo, written test-first against async repository interfaces.

**Outcome:** a dependable ledger that works without AI.

## 3. Storage and recovery

SQLite persistence with Drizzle, migrations, backup, restore, export and import.

## 4. Privacy

Sensitive-word filter, name replacement, scrubbing, safe logging, and adversarial leak tests.

## 5. Input processing

Notification parsing, deduplication and spreadsheet import, tested with synthetic data.

## 6. Assistant

Provider adapters and key fallback, native tool registry, read-only questions, proposals, conversation history, preferences and rules, and the agent policy tests including prompt-injection cases.

## 7. Telegram connector

Pairing, chat lock, shared history and digests, tested headlessly with a fake Telegram API.

## 8. CLI and backend sign-off

A CLI over everything above. End-to-end flows without a UI.

**Outcome:** a working backend, proven before any screen is wired.

## 9. Android and UI

Android build and device tests. Then wire the existing HTML screens in vertical slices: manual entry, ledger and review, assistant chat, Telegram settings, remaining screens. Animation last.

## 10. Later

Voice, OCR, notification listener, local model catalog and benchmark, analytics screen, daily report, desktop, merchant mode, and further connectors (WhatsApp, Discord, Gmail). An MCP server and client are possible extensions.

## Out of scope for the initial release

Cloud synchronization, a Vittaz-operated backend, iOS, Play Store distribution, merchant GST, autonomous AI financial actions, Gmail, WhatsApp, Discord, MCP, and automatic long-term AI memory.
