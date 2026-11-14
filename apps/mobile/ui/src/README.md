# Mobile UI Preview Core

## Overview

Presentation core, components, state management, and fixtures for the isolated browser preview of the Vittaz mobile interface. Provides the in-memory reducer, selectors, synthetic seed fixtures, and design system components.

## Interface

- `App`: Main preview container embedding desktop preview controls, viewport simulator, and navigation.
- `createInitialState`: Factory initializing synthetic in-memory preview state.
- `reducer`: State reducer processing preview navigation, filters, draft edits, and mock assistant responses.
- `formatPaise`: Formats integer paise amounts to INR currency strings (`₹`).
- `parseAmountToPaise`: Converts decimal rupee user input strings into integer paise.
- `selectPending`, `selectInbox`, `selectLedger`, `selectSummary`: Query selectors computing metrics from transaction arrays.
- `groupByDay`: Groups transactions into date buckets for presentation.
- `Avatar`, `StatusPill`, `TransactionRow`, `PageHeader`, `BottomNav`, `Toast`, `IconButton`, `NotificationsButton`, `SettingRow`, `Toggle`: Presentation UI primitives.
- Subdirectories:
  - [screens](./screens/README.md) - Individual preview screen components.

## Invariants

- Currency values are strictly represented and calculated in integer paise without floating-point precision drift.
- All transactions, people, and assistant answers are synthetic fixtures.
- Preview actions never mutate persistent SQLite tables or trigger external API calls.

## Side Effects

- Dispatches state changes to React component hierarchy and renders DOM elements.

## Verification

- Run: `npm test`
