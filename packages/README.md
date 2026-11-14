# Vittaz Monorepo Packages

## Overview

Intermediate blueprint grouping all modular packages comprising the Vittaz monorepo architecture: `@vittaz/core` (domain engine), `@vittaz/agent` (AI orchestration), and `@vittaz/storage` (SQLite persistence).

## Subdirectories & Boundaries

- [core](./core/README.md) - Core domain models, ledger accounting, privacy redactor, and rules engine.
- [agent](./agent/README.md) - LLM key pool, provider client, Q&A agent loop, and assistant services.
- [storage](./storage/README.md) - SQLite persistence, Drizzle schema, database migrations, and backup engine.
