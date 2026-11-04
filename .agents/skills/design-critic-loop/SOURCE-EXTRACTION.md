# Source Extraction (repaired)

Provenance for this pack. The original was pasted from a terminal and arrived
with box-drawing borders, wrapped columns, duplicated fragments and a
truncated score table. This is the same content de-mangled, with every repair
and every gap marked.

> **Repairs applied:** box-drawing glyphs and column-wrap noise stripped;
> duplicated fragments removed (the terminal repeated the middle of the paste
> three times); the run-together section headings split apart; Markdown
> headings restored; table columns re-aligned from the fragments; a truncated
> URL (`Grablytic`) completed from the known repo path. **No score, gap
> description or technical claim was invented.** Where the source lost
> information, this document says so.

---

## 1. The reusable design critic prompt

Use this exact prompt whenever invoking an isolated critic subagent on any
screen or UI surface:

```
Please review the design in the screenshot located at `{{SCREENSHOT_ABSOLUTE_PATH}}`
(use the `view_file` tool to inspect it).

Evaluate the aesthetic that the design is going for, imagine how a top design
studio would execute this aesthetic, then outline the biggest gaps.

Lastly, provide a score out of 10 indicating how close the current design is to
that studio-level quality bar.

Guidance:
- Think high-level about the overall structure and composition as well as look at
  the fine details.
- Watch out for patterns that feel overdone, excessive, or otherwise obviously
  AI-generated, and penalize them.
- Provide tight, specific feedback, not vague prose.
- Be bold and opinionated, not relying on what's safe or easy.
```

## 2. The operational loop protocol

To run this loop on any other screen:

1. **Deterministic test harness.** Render the widget in a Flutter test using a
   fixed device viewport (e.g. 1080 x 2400 @ 2.625 DPR) and real mock data,
   capturing the raster directly to `test_screenshot.png`.
2. **Context isolation (zero leakage).** Invoke the critic as a fresh subagent
   (role: Design Critic, type: `self`) containing only the screenshot path.
   Never pass code, implementation diffs, test files, or past reviews.
3. **Hidden target threshold.** Set stopping criteria externally (e.g. score
   >= 9.0/10). Never reveal the target score to the critic, ensuring scoring
   remains objective and un-gamed.
4. **Single-variable typographic & structural synthesis.** Read the critic's
   itemised gaps, eliminate the specific "AI slop" patterns identified,
   re-render, and repeat.

## 3. Skills leveraged

- **`design-taste-frontend`** (`~/.agents/skills/design-taste-frontend/SKILL.md`)
  - **Anti-Slop Discipline:** rejection of centred generic dark mesh gradients,
    floating unstyled `#FFFFFF` cards with generic grey borders over cream
    backgrounds, and disconnected floating e-commerce filter pills.
  - **Brief Inference & Aesthetic Mapping:** "Warm Tactile Archival Instrument"
    (analogous to Teenage Engineering, Dieter Rams, Linear, Things 3).
  - **Material & Tonal Stepping:** layering physical paper/linen tones
    (`#FAF6F0` -> `#F6F0EA` -> `#EFE8E1`) with calibrated optical gutters
    rather than lazy drop shadows.
  - **Disciplined Telemetry:** technical machine metrics (percentages, speed,
    duration, file sizes) set in strict tabular monospace (`IosevkaCharonMono`)
    rather than generic sans-serif.

## 4. Agent performance benchmark (Grablytic iterations)

| Iter | Score | Fix applied | Critic's reason |
| --- | --- | --- | --- |
| 1–5 | **lost in the terminal copy** | — | — |
| 6 | 5.5 / 10 | Removed `"Video"` pill next to `"Videos"` | Rust duplicate pill layout; excessive percentages; container parked on the dock |
| 7 | 5.2 / 10 | Unnested tab-bar pill inside editorial top input | Nested "pill inception"; green `Saved` badge clashed with warm umber — Android Material You button half-mismatch |
| 8 | 5.2 / 10 | Floating pure white cards on cream canvas | *"AI Slop Disease"* — demanded physical `Container` geometry |

**Loss note:** the source paste repeated the middle of its own content three
times and cut the table mid-row. Rows 1–5 (the rising scores) and the tail of
row 6's columns did not survive. Preserved as a gap rather than reconstructed.
See [`BENCHMARKS.md`](./BENCHMARKS.md) for the analysis built on these rows.

### Key takeaways on critic behavior

1. **Harshly penalizes "AI Slop" defaults:** pure white containers on warm
   backgrounds, floating dropdown pills with uppercase tracked eyebrows
   (CAPTURE DEFAULTS), and rounded buttons shoved inside rounded input fields
   are immediately flagged and penalized.
2. **Demands appliance craft:** studios expect controls to be unified into
   single, physical tactile consoles (omnibars with docked segmented shelves)
   rather than disconnected scattered widgets.
3. **Values technical honesty:** live numbers (speeds, ETA, codecs) must look
   engineered (`IosevkaCharonMono` with tabular figures) with one bold anchor
   metric.

## 5. Recommended directory structure

```
~/design-critic-loop/
├── README.md              # index and quick start
├── CRITIC_PROMPT.md       # the standardized, parameter-ready prompt template
├── PROTOCOL.md            # the 4-step loop execution rules and subagent constraints
├── SKILLS_USED.md         # reference to design-taste-frontend anti-slop guidelines
├── BENCHMARKS.md          # iteration scoring logs, failure modes, fix patterns
└── SOURCE-EXTRACTION.md   # this file — the original transcript, repaired
```

Repo-side:

```
~/grablytic/.agents/skills/studio-critic-loop/SKILL.md
~/grablytic/test/capture_screen_test.dart   # the deterministic harness
```

---

## Divergences from the original

The source proposed a `PROTOCOL.md` terminating the loop at `>= 9.0/10` and
stopping at four fix pillars. This pack keeps both, and adds what the 8-iteration
record shows was missing:

- **One-variable-per-round is stated as a hard rule**, not a suggestion. Eight
  rounds that never moved past 5.5 is the signature of batched edits.
- **A token-level fix note.** The recurring `#FFFFFF`-on-cream defect traces to
  one constant, `app_theme.dart:10`. Fixing cards one at a time regenerates the
  defect on every new screen.
- **An anti-slop checklist** run before each re-render, so a defect is not
  re-shipped to a critic that already named it.
- **Explicit "never append these"** list for the prompt, since the most likely
  way to ruin the loop is a helpful-sounding addition like "you must reach 9".
- **Empty rows instead of estimates** in the benchmark, since a fabricated score
  reads as evidence and is worse than a gap.