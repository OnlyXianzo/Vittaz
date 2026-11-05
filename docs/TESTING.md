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
