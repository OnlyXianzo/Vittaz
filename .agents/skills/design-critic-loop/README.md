# Studio Critic Loop

Home-directory pack for the screenshot-critique design loop. Everything the
loop needs, separated from the repo so it can be reused on **any** screen or
**any** project.

## Contents

| File | What it holds |
| --- | --- |
| [`CRITIC_PROMPT.md`](./CRITIC_PROMPT.md) | The parameterised prompt. The only thing a critic receives. |
| [`PROTOCOL.md`](./PROTOCOL.md) | Loop execution rules, isolation constraints, hidden threshold. |
| [`SKILLS_USED.md`](./SKILLS_USED.md) | The skills the loop composes with, and why each one. |
| [`BENCHMARKS.md`](./BENCHMARKS.md) | Per-round scores, failure modes, fix patterns. |
| [`SOURCE-EXTRACTION.md`](./SOURCE-EXTRACTION.md) | The original pasted transcript, de-mangled and reconciled. |

## The loop in one screen

```
1. RENDER    deterministic headless test at a FIXED viewport + FIXED mock data
             -> screen.png
2. ISOLATE   fresh subagent, input = the raster path + the prompt. Nothing else.
3. CRITIQUE  itemised gaps + one score /10
4. FIX ONE   the single highest-severity gap. Never batch.
5. REPEAT    1-4, logging each score
6. STOP      only at >= 9.0/10 from an isolated critic
```

## Repo-side entry point

```bash
cd ~/grablytic && flutter test test/capture_screen_test.dart
# writes test_screenshot.png  (1080 x 2400 @ 2.625 DPR)
```

Skill: `~/grablytic/.agents/skills/studio-critic-loop/SKILL.md` — read that for
the screen-specific version, including the four studio pillars and the
anti-slop checklist.

## Why this loop exists

An agent asked "improve this screen" will always say it improved something. The
author cannot self-grade: knowing the intent, the critic rationalises the
result. Isolating the critic to a single raster and hiding the target score is
the entire mechanism. Everything else — fixed viewport, one variable per round,
fresh subagent, no diffs — exists to keep that isolation intact.

## Applying it to another screen

1. Copy the harness: `test/capture_screen_test.dart` -> `test/capture_<screen>_test.dart`.
2. Keep the viewport, DPR, font loading and provider overrides. Swap only `home:`.
3. Append a log line to `BENCHMARKS.md` per round.
4. Stop at 9.0/10 or state plainly that you stopped early and why.

## Honest status of the benchmark

The recorded iterations come from a terminal copy that lost rows 1–5 of the
score table. What survived is preserved verbatim in `SOURCE-EXTRACTION.md`; the
gaps are marked, not invented. Re-run the loop to repopulate them. A fabricated
score would be worse than an empty cell.