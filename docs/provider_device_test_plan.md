# Provider device test plan (owner-run, S40)

Status: **not run.** This plan exists so the owner's phone can produce the one
kind of evidence no sandbox can: real Android/Hermes behaviour of the provider
path. Nothing in this file may be marked passed until the owner reports it,
with the build identified.

Why it matters: the AI SDK decision (`docs/ai_sdk_evaluation.md`) was blocked on
exactly two unverifiable things — streaming and tool calling on Hermes. The same
two gaps apply to the current transports. Until they are measured on a phone, no
provider-stack change (SDK or otherwise) can be called safe, only plausible.

## What is being tested

The four behaviours a provider stack can silently get wrong:

| #   | Behaviour         | Why a Node test is not enough                                                                                                           |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Streaming**     | Node has `TextDecoder`, `TransformStream`, Web Crypto. Hermes may not, and a missing global fails at import time, before any HTTP call. |
| 2   | **Tool calling**  | The multi-step loop depends on tool calls surviving the RN fetch/stream path intact.                                                    |
| 3   | **Cancellation**  | `AbortController` on `expo/fetch` must stop the request and map to the timeout/cancel copy, not a generic failure.                      |
| 4   | **Error mapping** | A provider failure must show a specific, safe reason — never an empty answer and never `KILO_UNKNOWN` with no cause.                    |

## Build to install

Use a **diagnostics test build** (`com.vittaz.diagnostics.test`), not the personal
app: it is the build that records the bounded stage log needed for analysis, and
it is separately installable so it cannot replace personal data. Build it with
the diagnostics APK workflow in `.github/workflows/`.

Record in every run:

- APK workflow run id and commit SHA
- phone model and Android version (the owner has not supplied these before)
- network: Wi-Fi or mobile data
- whether an optional key was blank

## Preconditions

- Synthetic data only. No real transactions, names, messages, or live keys.
- One saved provider profile pointing at a gateway you are willing to spend
  tokens on. Prefer a free/cheap tier.
- Diagnostics enabled (test build default). Do not enter real account details.

## Test 1 — baseline answer (streaming + multi-step)

1. Open Chat. Ask a question that needs the ledger, e.g. "What did I spend
   this month?" after adding one synthetic entry.
2. Expect: a visible tool step, then an answer.
3. **Record:** did text appear progressively or all at once? Any blank answer?

Pass: an answer is shown and at least one tool step ran.
Fail: empty answer, spinner that never ends, or a generic failure message.

## Test 2 — token counter

1. After Test 1, look under the answer and under the composer.
2. Expect: `<n> tokens` under the answer, and `<n> tokens this session`
   under the composer.
3. Ask a second question and confirm the session total increased.

Pass: both numbers appear and the session total only grows.
Fail: no number, `NaN`, a negative number, or a total that decreases.

Note: this only displays counts the provider reported. A provider that reports
no usage legitimately shows nothing.

## Test 3 — cancellation

1. Ask a question that takes several seconds.
2. Stop it: navigate away, or background the app mid-answer.
3. Expect: a clean stop with the cancelled/timeout copy. No crash, no stuck
   spinner on return.

Pass: the app stays usable and the message is a stop, not a failure reason.
Fail: crash, frozen UI, or a provider error where a cancel happened.

## Test 4 — error mapping

1. Break the credential deliberately: set the profile's key to a syntactically
   valid but wrong value.
2. Ask a question.
3. Expect: a **specific** failure (e.g. unauthorized), not `KILO_UNKNOWN` and not
   an empty answer.
4. Restore the correct key and confirm answering works again without a reinstall.

Pass: the failure names a cause, and recovery needs no reinstall.
Fail: `KILO_UNKNOWN`, an empty answer counted as success, or a stuck state.

## Test 5 — provider switch (multi-account)

1. In Keys, add a second profile (different base URL), activate it, ask a
   question, then switch back.
2. Expect: answers come from the active profile each time; the model picker
   lists that provider's models.

Pass: switching works without restarting the app.
Fail: the old provider keeps answering, or models from the wrong profile appear.

## Test 6 — diagnostics export (analysis material)

1. Open the diagnostics viewer (TEST ONLY build).
2. Export to Downloads via the save button (`Vittaz-Diagnostics` folder).
3. Share the JSON file for analysis.

The export must contain **stages, static reason codes, provider kind, HTTP
status, elapsed time, tool name and token counts only**. It must never contain
prompts, replies, ledger content, keys, raw URLs, provider bodies, or stack
traces. If anything sensitive appears, stop and report it as a privacy defect —
do not attach the file.

## Recording results

Add a dated row per run to `docs/device_tests.md` with: build identity, phone
model/Android version, network, each test's pass/fail, and the exact user-visible
message seen. Quote messages verbatim; do not paraphrase, and do not infer a
cause from a message alone.

## What each outcome means for the SDK question

- **All pass:** the current transports are device-verified for streaming, tool
  calling, cancellation and error mapping. That is the precondition for ever
  reconsidering a provider SDK, and it is also the proof that today's path works.
- **Any fail:** the failure is in the current stack, and fixing it here is both
  cheaper and safer than migrating to a stack whose failure modes are still
  unmeasured on this platform.
