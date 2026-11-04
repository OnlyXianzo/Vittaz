# Vittaz

**Vittaz** is a local-first personal expense and khata application. It is designed to make recording everyday money activity quick, understandable, and reliable, with optional AI assistance that never approves or saves a transaction on the user's behalf.

The initial target is Android. A command-line interface supports development and headless workflows; desktop support may follow later.

> **Project status:** Early planning. The product name is Vittaz. The software license has not yet been selected.

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
- [Build plan](Plan.md)
- [Decisions](DECISIONS.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](docs/CONTRIBUTING.md)

## License

The project license is **undecided**. Until a license is selected and a corresponding license file is added, do not assume that the source code is available for unrestricted reuse, redistribution, or commercial use.

## Project status

Vittaz is in the planning and foundation stage. The documents describe intended behaviour, not a claim that every listed feature is already implemented. Check the repository and release notes for current implementation status.
