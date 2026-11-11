# Testing

All test data is synthetic. Never use real transactions, names, bank messages, keys or spreadsheets.

## Layers

| Layer | What it checks                     | Runs on             |
| ----- | ---------------------------------- | ------------------- |
| 0     | Environment                        | PC                  |
| 1     | Core logic                         | PC or cloud sandbox |
| 2     | Privacy rules (blockers)           | PC or cloud sandbox |
| 3     | Parsers and importer               | PC or cloud sandbox |
| 4     | Assistant with a fake provider     | PC or cloud sandbox |
| 5     | Telegram connector with a fake API | PC or cloud sandbox |
| 6     | Agent policy and injection         | PC or cloud sandbox |
| 7     | LangChain check in the app         | Android phone       |
| 8     | On-device behavior                 | Android phone       |
| 9     | Performance                        | Phone and PC        |

A failing layer 2 test blocks everything after it.

## Layer 1: core logic

- Money is integer paise. Floats, `NaN` and `-0` are rejected. Sums are exact.
- Migrations run from empty and from the previous version, and are safe to run twice.
- A proposal creates no transaction. Approve commits one. Reject commits none. Approving twice commits once.
- Status moves forward only. Manual entries start as `user_confirmed`.
- Every approved write has an audit row. Undo restores the previous state.
- Cash balance equals opening balance plus cash in minus cash out.
- Restore from a backup reproduces the ledger exactly.
- Allowance math matches worked examples, including month ends and a leap year.
- Every repository method is tested through the async interface.

## Layer 2: privacy

- No outbound request contains a real counterparty name, a note, a UPI reference or account digits.
- Name replacement uses exact match, handles overlapping names, and reverses correctly.
- Sensitive-word messages leave no trace in the database, logs or requests.
- Keys and tokens never appear in logs, exports or crash reports.
- Adversarial names: lowercase, Hinglish, Devanagari, nicknames, typos, names in notes. Record the limits.

## Layer 3: parsers and importer

- Notifications: allowlist, sensitive drop, promo rejection, debit and credit, masked accounts, failed and reversed payments, post time as timestamp, deduplication of SMS plus app alert, unknown formats stay local.
- Importer: dry run, idempotent re-import, benefit and tag mapping, clear per-row errors.

## Layer 4: assistant with a fake provider

- Key fallback: 400 never falls back, 401 disables the key, 429 skips it for a while, a broken stream restarts on the next key.
- A valid tool call creates a proposal. A malformed one is rejected before the database.
- The question loop stops at its step, token and time limits, and is read-only.
- Analytics rows never contain prompt or reply text.
- Conversation history is shared across sources. Preferences are applied. Custom message conditions run in code before the assistant.

## Layer 5: Telegram

Pairing code and expiry, chat lock, ignored strangers, sensitive-word drop, shared history, digest content, poller conflict handling, token redaction.

## Layer 6: agent policy

The acceptance tests in [Agent policy](AGENT_POLICY.md), including prompt injection through notifications, imported rows and tool results.

## Layer 7 and 8: phone

Blank dev build installs. LangChain bundles, makes a tool call and streams. SQLite survives a restart. Keys sit in Android Keystore. Local model downloads, verifies and benchmarks. Telegram foreground service survives screen-off. Notification listener respects the allowlist. Voice and OCR are evaluated on synthetic samples.

## Layer 9: performance

Insert 1,000 entries in a day. Load 365,000 rows and scroll a virtualized list. Month summary and unverified count stay fast with the planned indexes. Batch-approve 200 entries. Set targets after the first measurement.

## Headless manual flows (S30)

`tests/integration/headless_flows.test.ts` covers the eight reference manual
journeys through the real CLI, native SQLite storage, core use cases, and shared
assistant service with a fake local model runner:

1. Manual entry updates ledger, balance, and audit.
2. Split draft creates a pending proposal only.
3. Approve commits once and is idempotent.
4. Improve note suggests text without mutating the ledger.
5. Reject commits nothing and blocks later approval.
6. Undo restores the previous state and rejects replay.
7. Batch approve is atomic and idempotent.
8. Export/import restores the ledger and reimports spreadsheets safely.

Run with `npx vitest run tests/integration/headless_flows.test.ts`. These are
headless PC/sandbox tests, not Android device proof.

## Mutation spot checks (S31)

Six key rules are deliberately broken one at a time and must fail targeted tests:
name replacement, sensitive filter, approval, dedupe, key fallback, and read-only.
The method, mutations, commands, and failing tests are recorded in
[mutation_checks.md](mutation_checks.md). Mutations are restored before commit.

## Live tests

Tests tagged `@live` call a real keyless provider with synthetic prompts only. They never block a merge.

## Keyless opt-in smoke (S27)

Normal `npm test`/coverage excludes `*.live.test.ts` and @live. To explicitly send
three or fewer synthetic requests to the documented public Kilo gateway:

```sh
VITTAZ_RUN_KEYLESS_LIVE=1 npm run test:live
```

Without that exact opt-in the separate suite skips and makes no network request.
The manual **Keyless live smoke** workflow has no secrets, read-only permissions,
pinned actions, serialized runs and an allowed-to-fail job; it is not a required
merge check. It dynamically chooses an advertised tool-capable :free model with
explicit zero prompt/completion pricing. No key, application/ledger data, paid
fallback, retries or wording assertions. Actual S21 adapter checks response and
one synthetic tool call JSON shape; the tool is never executed. A429 skips the
remaining smoke cleanly. Public/network/schema failures fail this optional suite
with a constant message; they do not weaken normal CI. At most3 requests per
invocation,20s/request and bounded bodies (4MiB catalog/64KiB replies). This
in-process budget cannot coordinate other clients behind a shared IP; do not
repeat runs rapidly. Free public services may collect prompts. Do not put real
names, notes, identifiers, credentials or financial history in this harness.

## Layer 7: Hermes runtime requirements and the Web Crypto regression

Node, Jest (`jest-expo`) and the Expo web export all provide globals that Android Hermes
does not. That gap is what produced the S36 `KILO_UNKNOWN` failure, so provider work is
tested against explicit runtime requirements rather than against whichever globals the
test runner happens to have.

The assistant path needs these globals on device, and only these sources provide them:

| Global                                                        | Source on Expo SDK 58 / RN 0.88.1                                                            |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `crypto.getRandomValues`                                      | **not provided** — installed by `apps/mobile/src/assistant/web_crypto.ts` from `expo-crypto` |
| `crypto.subtle`                                               | **not provided** — no `SubtleCrypto` polyfill exists in this app                             |
| `TextDecoder`, `TextEncoder`                                  | Hermes (TextDecoder only from RN 0.88 / Expo 58)                                             |
| `ReadableStream`, `WritableStream`, `TransformStream`         | Hermes / Expo native web streams                                                             |
| `structuredClone`, `URL`, `DOMException`, `TextDecoderStream` | Expo winter runtime                                                                          |
| `AbortController`, `AbortSignal`                              | React Native `setUpXHR`                                                                      |
| `process` (minimal `{}` + `env`)                              | React Native `setUpGlobals`                                                                  |
| Streaming response bodies                                     | `expo/fetch`, not the default RN fetch                                                       |

`packages/agent/src/hermes_crypto_regression.test.ts` pins the two properties that any
provider change must keep:

- the transport the app actually uses (`OpenAICompatibleClient`) completes a request with
  `globalThis.crypto` removed — so a provider adapter must never reintroduce a Web Crypto
  dependency into the transport;
- if the framework layer still loses the global, the failure is a classified
  `provider_call` diagnostic rather than an unclassified crash, which is what made the
  device symptom unactionable in the first place.

A passing Node.js test is not Hermes verification. On-device verification of streaming,
tool calling and cancellation still requires an installed APK and a device run recorded in
`docs/device_tests.md`.

### The isolated AI SDK spike is not part of the test suite

`spikes/ai-sdk/` holds the throwaway harness used for the Vercel AI SDK evaluation
(`docs/ai_sdk_evaluation.md`). It is not a workspace member, is not imported by the app and
is not run by CI. It installs its own dependencies and contacts only a local synthetic
OpenAI-compatible server. Treat its results as evidence for that one document, never as a
regression gate.
