# Vittaz mobile UI preview

Isolated browser preview of the Vittaz mobile screens, built from the supplied
`Khataclaw app UI.html` visual mock. This package is a **visual contract and
interaction prototype**, not the production Expo/React Native app and not a
backend integration.

## Boundaries

- Synthetic, in-memory data only. No real transactions, contacts, keys or device
  storage are used.
- No backend, AI provider, Telegram bot, notification listener, backup/export or
  model-download integration is connected. Buttons for those features surface
  explicit “not connected” demo toasts.
- AI actions are deterministic local demo parsing. The preview never claims that
  a model wrote to the ledger: entries remain unverified until the user approves
  them.
- `askBeforeSaving` cannot be disabled in the preview.
- This package does not modify `packages/core`, `packages/storage`, the existing
  `apps/mobile` Expo stub, or the active ledger PR.

## Screens

The preview shell exposes all 13 mock screens:

- Home
- Pending inbox
- Review transaction
- Ledger
- People
- Settings
- Add transaction
- Quick ingestion
- Chat approval / Chat thinking / Assistant
- Choose model
- Onboarding: welcome, how-it-works, pick-your-AI

The left panel is preview chrome only. On narrow viewports the device frame goes
full-bleed and the panel is hidden.

## Run

Use the repository Node version from `.node-version` (Node 24.22.2).

```bash
cd apps/mobile/ui
npm ci
npm run dev
```

The dev server binds to `0.0.0.0:5173` and accepts the Arena preview host.

## Checks

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:coverage
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

Unit/component tests use Vitest + Testing Library. E2E tests use Playwright
Chromium with a Pixel 5 viewport. Coverage thresholds are 80% for this preview
package; they do not replace the repository’s core/storage coverage gates.

## CI

`.github/workflows/ui.yml` runs only for changes under `apps/mobile/ui/**` or the
UI workflow itself. It installs this package independently and runs lint,
format, typecheck, coverage, build and Playwright.

## Visual source

The mock’s dark green/lime palette, Plus Jakarta Sans typography, card radii,
bottom navigation and screen layouts are reproduced in `src/styles.css` and the
screen components. Font files are bundled locally under `public/fonts/` with the
SIL Open Font License in `public/fonts/OFL.txt`.
