# Vittaz Blueprint

**Vittaz** is a local-first personal expense and khata application. It is designed to make recording everyday money activity quick, understandable, and reliable, with optional AI assistance that never approves or saves a transaction on the user's behalf.

The initial target is Android. A command-line interface supports development and headless workflows; desktop support may follow later.

> **Project status:** Backend steps S1–S31 are implemented and verified, including S29 full CLI, S30 headless flows, and S31 mutation spot checks; S32 completes the current documentation pass. The G3 backend checkpoint is **accepted by the owner**; S33 Android environment work is in progress and awaits owner device evidence. No Android device behavior has been verified. The product name is Vittaz. The software license has not yet been selected.

## System Overview

Vittaz is structured as a modular TypeScript monorepo operating on local-first, privacy-by-design principles:

- **`packages/core`**: Framework-free business logic implementing double-entry accounting, strict integer paise arithmetic, proposal lifecycle state machines, notification parsers, spreadsheet ingestion, and privacy redaction.
- **`packages/agent`**: Resilient AI orchestration isolating LLM provider communication (OpenAI-compatible, Anthropic, Kilo Gateway), read-only Q&A agent loops, and Telegram bot connectors. Direct ledger write access is architecturally withheld from the AI layer.
- **`packages/storage`**: SQLite persistence layer utilizing `better-sqlite3` and `drizzle-orm`, ensuring ACID transactions, versioned migrations, re-entrant serialized execution, and snapshot-based backup/restore.
- **`apps/mobile`**: Cross-platform Expo / React Native Android client application implementing the UI visual specification with local `expo-sqlite` and hardware-backed `expo-secure-store`.
- **`apps/mobile/ui`**: Standalone browser preview providing an in-memory interaction prototype and design system reference.
- **`apps/cli`**: Headless command-line utility for database operations, imports, backups, and scripted workflows emitting structured `snake_case` JSON.
- **`scripts`**: System audit and compliance utilities enforcing Layer 0 workstation readiness and Layer 2 blocking privacy gates.

## Subdirectories & System Boundaries

- [Apps](./apps/README.md) - User-facing client applications including terminal CLI (`@vittaz/cli`), Expo / React Native mobile app (`@vittaz/mobile`), and isolated web UI preview (`@vittaz/mobile-ui`).
- [Packages](./packages/README.md) - Foundational workspace libraries: framework-free core accounting (`@vittaz/core`), AI agent orchestration (`@vittaz/agent`), and SQLite storage (`@vittaz/storage`).
- [Scripts](./scripts/README.md) - Host environment auditors (`android_env.ts`) and Layer 2 non-negotiable blocking privacy verification runners (`privacy_check.ts`).

## Global Invariants

- **Deterministic Integer Currency**: Monetary amounts are strictly safe non-negative integer paise. Floating-point calculations, float drift, and negative zero (`-0`) are forbidden across all layers.
- **Human Approval Only**: The AI never writes to the database. AI tools can only propose pending drafts (`propose_transaction`). Approve, reject, and undo are strictly user-authorized actions.
- **Layer 2 Privacy Blocker**: Outbound prompts and network payloads pass through `PrivacyRedactor` and `scrubOutboundText`. Privacy test suites are non-negotiable blocking gates in CI and local checks.
- **Framework-Free Core Domain**: `@vittaz/core` contains zero UI, zero AI provider SDKs, and zero native database drivers. `@vittaz/agent` and `@vittaz/storage` depend on `@vittaz/core`, never vice-versa.
- **Unidirectional Lifecycle**: Transactions transition unidirectionally: `unverified` -> `ai_checked` -> `user_confirmed`.
- **Immutable Audit History**: Every transaction insert, update, or proposal confirmation creates an immutable snapshot row in `audit_log` with full before and after states, enabling atomic reversible undo.
- **Credential Isolation**: API keys reside strictly in environment variables or hardware-backed `expo-secure-store`; keys are never logged, exported in diagnostics, or saved in SQLite ledger tables.

## Global Side Effects

- **Local SQLite Persistence**: Mutates on-disk SQLite databases (`vittaz.db` or configured path) within ACID serialized transactions.
- **Outbound AI Communication**: Dispatches HTTPS requests to external LLM provider endpoints (OpenAI-compatible, Anthropic, Kilo Gateway) using privacy-scrubbed prompts.
- **Hardware Keystore Access**: Reads, writes, and deletes sensitive credentials via `expo-secure-store`.
- **Process and File Operations**: CLI and scripts execute child processes (`java`, `adb`, `vitest`), read spreadsheet files, and output structured JSON to `stdout`/`stderr`.

## System Verification

- Run: `npm test`
- Run: `npm run typecheck`
- Run: `npm run lint`
- Run: `npm run format:check`
- Run: `npm run test:privacy`

---

## What Vittaz aims to do

- Record cash, UPI, and bank activity without requiring AI.
- Track money spent, received, lent, borrowed, receivables, and payables.
- Review entries suggested from messages and other supported inputs.
- Keep AI-generated entries pending until the user approves them.
- Maintain an audit history and provide a way to undo mistakes.
- Keep the primary ledger on the user's device.
- Offer optional AI providers and local models with clear privacy controls.
- Export and import data so users can move their ledger between devices.

## Product principles

1. **Local-first:** the user's ledger is stored on their device. Vittaz does not require an account or a Vittaz-operated server.
2. **Human approval:** AI may prepare a proposal, but only the user can approve, reject, or undo it.
3. **Deterministic money handling:** monetary values are stored as integer paise. Financial calculations do not use floating-point arithmetic.
4. **Privacy by design:** raw financial notifications and personal notes are not sent to cloud models by default.
5. **Reversible actions:** approved changes are recorded in an audit history, and backups support recovery.
6. **Useful without AI:** users can record and manage transactions manually.
7. **One assistant, many channels:** the app, the CLI and Telegram talk to the same assistant, with the same tools, rules and conversation history.

## Planned capabilities

| Area          | Direction                                                             |
| ------------- | --------------------------------------------------------------------- |
| Ledger        | Cash, UPI and bank accounts; income, expenses, lending and borrowing  |
| Review        | A queue for unverified or AI-proposed entries                         |
| AI assistance | Natural-language entry drafting and read-only financial questions     |
| Import        | Supported notification formats and spreadsheet imports                |
| Backup        | Local backups and user-controlled export/import                       |
| Messaging     | Optional Telegram connector to the same assistant                     |
| Voice and OCR | Later input methods, subject to on-device quality and privacy testing |

Features may change as implementation and testing reveal practical constraints. See [the roadmap](docs/ROADMAP.md).

## Platform direction

- **Android:** primary application platform.
- **CLI:** a companion interface for development, testing, imports, and headless use.
- **Desktop:** a possible later application for Windows and Linux.

## CLI quick start

Use Node `24.22.2` and npm `11.19.1`.

```bash
npm ci
npm run build
node apps/cli/dist/main.js --version
node apps/cli/dist/main.js --help
node apps/cli/dist/main.js --db ./ledger.db add '{"kind":"expense","amount_paise":12345,"wallet":"cash","note":"lunch"}'
node apps/cli/dist/main.js --db ./ledger.db ledger
```

The CLI prints JSON with snake_case keys. `--db` or `VITTAZ_DB_PATH` selects the
SQLite ledger. Cloud `ask` requires `VITTAZ_AI_BASE_URL` and `VITTAZ_AI_API_KEY`;
without them it fails closed. Backups are ledger-only plaintext files written with
mode `0600`; backup encryption remains an owner decision.

## Documentation

- [Product overview](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Features and behaviour](docs/FEATURES.md)
- [Data model](docs/DATA_MODEL.md)
- [Privacy and security](docs/PRIVACY.md)
- [Assistant and personalization](docs/ASSISTANT.md)
- [Agent policy](docs/AGENT_POLICY.md)
- [Telegram connector](docs/TELEGRAM.md)
- [Connectors and MCP](docs/CONNECTORS.md)
- [Testing](docs/TESTING.md)
- [Mutation spot checks](docs/mutation_checks.md)
- [Device test checklist](docs/device_tests.md)
- [G3 backend report](docs/gates/G3_backend_report.md)
- [Build plan](Plan.md)
- [Decisions](DECISIONS.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](docs/CONTRIBUTING.md)

## License

The project license is **undecided**. Until a license is selected and a corresponding license file is added, do not assume that the source code is available for unrestricted reuse, redistribution, or commercial use.

## Project status

Vittaz has a verified backend through S31 and a completed S32 documentation pass. The native Android app lives at `apps/mobile` (promoted in S34, owner-authored visual shell unchanged). It imports `packages/core` through an `expo-sqlite` `LedgerStore`; the native demo reducer and seeded rows are removed. Manual entry and proposal review use core. Chat/quick capture remain explicitly disconnected until later slices. G3 is accepted as a backend checkpoint, not device acceptance or frontend authority. Check `STATE.md`, `Plan.md`, and the gate reports for current implementation status.
