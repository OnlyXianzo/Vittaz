# Mobile Application Core

## Overview

Core application logic, React state provider, domain re-exports, design tokens, and UI primitives for the Vittaz React Native Expo mobile application. Bridges framework-free domain rules from `@vittaz/core` to the native UI layer.

## Interface

- **Application Context & State (`store.tsx`)**:
  - `AppProvider`: React context provider managing ledger state, conversation history, and transaction lifecycle.
  - `useApp`: React hook exposing application state, dispatch, ready status, and conversation helpers.
- **Platform Runtime (`ledger_runtime.ts`)**:
  - `mobileLedgerRuntime`: Platform `LedgerRuntime` implementation providing ISO timestamps and UUID generation via `expo-crypto`.
- **Markdown Renderer (`Markdown.tsx`)**:
  - `Markdown`: Component rendering lightweight markdown formatting for assistant chat responses.
  - `parse_inline`, `parse_blocks`: Block and inline tokenizers.
- **Design Tokens (`theme.ts`)**:
  - `colors`, `gradients`, `radii`, `fonts`, `space`, `FontWeight`: Design tokens matching the preview specification.
- **Selectors & Aggregations (`selectors.ts`)**:
  - `groupByDay`, `selectInbox`, `selectLedger`, `selectPending`, `selectSummary`: Pure selector functions for ledger data aggregation.
  - `Summary`: Aggregate metric shape.
- **UI Components & Primitives (`ui.tsx`)**:
  - `T`, `M`, `B`, `Row`, `Card`, `Screen`, `PageHeader`, `IconBtn`, `Button`, `Chip`, `LinkButton`, `Pill`, `Avatar`, `TxnRow`, `SettingRow`, `Toggle`, `Radio`, `Input`, `BottomNav`, `Toast`, `Sparkline`, `EmptyState`, `SectionLabel`, `NAV_SCREENS`.
- **Domain Bridges (`core.ts`, `domain.ts`)**:
  - Re-exports core financial logic, money parsing (`formatPaise`, `parseAmountToPaise`), and preview contracts.
- **Subdirectories**:
  - [assistant](./assistant/README.md) - Assistant QA loop, diagnostics, and secure key storage.
  - [screens](./screens/README.md) - React Native screen views.
  - [storage](./storage/README.md) - SQLite database store initializer.

## Invariants

- All transactional state changes must be persisted through `@vittaz/core` use cases before updating local React state.
- Presentation state (navigation, active drafts, UI filters) remains decoupled from persistent ledger tables.
- Operates strictly with non-negative integer paise representations for monetary calculations.

## Side Effects

- Reads and writes SQLite database records via `openMobileLedgerStore`.
- Accesses hardware keystore via `expo-secure-store`.
- Dispatches HTTP requests to AI providers via assistant QA loop.

## Verification

- Run: `npm test`
