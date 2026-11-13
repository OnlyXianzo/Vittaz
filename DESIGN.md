# Vittaz — Interface Design Rules

> **Read this before you change any screen, component, icon, string or animation.**
> If a change is not described here, add it here _in the same change_ that makes it.
> A UI change without a matching entry in §9 is an incomplete change.

This file is the contract for the interface. It exists because the chat screen
drifted: navigation buttons piled up above the transcript, the model chip ate the
header, and the owner had to ask twice for it to look like the apps he already
uses. Rules written down stop that repeating.

---

## 1. Scope and order of authority

1. **This file** — terminology, structure, rules.
2. `apps/mobile/src/theme.ts` — tokens. Never hard-code a colour that exists here.
3. `apps/mobile/src/ui.tsx` — shared components. Reuse before adding.
4. Everything else.

When this file and the code disagree, **the code is the bug** unless this file is
explicitly marked `proposed`.

---

## 2. Sources consulted

Read before designing. These informed the structure; none of their code was copied.

| Source                              | What we took                                                                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Grok** sidebar (web + mobile)     | Search sits with conversation history and filters it in place; settings reached from the panel rather than a separate screen; history is a flat list, newest first                           |
| **ChatGPT** sidebar                 | `New chat` at the top of the panel; conversations listed beneath the destinations; controls pinned to the footer                                                                             |
| **Claude** sidebar                  | Compact `New chat` row instead of a large button; sticky section headings; the open conversation marked                                                                                      |
| **tlon-apps #6577** (drawer rework) | Precedent for pinning destination controls to the drawer footer and letting the chat list scroll under them                                                                                  |
| **Vercel AI Elements**              | Composables for reasoning / tool-call / message actions. **Not usable here** — requires Next.js + shadcn/ui + Tailwind, and `vercel/ai-elements#99` (Expo) is open                           |
| **assistant-ui**                    | Has a real React Native build, but expects a server `/api/chat` endpoint and owns thread state — the layer holding redaction, token budget and validated streaming. Rejected for now; see §8 |

**Rule:** take _structure and behaviour_ from these. Never take _colour, type,
corner radius or iconography_ — those belong to Vittaz.

---

## 3. Terminology

Use these words in code, tests, strings and reviews. No synonyms.

| Term                | Meaning                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| **Drawer**          | The slide-over panel behind `☰`. Not "sidebar", not "menu screen"         |
| **Recents**         | The section of the drawer listing saved conversations                      |
| **Destination**     | A row in the drawer that leads somewhere (Custom instructions, Connectors) |
| **Footer control**  | A pinned button at the drawer's bottom edge (Search, Settings)             |
| **Turn**            | One user message plus everything that followed it                          |
| **Composer**        | The input bar, mic and send button at the bottom of the screen             |
| **Suggestion chip** | A scrolling prompt shortcut above the composer                             |
| **Model chip**      | The short route pill in the header                                         |
| **Reasoning block** | The collapsible card listing the read-only lookups behind an answer        |
| **Tool tag**        | The lime monospace label naming a tool (`find_person`)                     |
| **Disclosure**      | The data-handling sentence above the composer                              |
| **Live dot**        | The lime dot marking the conversation currently open                       |

---

## 4. Chat screen structure

Fixed vertical order. Nothing may be inserted between these without updating this file.

```
┌──────────────────────────────────────┐
│ status bar (OS)                      │
│ ‹ Assistant        [Auto ▾] [☰]      │  header, one 44px row
├──────────────────────────────────────┤
│                                      │
│   transcript (scrolls)               │  turns, reasoning block, errors
│                                      │
│   ─────── disclosure ───────         │  last item inside the scroll
├──────────────────────────────────────┤
│ [chip] [chip] [chip] →               │  suggestion chips
│ ( Message …………………… 🎙  ⬆ )        │  composer
│            142 tokens this session   │  only when a provider reported usage
└──────────────────────────────────────┘
```

**The transcript owns the screen.** Navigation lives in the drawer. Anything
persistent above the transcript must justify itself — today only the header does.

### Header

- Back chevron, title `Assistant`, model chip, `☰`.
- The model chip shows a **short** route (`Auto`, `BYOK`, `Claude`, `Gemini`).
  Its **accessible name is the full route** (`Auto, Kilo Auto Free`). Never
  shorten what a screen reader hears.

### Disclosure

- Always present for the active route, always readable **without opening anything**.
- Lives at the end of the transcript, not above it.
- Wording is per-route; see `ChatScreen.tsx`. Do not generalise it into one vague sentence.

---

## 5. The drawer

```
┌──────────────────────────┐
│ Assistant             ✕  │
│ [ Search saved chats  ]  │  only while search is open
│ ✎ New chat               │
│ ⚙ Custom instructions    │
│ ⚭ Connectors             │
│ ─────────────────────    │
│ RECENTS                  │  label becomes RESULTS while searching
│ ● Synthetic owed totals 🗑│
│   Food spend        🗑   │
│ ─────────────────────    │
│ ⌕        ⚙              │  footer: Search chats · Settings
└──────────────────────────┘
```

Rules:

- **Width** 288, max `82%`. Opaque `#0a1a0d`, never translucent — glass over an opaque panel reads as a flat cutout.
- **`New chat`** is a row, not a large button. It is disabled while a reply is in flight.
- **Recents is a section of this drawer.** There is no separate "chat history" screen. Opening a past conversation must be one tap from the drawer.
- **Every recents row**: title (2-line clamp), live dot when it is the open one, and a `🗑` delete control. Tapping the row opens it; tapping `🗑` asks first.
- **Delete is never the loudest action** on a row. It is a dim icon, not a filled button.
- **Footer controls** (`Search chats`, `Settings`) are **full-width rows with an icon and a label**, `50 px` tall — the same weight as the rows above them, not small icon buttons. They are pinned to the bottom edge, below the rule, outside the scroll.
- Search toggles an input above `New chat` and **filters the same list in place** — it is not a new screen or a navigation. While open, its row label and icon take the accent colour.
- **Empty states**: `No saved chats yet. Your conversations appear here.` / `No saved chats match that search.`
- **Dismiss** by backdrop (`Dismiss menu`) or `✕` (`Close menu`).

---

### Icons

- **`lucide-react-native` is the only icon library.** No `@expo/vector-icons`
  (Feather, Ionicons), no hand-drawn SVG for standard glyphs, no emoji.
- Import the icon by name: `import { Mic, Search } from "lucide-react-native"`.
  Tree-shaken per icon; no font loading, no glyph-map keys.
- Sizes: `19–20` in chrome, `21–22` in the composer, `14–17` inline in cards.
  `strokeWidth` `2–2.2`; `2.6–3` for small confirming ticks so they stay legible.
- Colour always comes from a token. Never a Lucide default.
- Custom SVG is allowed **only** for marks that do not exist in the set — and
  prefers are drawn to Lucide's grid and stroke so they sit with it.
- Jest: Lucide ships ESM and resolves to `.mjs`, so `jest.config.cjs` maps it to
  the CJS build and allowlists it for transformation. Metro already handles
  `.mjs` under Expo SDK 58 with package exports on — verified against
  `getDefaultConfig`, not assumed.

## 6. Components and states

### Reasoning block

- Groups the read-only lookups for the current answer. Header: `N ledger lookups`, or `Reading your ledger` while running.
- **Starts expanded.** In a ledger app the lookups are the _proof behind the number_; collapsing is the owner's choice, never the default.
- One row per lookup: done tick / running ring / waiting circle, the tool tag, and a plain-language detail.
- Accessible name flips with state: `Hide 2 ledger lookups` / `Show 2 ledger lookups`, `expanded` announced.

### Message actions

- Under each assistant answer: token count (if reported) and `Copy`.
- Copy confirms **in place** — icon and label both flip to a tick and `Copied`, accessible name becomes `Answer copied`. No toast, no layout shift.

### Thinking indicators — two, with different jobs

- **Spinning ring** inside the block: _which lookup_ is running.
- **Three dots** below it: _the model_ is composing.

### Approval card — do not restyle

- The proposal card with Approve / Edit / Reject is the safety-critical surface.
- Do not change its layout, colours or copy as part of a visual refresh. A draft is pending until approved; churn next to that button is a risk, not a polish.

### Errors

- Provider failures render a card: what happened, the likely cause, one way forward (`Change model`), and a stable code (`BYOK_HTTP`).
- Copy must name the probable cause. `The selected model may not be available to your account, or the provider retired it.` — because in live testing NVIDIA listed 83 models with 16 usable, and Gemini's default id was already retired.
- Never render a provider's raw body.

---

## 7. Accessibility rules (non-negotiable)

- Every interactive element: **44×44 minimum**, 48 for drawer rows.
- Every control has a **distinct** accessible name. Two controls may not share one — when they do, rename one (this caught `Close menu` on both the backdrop and ✕, and `Search chats` on both the footer button and the field).
- Shortening visible text must not shorten the accessible name.
- `accessibilityState` reflects reality: `disabled` while a reply is in flight, `expanded` on collapsible blocks.
- Motion respects **Reduce Motion** via `AccessibilityInfo.isReduceMotionEnabled()`, as `OnboardingScreen` already does. Stopped, not merely slowed.
- Contrast: body text `#f2f7ee` on the gradient; muted `#9db39a`; `dim #6f866c` only for metadata, never for anything required.

---

## 8. Boundaries

- **No web-only UI dependencies.** AI Elements needs Next.js/shadcn/Tailwind. Anything that cannot run on Hermes is out, regardless of how good it looks.
- **No UI library that owns conversation state.** assistant-ui would move redaction, budget and validated streaming off the device. Revisit only if the safety layer is deliberately re-homed — a decision, not a refactor.
- **No new dependency** without checking it against Expo/Hermes first. `lucide-react-native` was checked first: peer `react-native-svg` range satisfied by the installed `15.16.0`, `.mjs` in Metro's `sourceExts`, package exports enabled.
- **Mockups are not evidence.** A design preview must use inline SVG — an emoji stands in for nothing and reads as a shipped icon even when it is not.
- **No provider-specific branches in the UI.** Route copy and chip labels are data (`MODEL_SHORT`, `MODEL_LABEL`), never `if (provider === ...)`.
- **Never log or display a key.** Not in a label, not in an error, not in a test snapshot.

---

## 9. Change log

Append one entry per UI change. No entry, no merge.

| Date       | Change                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-11 | Chat restructured: drawer replaces the stacked nav pills; short model chip with full accessible name; disclosure moved below the transcript; `How can I help?` empty state                                    |
| 2026-11-11 | Native primitives added: reasoning block, message actions, SVG dots and ring (Reduce Motion aware)                                                                                                            |
| 2026-11-11 | Recents moved into the drawer; separate chat-history screen removed. Footer pinned with `Search chats` (in-place filter) and `Settings`                                                                       |
| 2026-11-11 | `lucide-react-native` adopted as the only icon library; every `@expo/vector-icons` usage and the hand-drawn mic removed. Footer controls made full-width rows. Mockups must use inline SVG paths, never emoji |

---

## 10. Checklist before touching UI

- [ ] Read this file, top to bottom.
- [ ] Does the change fit an existing term in §3, or is a new one needed?
- [ ] Reuse a token from `theme.ts`; no new hex value without adding it there.
- [ ] Reuse a component from `ui.tsx`; no duplicate button/row implementations.
- [ ] Distinct accessible names for every control; 44×44 minimum.
- [ ] States covered: empty, loading, answered, error, disabled.
- [ ] Reduce Motion honoured if anything animates.
- [ ] Approval card untouched unless the change _is_ about approval.
- [ ] Tests updated for the new structure — never weakened to go green.
- [ ] §9 entry added.
- [ ] Still true: nothing is "verified" on a device until it has run on one.
