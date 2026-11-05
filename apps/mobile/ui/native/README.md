# Vittaz — React Native app (Expo)

The screens of the browser preview rebuilt as a real Expo / React Native app,
which is the direction `docs/ARCHITECTURE.md` assumes for `apps/mobile`.

**The preview is the visual spec.** Every colour, radius, spacing value and piece
of copy in `src/theme.ts`, `src/ui.tsx` and `src/screens/*` comes from
`apps/mobile/ui/src/styles.css` and the preview's screens. Nothing here redesigns
the product.

## What is shared, what is rebuilt

| Layer                                                  | Where                                                  | Status                                             |
| ------------------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------- |
| Reducer, actions, screen state                         | `apps/mobile/ui/src/state.ts`                          | **shared, imported**                               |
| Selectors, synthetic ledger, money, question answering | `apps/mobile/ui/src/{selectors,data,money,answers}.ts` | **shared, imported**                               |
| View layer, navigation chrome, gestures, safe areas    | `native/src/**`                                        | rebuilt in React Native                            |
| Desktop "preview controls" side panel                  | —                                                      | not ported; it is a browser affordance, not app UI |

`src/domain.ts` is the only bridge: it re-exports the preview's modules. Metro
reaches them through `watchFolders` in `metro.config.cjs`, Jest through `roots` in
`jest.config.cjs`. There is no second copy of the logic to keep in sync, so the
chat answers, approval rules and totals behave exactly as they do in the preview.

## Screens

Home · Pending inbox · Review transaction · Ledger · People · Settings ·
Add transaction · Add or ask (message entry) · Assistant chat · Choose model ·
Onboarding (welcome / how it works / pick your AI) — 13 screens, same flow:

```
Home → "Add or ask by message" → message → Analyze → chat
                                              ├─ question → answer (no amount needed)
                                              └─ payment  → draft → Approve / Edit / Reject
```

Bottom navigation (Home, Inbox, Ledger, People, Settings) is unchanged, and the
Android hardware back button dispatches the same `back` action as the on-screen
Back control.

## Native specifics

- **Safe areas** via `react-native-safe-area-context`; the floating nav bar and
  toast sit above the home indicator.
- **Keyboard**: the chat composer is inside a `KeyboardAvoidingView`, so it rises
  with the keyboard instead of being covered by it.
- **Gradients**: `expo-linear-gradient` for the hero cards, the CTA and the user
  chat bubbles. CSS radial gradients have no RN equivalent, so the screen
  backdrop is a linear approximation and the onboarding blobs are drifting
  `Animated` circles that stop when Reduce Motion is on.
- **Icons**: `@expo/vector-icons` (Feather, the family lucide forked from, plus
  Ionicons for `sparkles`). No extra native icon dependency.
- **Type**: Plus Jakarta Sans through `@expo-google-fonts/plus-jakarta-sans`,
  matching the preview. The app renders immediately with the system font and
  swaps when the fonts load.
- **Accessibility**: roles and labels on every control (`tab`, `switch`, `radio`,
  `header`, `button`), 44pt touch targets, live-region toast.

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

The Jest suite drives the same flows as the preview's Playwright spec: home
summary, message → approval, question answering without an amount, ledger search
and filters, inbox review, manual entry, settings toggles, model choice and the
onboarding replay.

## Honest limits

- Synthetic, in-memory data only. No backend, `packages/core`, SQLite, AI
  provider, Telegram bot or device storage is connected.
- The assistant is the preview's deterministic demo: question detection and
  ledger arithmetic, not a model call.
- No device or emulator build has been run here, so **no claim is made about
  Android/iOS runtime behaviour, G2 or G3**. What is verified is typecheck, lint,
  formatting, the Jest suite and the Expo web bundle.
- `apps/mobile` itself is still the backend agent's placeholder. This app lives
  beside the preview so the two agents do not collide; promoting it to
  `apps/mobile` (and wiring `packages/core`) is a backend-side step.
