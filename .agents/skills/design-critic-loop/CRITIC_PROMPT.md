# Critic Prompt

The canonical prompt for an isolated design-critic subagent. Copy it verbatim.
Substitute **only** `{{SCREENSHOT_ABSOLUTE_PATH}}`.

---

## The prompt

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

---

## Parameters

| Parameter | Meaning |
| --- | --- |
| `{{SCREENSHOT_ABSOLUTE_PATH}}` | Absolute path to the PNG raster. Never a relative path, never a directory, never an attachment reference. |

There are no other parameters. That is deliberate.

---

## Never add these

Each addition leaks intent and measurably changes the score.

| Do not append | Why it breaks the loop |
| --- | --- |
| "You must reach 9/10" | Turns measurement into target-chasing. The score stops being information. |
| "This is the home screen / it is a download manager" | Anchors the critic to a feature checklist instead of studio quality. |
| "Here is what I changed" / any diff | The critic defends the diff instead of judging the artefact. |
| "Previous round scored 5.5" | Anchoring. The critic defends its own past verdict. |
| "Be constructive / be fair / be encouraging" | Softens exactly the penalties that carry signal. |
| "Focus on the layout" | Narrows the audit; hierarchy, colour and provenance defects go unseen. |
| Any code, test output, or design intent | Same failure as the diff. |

---

## Expected output shape

```
1. <gap> — <the concrete element> — <the concrete fix>
2. ...
n. ...

Score: X.X / 10
```

Reject any critique that is not itemised and located. "The spacing feels
generic" is unusable. "The 3-tab pill row at y≈340 duplicates the 'Videos' label
in the omnibar; collapse it into the shelf" is actionable.

Reject any round that returns prose without a number. The number is the loop's
only signal.

---

## Round-to-round hygiene

- A **fresh** subagent every round. Never reuse the critic's session.
- Never show it earlier rounds, earlier scores, or the diff.
- Send the same prompt text each round. Wording drift changes the ruler.
- Re-render after every fix, even for a "cosmetic" change. Scores are only
  comparable across identical viewports.