# Mobile UI Preview Screens

## Overview

Screen view components for the isolated Vittaz mobile browser preview. Implements the 11 preview screen modules representing the views of the Khataclaw UI design specification, rendering synthetic transaction data and preview interaction controls.

## Interface

- `HomeScreen`: Main dashboard overview showing net spend, cash/receivable/payable metrics, and recent activity.
- `InboxScreen`: Pending review inbox with mode filtering (All, UPI, SMS) and batch review selection.
- `ReviewScreen`: Detail screen for reviewing, approving, and rejecting individual unverified transactions.
- `LedgerScreen`: Filterable ledger transaction list with search and day-level grouping.
- `PeopleScreen`: Contact list displaying individual payable and receivable balances.
- `SettingsScreen`: Application settings toggles (`askBeforeSaving`, `replaceNames`, `sendNotesToCloud`, digest cadence).
- `AddScreen`: Manual transaction entry draft form.
- `QuickScreen`: Natural language transaction input preview.
- `ChatScreen`: Mock conversational assistant with step-by-step thinking visualization.
- `ModelsScreen`: Local and cloud model selection view (Auto, OpenAI-compatible BYOK, Claude, Gemini).
- `OnboardingScreen`: Multi-step onboarding carousel (Welcome, How it works, Pick your AI).

## Invariants

- Operates strictly on synthetic, in-memory `AppState` and dispatches `Action` objects via `DispatchAction`.
- Never performs real ledger mutations, network requests, or persistent storage operations.
- `askBeforeSaving` cannot be disabled.
- Follows strict accessible design patterns (`aria-label`, `aria-pressed`, `role="button"`).

## Side Effects

- Emits presentation state actions to the local preview reducer.

## Verification

- Run: `npm test`
