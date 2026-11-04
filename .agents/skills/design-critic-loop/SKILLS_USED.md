# Skills Used

Skills the loop leans on, what each contributes, and the order they matter in.

---

## 1. `design-taste-frontend` — primary engine

**Location:** `~/.agents/skills/design-taste-frontend/SKILL.md`
(v1 preserved at `~/.agents/skills/design-taste-frontend-v1/SKILL.md`)

The anti-slop discipline that decides *what counts as a defect*. Four
contributions, in order of how often they fire:

### Anti-Slop Discipline

Rejects, by name:

- Centred generic dark mesh gradients.
- Floating unstyled `#FFFFFF` cards with generic grey borders on cream
  backgrounds.
- Disconnected floating e-commerce filter pills.
- Uppercase tracked eyebrows paired with dropdown pills (the CAPTURE_DEFAULTS
  look).
- Rounded buttons shoved inside rounded input fields.
- Radial blobs as decoration.

### Brief Inference & Aesthetic Mapping

Names the target before any code is written. For the Grablytic surfaces the
mapped brief was **"Warm Tactile Archival Instrument"** — the Teenage
Engineering / Dieter Rams / Linear / Things 3 register. Without a named brief the
critic has nothing to hold the design against, and "top design studio" becomes
an empty phrase that any model satisfies differently.

### Material & Tonal Stepping

Layers physical paper and linen tones rather than dropping shadows:

```
#FAF6F0  ->  #F6F0EA  ->  #EFE8E1
```

with calibrated optical gutters. This is the direct counter to pillar 8.1 of the
protocol, and in this repo it maps onto the existing warm ramp in
`lib/core/theme/app_theme.dart` (`0xFFfdf9f6` -> `0xFFf7f3f0` -> `0xFFF1edea`),
whose `lightSurfaceContainerLowest = Color(0xFFffffff)` at line 10 is precisely
the failure the critic keeps flagging.

### Disciplined Telemetry

Technical machine metrics — percentages, speed, duration, file sizes — set in
strict tabular monospace (`IosevkaCharonMono`) with one bold anchor metric per
card, never generic sans-serif. Grablytic already bundles the family in
`assets/fonts/` and uses it in `lib/core/theme/text_styles.dart` and
`home_screen.dart`.

---

## 2. `make-interfaces-feel-better` — detail pass

**Location:** `~/.agents/skills/make-interfaces-feel-better/SKILL.md`

Covers the micro-layer the macro brief does not: hover/focus/active states,
border-radius consistency, optical alignment, font smoothing, tabular numerals,
icon stroke weight, enter/exit animation, motion restraint. Run it *after* a
round scores structurally clean. Without it, a 9.0-blocking round of small
mismatches is indistinguishable from a plateau.

## 3. `web-design-guidelines` — compliance floor

**Location:** `~/.agents/skills/web-design-guidelines/SKILL.md`

Covers accessibility, keyboard/tap-target behaviour, form states, i18n, edge
cases. Use it to close out the loop once the aesthetic score is met, so the
finished screen is not merely handsome but usable.

## 4. `ui-ux-pro-max` — searchable reference

**Location:** `~/.agents/skills/ui-ux-pro-max/SKILL.md`

Local data: 79 styles, 192 product palettes with reasoning profiles, 74 font
pairings, 119 UX guidelines, 105 icons, 17 GSAP presets, 25 chart types,
22 stacks. Use it to *source* a concrete answer when the critic says "this
needs a stronger accent" — pick a named palette and a named pairing instead of
guessing hex values.

## 5. `impeccable` — polish and critique vocabulary

**Location:** `~/.agents/skills/impeccable/SKILL.md`

Design/review/polish/critique/audit verbs across hierarchy, information
architecture, cognitive load, accessibility, performance, responsive behaviour,
theming, motion and copy. Its audit-first-on-redesigns rule complements the
critic: audit the existing surface before proposing changes.

## 6. `full-output-enforcement` — loop integrity

**Location:** `~/.agents/skills/full-output-enforcement/SKILL.md`

Overrides default truncation, bans placeholder patterns. Matters here because a
critique truncated mid-item, or a fix implemented as `// ... rest of the
component`, silently invalidates a round. Abbreviated output in this loop is
corrupt data.

## 7. Repo skills (Grablytic only)

- **`verified-implementation`** — the loop changes real product code. Design
  polish is not an exemption from "prove it locally": run `flutter analyze`
  and `flutter test` before declaring a round done.
- **`diagnosing-bugs`** — if a round surfaces an actual defect (overflow,
  exception, wrong value), route it here instead of styling around it.
- **`code-review`** — before merging accumulated loop edits.
- **`writing-for-agents`** — this skill file and the loop documents are agent
  instructions; they must be unambiguous to obey.

---

## Suggested composition order

```
1. name the brief          -> design-taste-frontend (Brief Inference)
2. render + critique       -> CRITIC_PROMPT.md, in isolation
3. fix the top gap         -> PROTOCOL.md pillar 1..4
4. detail pass             -> make-interfaces-feel-better
5. source real values      -> ui-ux-pro-max
6. compliance closeout     -> web-design-guidelines
7. prove it                -> verified-implementation (flutter analyze + test)
8. ship the diff           -> code-review
```