# Vittaz — React Native app (Expo)

## Overview

The screens of the browser preview rebuilt as a real Expo / React Native app, which is the direction `docs/ARCHITECTURE.md` assumes for `apps/mobile`. Serves as the primary client application package (`@vittaz/mobile`).

## Subdirectories & Boundaries

- [src](./src/README.md) - Native Expo application source code, UI primitives, state provider, and core bridges.
- [ui](./ui/README.md) - Isolated browser preview prototype and visual specification.

## What is shared, what is rebuilt

| Layer                                                  | Where                                                  | Status                                             |
| ------------------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------- |
| Reducer, actions, screen state                         | `apps/mobile/ui/src/state.ts`                          | **shared, imported**                               |
| Selectors, synthetic ledger, money, question answering | `apps/mobile/ui/src/{selectors,data,money,answers}.ts` | **shared, imported**                               |
| View layer, navigation chrome, gestures, safe areas    | `native/src/**`                                        | rebuilt in React Native                            |
| Desktop "preview controls" side panel                  | —                                                      | not ported; it is a browser affordance, not app UI |

`src/domain.ts` is the only bridge: it re-exports the preview's modules. Metro reaches them through `watchFolders` in `metro.config.cjs`, Jest through `roots` in `jest.config.cjs`. There is no second copy of the logic to keep in sync, so the chat answers, approval rules and totals behave exactly as they do in the preview.

## Screens

Home · Pending inbox · Review transaction · Ledger · People · Settings · Add transaction · Add or ask (message entry) · Assistant chat · Choose model · Onboarding (welcome / how it works / pick your AI) — 13 screens, same flow:

```
Home → "Add or ask by message" → message → Analyze → chat
                                              ├─ question → answer (no amount needed)
                                              └─ payment  → draft → Approve / Edit / Reject
```

Bottom navigation (Home, Inbox, Ledger, People, Settings) is unchanged, and the Android hardware back button dispatches the same `back` action as the on-screen Back control.

## Native Specifics

- **Safe areas** via `react-native-safe-area-context`; the floating nav bar and toast sit above the home indicator.
- **Keyboard**: the chat composer is inside a `KeyboardAvoidingView`, so it rises with the keyboard instead of being covered by it.
- **Gradients**: `expo-linear-gradient` for the hero cards, the CTA and the user chat bubbles. CSS radial gradients have no RN equivalent, so the screen backdrop is a linear approximation and the onboarding blobs are drifting `Animated` circles that stop when Reduce Motion is on.
- **Icons**: `@expo/vector-icons` (Feather, the family lucide forked from, plus Ionicons for `sparkles`). No extra native icon dependency.
- **Type**: Plus Jakarta Sans through `@expo-google-fonts/plus-jakarta-sans`, matching the preview. The app renders immediately with the system font and swaps when the fonts load.
- **Accessibility**: roles and labels on every control (`tab`, `switch`, `radio`, `header`, `button`), 44pt touch targets, live-region toast.

## Running it

```bash
npm ci
npm run android      # or: npm run ios
npm run web          # Expo web (react-native-web), useful for review
npm run dev          # web on 0.0.0.0:8081 for a container preview
```

## Checks

```bash
npm run lint
npm run format:check
npm run typecheck
npm test             # Jest + @testing-library/react-native
npm run test:coverage
```

The Jest suite covers the native shell with a deterministic in-memory `LedgerStore` double. The root Vitest suite runs the **same framework-neutral `LedgerStore` contract cases** against both the Node SQLite store and the Expo adapter, backed by a real SQLite engine. The manual APK workflow also bundles `packages/core` into the native artifact.

## Honest Limits

- Ledger rows are stored in local `expo-sqlite`; schema SQL is shared with `packages/storage`. Manual entry, proposal approval and rejection use `packages/core` use cases.
- The native preview reducer and its seeded demo rows have been removed. The assistant and quick-capture actions are explicitly not connected; they do not create synthetic answers or proposals.
- People records and preferences are not yet persisted, and the current native UI is not a full rewrite of the web preview's state model.
- No new device behavior is claimed for S35. S33's owner-reported open applies only to the earlier APK; the post-promotion/S35 APK must be installed and reported separately before claiming device behavior.
- Local `npm audit --audit-level=moderate` reports 33 issues (1 low, 32 moderate) in this SDK 58/Jest 30 toolchain. `npm audit fix --force` recommends downgrading Expo to SDK 53 and Jest to 29, which would break the pinned app baseline; no forced downgrade was applied. The app audit is reported separately from the root backend's clean audit.
- `apps/mobile` is a standalone Expo project with its own lockfile. `npm ci`, typecheck, lint, formatting, Jest and Android bundle export are run by the Native app workflow. Expo web export includes SQLite WASM support and the Metro dev server sets the COEP/COOP headers required by Expo; static hosts must set those headers too. The browser preview remains the separate Vite app at `ui/`.
