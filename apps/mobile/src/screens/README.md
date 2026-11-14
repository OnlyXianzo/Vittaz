# Mobile Native Screens

## Overview

React Native screen components implementing the visual specification in Expo. Coordinates user interactions, presentation of ledger data, transaction drafts, proposal reviews, BYOK key setup, diagnostics, and assistant chat.

## Interface

- `HomeScreen`: Dashboard displaying net spend hero card, sparkline chart, wallet breakdown, and pending review counts.
- `InboxScreen`: Unverified proposal review inbox with filtering and batch review actions.
- `ReviewScreen`: Single-transaction review screen with split-owed adjustment and approve/reject actions.
- `LedgerScreen`: Transaction history browser with cash/UPI/unverified filtering and text search.
- `PeopleScreen`: Contact directory showing receivable and payable balances.
- `SettingsScreen`: Preference configuration, review digest frequency, and diagnostics export.
- `AddScreen`: Manual transaction capture form supporting cash and bank accounts.
- `QuickScreen`: Natural language ingestion screen.
- `ChatScreen`: Full conversational assistant interface featuring streaming answers and tool step visualization.
- `ModelsScreen`: Provider selection interface (Auto/Kilo, OpenAI-compatible BYOK, Claude BYOK).
- `KeysScreen`: Form for entering and saving provider endpoints, models, and API keys into SecureStore.
- `OnboardingScreen`: Guided first-run onboarding sequence.
- `DiagnosticsPanel`: Diagnostic event log viewer, level filter, and file export action panel.
- `InstructionsScreen`: Custom assistant instructions editor with local storage persistence and disclosure.

## Invariants

- Ledger modifications strictly invoke `@vittaz/core` functions (`createManualTransaction`, `approveProposal`, `rejectProposal`) via the application store.
- AI assistant responses never bypass user confirmation; all proposed transactions remain unverified until explicitly approved.
- All interactive controls adhere to accessible sizing guidelines (minimum 44pt touch targets).
- Back navigation dispatches unified `back` actions compatible with Android hardware buttons.

## Side Effects

- Triggers database transactions and secure credential reads/writes through `useApp()` hooks.

## Verification

- Run: `npm test`
