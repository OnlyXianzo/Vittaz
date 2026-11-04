# Architecture

## Architectural direction

Vittaz is an Android-first, local-first application with a TypeScript codebase. The architecture separates financial rules from persistence, platform APIs, user interfaces, and AI providers.

The guiding rule is that the core financial domain must not depend on Expo, SQLite drivers, React Native, a command-line framework, or an AI orchestration library.

## Recommended repository shape

```text
apps/
  mobile/          # Expo / React Native Android application
  cli/             # Node-based command-line application
packages/
  core/            # Domain types, money rules, use cases and ports
  storage/         # SQLite schema, migrations and persistence adapters
  agent/           # AssistantService implementation, providers, tool registry
  connectors/
    telegram/      # Telegram channel connector
docs/
```

This is a target structure, not a requirement to create every package before it is needed.

## Main boundaries

### `packages/core`

Contains deterministic business logic and application use cases:

- Money parsing and arithmetic.
- Transaction and account rules.
- Approval workflow.
- Balance and allowance calculations.
- Audit and undo semantics.
- Interfaces (ports) for repositories, clock, backup, and other external capabilities.

It must not import React Native, Expo, SQLite driver packages, Drizzle, LangChain, LangGraph, or the Vercel AI SDK.

### `packages/storage`

Owns the SQLite schema, migrations, and persistence implementations. It implements the asynchronous repository interfaces defined by the core.

Platform-specific database connections are created at the application boundary and passed into the storage adapter. The core does not open database files itself.

### `packages/agent`

Contains provider-specific code, prompt construction, tool schemas, model routing, streaming, and provider error handling. It calls application use cases through a restricted tool interface.

The agent package must not receive unrestricted database access. Its transaction-writing capability is limited to creating a pending proposal.

### `apps/mobile`

The primary user-facing Android application. It owns navigation, screens, Android permissions, secure device storage, notification-listener integration, and mobile-specific adapters.

### `apps/cli`

A Node-based command-line interface for development, testing, imports, and headless use. Bun support can be evaluated later, after checking driver compatibility. It uses the same core use cases and data contracts as the mobile app.

## Database recommendation

**Use SQLite as the local database, Drizzle ORM as the typed SQL layer, and an asynchronous repository boundary between the domain and database.**

This is the recommended direction for Vittaz because the primary platform is Expo/React Native while the CLI runs under Node. Expo SQLite and Drizzle have a documented integration, and Drizzle also supports SQLite through Node-side drivers such as `better-sqlite3`. This allows the application to retain SQLite as its storage format without forcing the domain layer to depend on a particular driver.

### Recommended arrangement

| Context        | Database connection                                                       |
| -------------- | ------------------------------------------------------------------------- |
| Android app    | `expo-sqlite` with Drizzle's Expo SQLite driver                           |
| CLI (Node)     | `better-sqlite3` with Drizzle's better-sqlite3 driver                     |
| Future desktop | A separately selected SQLite adapter behind the same repository contracts |

Use the same logical schema and migration history across supported adapters. Verify migration compatibility and query behaviour against every adapter in automated tests.

### Why not a synchronous `Db` interface?

The earlier build plan proposed a small synchronous database interface. That is a poor shared boundary for this product: Expo's recommended application APIs are asynchronous, and synchronous database work can block the JavaScript thread. A synchronous interface would either force awkward adaptation on mobile or leak driver details into the core.

Instead:

- Define asynchronous repository methods in `packages/core`.
- Keep transactions explicit in the persistence/application boundary.
- Use Drizzle and SQLite only inside the storage implementation.
- Do not expose a raw database connection to domain logic or AI tools.
- Avoid designing a generic database framework; implement only the operations Vittaz needs.

The CLI adapter may use a synchronous native driver internally, but it should satisfy the same asynchronous repository contract. Do not make the rest of the application synchronous to match one driver.

### Why SQLite rather than a server database?

Vittaz is designed around one local ledger per device, offline use, and explicit file-based transfer. SQLite fits that model without requiring a server process or network connection. A server database would add operational complexity without serving a current v1 requirement.

This does not mean the database file should be treated as automatically encrypted. Device sandboxing, secret storage, backup protection, and any future database encryption need separate security decisions.

## Data flow

```text
User input
   |
   v
Mobile UI / CLI
   |
   v
Core use cases <------ Agent tools (restricted)
   |
   v
Async repository interfaces
   |
   v
Storage adapters
   |
   v
Local SQLite database
```

For AI-assisted input, parsing produces a validated proposal. The proposal is shown to the user. Only a user approval action invokes the use case that commits a transaction and records the audit event.

## Database and migration strategy

- Keep schema definitions and migration files under version control.
- Use forward-only, versioned migrations.
- Test migrations from an empty database and from supported prior versions.
- Make migration execution safe to detect and report failures; do not silently continue with a partially migrated database.
- Test backup and restore against real database fixtures.
- Use parameterized SQL for all user-provided values.
- Enable and verify SQLite foreign-key enforcement.
- Use transactions for multi-row financial changes and audit writes.

## AI framework boundary

The core must remain independent of the AI framework. LangChain, LangGraph, the Vercel AI SDK, or direct provider clients may be evaluated in the agent package. Choose based on a small proof of concept that verifies React Native compatibility, tool calling, streaming, cancellation, and error handling.

Do not select an orchestration framework merely because it is popular. The application should be able to replace it without rewriting financial logic.

## Platform and runtime compatibility

Node, Bun, and React Native are different runtimes. Shared TypeScript does not automatically imply shared runtime compatibility. Packages imported by the mobile app must avoid Node-only built-ins, native modules that Metro cannot resolve, and server-only dependencies.

Keep platform-specific integrations behind package boundaries and run a real Expo Android build early, rather than relying only on Node-based unit tests.

## Assistant service and tool registry

`packages/core` defines an `AssistantService` port. `packages/agent` implements it. The Android chat screen, the CLI and the Telegram connector all call that one service. Nothing else talks to a model.

Tools are plain TypeScript functions registered with the agent, using `snake_case` names. They call core use cases, never the database directly. The application decides which tools exist for a request. The model only chooses among the tools it is given. See [Assistant](ASSISTANT.md) for the tool list and [Agent policy](AGENT_POLICY.md) for permissions.

## Connectors

A connector links Vittaz to an outside channel or service. Telegram is the only connector in v1. Connectors depend on the `AssistantService` port and on nothing else in the finance code. The financial core never imports a connector. See [Connectors](CONNECTORS.md).

## MCP position

Vittaz does not need an MCP server or an MCP client for its own assistant. The assistant uses native tools. MCP is deferred. Two later options, both optional: a Vittaz MCP server that exposes the same read and propose tools to external agents, and an MCP client that lets Vittaz use third-party tools. Neither changes the core.

## Build order

1. Backend and CLI first: core, storage, privacy, ingestion, assistant, Telegram connector, all tested without a UI.
2. Then wire the existing HTML screens to the working backend in vertical slices: manual entry, ledger and review first, then the assistant chat, then Telegram settings, then the rest.
3. Animation and polish last, once real loading, empty and error states exist.

The HTML screens are the visual specification. Reuse their layout, styling and assets. Do not animate static mockups before the real states exist.

## References

- [Expo SQLite documentation](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Drizzle ORM: Expo SQLite](https://orm.drizzle.team/docs/sqlite/connect-expo-sqlite)
- [Drizzle ORM: SQLite drivers](https://orm.drizzle.team/docs/get-started-sqlite)

Library versions should be checked against the Expo SDK and runtime versions selected for the implementation. The recommendations here are architectural, not a lockfile.
