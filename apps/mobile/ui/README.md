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
- Sensitive-value detection in the chat is a local mock of the backend privacy
  gate, not a security control.
- `askBeforeSaving` cannot be disabled in the preview.
- This package does not modify `packages/core`, `packages/storage`, the existing
  `apps/mobile` Expo stub, or the active ledger PR.

## Chat-first window

The assistant is the only main window. Everything else opens as a panel over the
chat and closes with `Back`, the backdrop or `Escape`.

- Type a message, paste anything, or attach a sample from the paperclip menu —
  all three send straight to the assistant.
- A small toolbar above the conversation opens Overview, Ledger, Inbox, People
  and Settings as panels. There is no bottom tab bar.
- The conversation is a live region (`role="log"`) and focus moves to the panel
  heading when one opens.

### Privacy guard (mock)

`src/privacy.ts` runs before the assistant reads anything. It replaces account
numbers, card numbers (Luhn-checked), IFSC, UPI IDs, phone numbers, emails,
Aadhaar/PAN shapes, OTP/PIN/CVV/password values and API or bot tokens with
placeholders such as `[account hidden]`, and the bubble shows what was hidden.
Amounts, dates and merchant names are preserved so the demo parser still works.

This is a **UI-side mock**. Real enforcement belongs to the backend privacy
layer in `packages/core`; nothing here writes to or duplicates it.

### Tool calling (mock)

`src/assistant.ts` plans a deterministic tool run for each message and the chat
renders each call with its arguments, status and result:

- `privacy_scan` always runs first, on the device
- `parse_entry` → `propose_transaction` for payments (never auto-saved)
- `query_transactions` → `sum_by_category` for questions
- `people_balances`, `check_unverified`, `app_help`
- `build_summary` → `telegram_send_message` for Telegram requests

`telegram_send_message` is a mock transport: it renders the exact message it
would send to `@vittaz_demo_bot` and states that nothing was sent. No network
request, model call or bot pairing happens in this package.

## Panels

- Overview
- Pending inbox
- Review transaction
- Ledger
- People
- Settings
- Add transaction
- Paste a message
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
