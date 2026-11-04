# Execution Protocol

The rules that make the loop measure anything. Each rule exists to block a
specific failure mode of self-graded design work.

---

## 1. Deterministic test harness

Render the widget in a Flutter test at a **fixed** device viewport with **real**
mock data, capturing the raster directly.

```dart
tester.view.physicalSize = const Size(1080, 2400);
tester.view.devicePixelRatio = 2.625;
addTearDown(() {
  tester.view.resetPhysicalSize();
  tester.view.resetDevicePixelRatio();
});
```

Then capture the raster off a `RepaintBoundary`:

```dart
await tester.runAsync(() async {
  final boundary = key.currentContext!.findRenderObject() as RenderRepaintBoundary;
  final image = await boundary.toImage(pixelRatio: 1.0);
  final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
  if (byteData != null) {
    File('test_screenshot.png').writeAsBytesSync(
      byteData.buffer.asUint8List(),
    );
  }
});
```

Non-negotiable harness conditions:

- **Fixed viewport.** A changed viewport makes scores incomparable.
- **Fixed mock data.** Realistic content exposes defects that lorem ipsum
  hides — long titles, three-digit percentages, missing metadata.
- **Fonts loaded from `assets/fonts/`.** An unloaded-font raster is tofu; the
  critic will confidently critique the wrong thing.
- **Inspect the PNG yourself once** before the first critique. Blank, clipped or
  overflowing output means the harness is broken, not the design.

Reference implementation: `~/grablytic/test/capture_screen_test.dart`.

## 2. Context isolation (zero leakage)

Invoke the critic as a fresh subagent whose entire input is the screenshot
path. Never pass source code, implementation diffs, test output, design intent,
or prior reviews.

This is the load-bearing rule. A critic that can see the diff will find reasons
the diff is fine.

## 3. Hidden target threshold

Set the stopping criterion **externally** — currently **score >= 9.0/10**.
Record it in this file. Never reveal it to the critic, in any round.

Reveal the threshold and the critic optimises for it: it invents deficits to
justify a 9, or waves through a 7 because the target was 9. Either way the
number stops describing the design.

## 4. Single-variable synthesis

Read the critic's itemised gaps. Take **the single highest-severity gap**.
Fix only that. Re-render. Re-critique.

Batching edits is the loop's most common self-sabotage: the next score moves,
you assume the edits helped, and the loop decays into unmeasurable vibes. One
variable per round keeps every score attributable.

## 5. The four studio pillars

Apply these as the fix vocabulary. They are the levers with real leverage.

1. **Tonal paper stepping instead of pure-white cards.** Surfaces step through
   a warm family; depth comes from the step and an optical gutter, not a lazy
   drop shadow or a grey border.
2. **Appliance-grade docked console instead of loose filter pills.** Controls
   unify into one physical, tactile console (an omnibar with a docked
   segmented shelf), never scattered widgets.
3. **Rich media provenance.** Source badges, duration stamps, codec and size —
   the evidence that makes a row credible.
4. **Strict IosevkaCharonMono telemetry with tabular figures.** One bold
   anchor number per card. Never a sans-serif number, never two competing
   percentages.

## 6. Termination

Terminate only when an independent subagent evaluates the current render at
**>= 9.0/10**.

If you stop early — budget, scope, diminishing returns — say so explicitly and
record the final score. A silent stop is indistinguishable from a pass.

## 7. Anti-patterns

| Anti-pattern | Why it destroys the loop |
| --- | --- |
| Reusing one critic across rounds | Context carries over; the critic defends its earlier verdicts |
| Telling the critic the target | Score becomes target-chasing, not measurement |
| Passing the diff "for context" | Rationalisation, not critique |
| Batching several fixes per round | Score deltas become unattributable |
| Changing the viewport mid-loop | Two different screens, one fake trendline |
| Skipping the re-render after a fix | Scoring a raster the critic never saw |
| Accepting "looks better" as a stop | The author is the party this loop exists to distrust |

## 8. Logging

Append one row per round to [`BENCHMARKS.md`](./BENCHMARKS.md):

```
| Iter N | X.X / 10 | <the one gap that was fixed> | <the critic's stated reason> |
```

A round with no score is a round that did not happen. Do not backfill.