# Decisions

Record every deviation from the plan here, with a date and a reason.

| # | Decision | Status |
| --- | --- | --- |
| 1 | The app is named Vittaz. | Settled |
| 2 | Repository interfaces in core are asynchronous. This replaces the earlier synchronous `Db` interface idea, because Expo's recommended APIs are asynchronous. | Settled |
| 3 | SQLite with Drizzle behind a separate `storage` package. `better-sqlite3` for Node tests and the CLI, `expo-sqlite` on mobile. | Settled, verify against current docs |
| 4 | The CLI and CI run on Node 20 or newer in v1. Bun is evaluated later. | Settled |
| 5 | The assistant runs inside the app and CLI. One `AssistantService` serves app, CLI and Telegram. | Settled |
| 6 | Native TypeScript tools with `snake_case` names. No MCP in v1. | Settled |
| 7 | LangChain, not LangGraph, inside `packages/agent` only. Revisit after the phone check. | Settled |
| 8 | Telegram is the only connector in v1. It uses a user-supplied bot token and a pairing code. | Settled |
| 9 | Gmail, WhatsApp and Discord are deferred connectors. | Settled |
| 10 | Conversation history is shared across channels. No automatic long-term memory in v1. | Settled |
| 11 | Backend and CLI first. HTML screens are wired afterwards in vertical slices, starting with manual entry. Animation last. | Settled |
| 12 | One ledger per device, moved by export and import file. | Settled |
| 13 | Personal mode first. Merchant mode later. | Settled |
| 14 | The reference engine is read-only. Logic is ported module by module through failing tests. | Settled |

## Open

- License. Undecided. Do not add a license file until it is chosen.
- Backup encryption and key recovery.
- Whether to keep LangChain after the Android check.
- Which local model and size ships first.
- How a future Gmail connector handles OAuth without a Vittaz server.
- Whether the first assistant slice in the UI should be manual entry (current plan) or chat.
