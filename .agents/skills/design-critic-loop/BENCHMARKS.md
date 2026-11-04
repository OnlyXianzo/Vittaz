# Benchmarks

Agent performance against the critic prompt in [`CRITIC_PROMPT.md`](./CRITIC_PROMPT.md),
target threshold **9.0/10** (never shown to the critic).

---

## Iteration log — Grablytic home / library surfaces

| Iter | Score | Fix applied that round | Critic's stated reason |
| --- | --- | --- | --- |
| 1 | *(lost in source copy)* | — | — |
| 2 | *(lost in source copy)* | — | — |
| 3 | *(lost in source copy)* | — | — |
| 4 | *(lost in source copy)* | — | — |
| 5 | *(lost in source copy)* | — | — |
| 6 | **5.5 / 10** | Removed the `"Video"` pill sitting next to `"Videos"` | Excess duplicate percentages; a container had been parked on the dock. "Rust duplicate pill" layout. |
| 7 | **5.2 / 10** | Unnested the tab bar pill inside the editorial top input | The green `Saved` badge clashed with the warm umber system — Android Material You button half-mismatch. |
| 8 | **5.2 / 10** | Replaced floating pure-white cards on the cream canvas | Critic named it outright: *"AI Slop Disease"*. Demanded physical `Container` geometry. |

Rows 1–5 are absent because the source was pasted through a terminal copy that
truncated the table. They are left empty rather than estimated. Re-run the loop
to repopulate.

**Observed range: 5.2 – 5.5 across 8 iterations. Never reached the 9.0 gate.**
That is the real result and it is a useful one: the plateau, not the peak, is
the benchmark signal. See "Failure modes" below.

---

## Key takeaways on critic behaviour

### 1. It harshly penalises "AI slop" defaults

Immediate, unamortised deductions for:

- Pure white containers on warm backgrounds.
- Floating dropdown pills with uppercase tracked eyebrows (CAPTURE_DEFAULTS).
- Rounded buttons shoved inside rounded input fields.

These are not preferences. Each one reliably cost a full point or more.

### 2. It demands appliance craft

Studios expect controls unified into single, physical, tactile consoles —
omnibars with docked segmented shelves — rather than disconnected scattered
widgets. This is the single most expensive structural gap: a layout fix costs
more to implement than any palette change, which is why batching cosmetic edits
before it guarantees a wasted round.

### 3. It values technical honesty

Live numbers (speeds, ETA, codecs) must look engineered — `IosevkaCharonMono`
with tabular figures and one bold anchor metric — and must be numbers the app
can actually produce. Invented percentages are treated as a correctness bug, not
a styling bug.

---

## Failure modes

| Symptom | Real cause | Response |
| --- | --- | --- |
| Plateau at ~5.2–5.5 | Cosmetic churn masking an unresolved structural or colour-token defect | Stop restyling. Re-read the four pillars; change structure, not surface |
| "Demands physical `Container` geometry" after wrapping in `Container`s | Added wrappers without changing the tonal step | Step the surface family; create depth from the step, not the widget |
| Green `Saved` badge reads foreign | Semantic colour outside the warm umber ramp | Derive badges from the theme ramp |
| Percentages hallucinated next to a container with no byte total | Number the app cannot produce | Delete the number. Never fabricate telemetry |
| Too many percentages per card | Every number given equal weight | One bold anchor, the rest tabular secondary |
| Long titles wrapping to 5–6 lines in a narrow column | Too many competing anchors in the row | Cut anchors before shrinking type |

### The most expensive repeated error

`#FFFFFF` cards on a cream canvas. It appeared at iteration 8 *after* seven
rounds of palette work and was named "AI Slop Disease". In
`lib/core/theme/app_theme.dart` the cause is one line:

```dart
static const lightSurfaceContainerLowest = Color(0xFFffffff);  // line 10
```

Any card drawn on `lightSurface` (`0xFFfdf9f6`) with that token is a pure-white
rectangle on cream. Fix the token, not the cards — otherwise every future
screen regenerates the defect.

---

## How to improve the number

1. **Fix the token before the widgets.** A single wrong surface token costs a
   point on every screen that uses it.
2. **Spend the first round on structure.** Control layout is the expensive gap.
   Get it right once.
3. **One variable per round.** Batched edits make the score unattributable and
   the loop unmeasurable — the likely reason this run plateaued for 8 rounds.
4. **Never show the critic the diff.** The single most likely cause of a
   critic that praises work it should have rejected.
5. **Re-render before every re-critique,** including for cosmetic changes.
6. **Expect the first three rounds to move nothing.** Structural fixes are
   invisible in a score until the composition settles.

---

## Log template

Append one row per round:

```
| Iter N | X.X / 10 | <the single gap fixed> | <critic's stated reason> |
```

No score, no row. Do not backfill from memory — an invented score is worse
than an empty cell, because it looks like evidence.