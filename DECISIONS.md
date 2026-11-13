# Decisions

Record every deviation from the plan here, with a date and a reason.

| #   | Decision                                                                                                                                                                                                                                                             | Status                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | The app is named Vittaz.                                                                                                                                                                                                                                             | Settled                              |
| 2   | Repository interfaces in core are asynchronous. This replaces the earlier synchronous `Db` interface idea, because Expo's recommended APIs are asynchronous.                                                                                                         | Settled                              |
| 3   | SQLite with Drizzle behind a separate `storage` package. `better-sqlite3` for Node tests and the CLI, `expo-sqlite` on mobile.                                                                                                                                       | Settled, verify against current docs |
| 4   | The CLI and CI run on Node 20 or newer in v1. Bun is evaluated later.                                                                                                                                                                                                | Settled                              |
| 5   | The assistant runs inside the app and CLI. One `AssistantService` serves app, CLI and Telegram.                                                                                                                                                                      | Settled                              |
| 6   | Native TypeScript tools with `snake_case` names. No MCP in v1.                                                                                                                                                                                                       | Settled                              |
| 7   | No third-party **agent** framework: the harness, tools, prompts and safety policy are Vittaz-owned. The provider _transport_ for OpenAI-compatible servers is the Vercel AI SDK, on device (LangChain removed 2026-11-11; adopted 2026-11-11 — see the entry below). | Settled                              |
| 8   | Telegram is the only connector in v1. It uses a user-supplied bot token and a pairing code.                                                                                                                                                                          | Settled                              |
| 9   | Gmail, WhatsApp and Discord are deferred connectors.                                                                                                                                                                                                                 | Settled                              |
| 10  | Conversation history is shared across channels. No automatic long-term memory in v1.                                                                                                                                                                                 | Settled                              |
| 11  | Backend and CLI first. HTML screens are wired afterwards in vertical slices, starting with manual entry. Animation last.                                                                                                                                             | Settled                              |
| 12  | One ledger per device, moved by export and import file.                                                                                                                                                                                                              | Settled                              |
| 13  | Personal mode first. Merchant mode later.                                                                                                                                                                                                                            | Settled                              |
| 14  | The reference engine is read-only. Logic is ported module by module through failing tests.                                                                                                                                                                           | Settled                              |

## Bootstrap verification — 2026-11-04 (pending user decision)

S0 is the first unchecked step. Inspection at `2fb5f92` found:

- Required `reference/` and `canvas/` archives are absent. Do not invent the 31 reference checks or inspect any UI archive before G3.
- A GPL-3.0 `LICENSE` exists, while this document, Plan.md and README.md say the license is undecided. Preserve the file pending owner clarification; do not make a licensing decision on the owner's behalf.
- Source scaffolds already exist in core, CLI and mobile, contrary to S0's docs/config-only requirement. Proposal: preserve them and reconcile the existing foundation during S1 rather than destructively reset it.
- Plan.md targets `packages/cli`, but docs/ARCHITECTURE.md targets `apps/cli`, matching the existing scaffold. Ask which location governs before changing workspace structure.
- The user requires a separate branch, PR and review. Work is on `chore/verify-repository-bootstrap`; authenticated push and PR await `GITHUB_TOKEN` in the environment. Never persist the token in a file.

No implementation or completion claim is made. Stop at the Phase A boundary until the missing inputs and bootstrap disposition are confirmed. The verified-implementation skill has been read; implementation research and a written Verified Approach must precede non-trivial code changes.

## 2026-11-11 — Vercel AI SDK adopted as the OpenAI-compatible transport (on device)

This supersedes the earlier "AI SDK rejected" wording in row 7 and in
`docs/ai_sdk_evaluation.md`. The owner directed adoption after reading the
evaluation, and the port is implemented on branch `feat/provider-contract`.

Scope, stated precisely: the SDK owns **wire plumbing only** (request encoding,
SSE framing, tool-call fragment assembly, usage extraction). Vittaz still owns
preflight, endpoint safety, the key pool and its rotation/cooldown policy,
`BadRequestNoFallback`, the eight failure reasons, cancellation, and the
diagnostics codebook. Tools are handed to the SDK as definitions **without**
`execute`, so the harness remains the only thing that runs a tool.

Deleted: `providers/adapters/openai_compatible.ts` and its tests.
Kept: `providers/adapters/anthropic.ts` — a different protocol that
`@ai-sdk/openai-compatible` cannot serve.

### Known, accepted differences in wire behaviour

1. `system`/`developer` message text is sent as `instructions`; SDK v7 forbids
   those roles inside `messages`.
2. `maxRetries: 0` is pinned per call. The SDK default is 2, which the key pool —
   the only retry authority — must not inherit.
3. The transport appends `/v1` to the configured base URL. Configure
   `https://host/api`, not `https://host/api/v1`.
4. Header names are lowercase on the wire, and the SDK sends
   `user-agent: ai/<ver> ai-sdk-provider-utils/<ver> node.js/<ver>`. It is set
   after caller headers are merged, so it cannot be overridden. No key or user
   data, but it does fingerprint the client stack to the provider.
5. Non-streaming requests omit `stream` instead of sending `false`.
6. The token cap is sent as `max_tokens` instead of `max_completion_tokens`.
7. The CLI now requires `VITTAZ_AI_MODEL`: the shared provider contract already
   required a model, and the SDK cannot construct a model handle without one.
   Previously a model-less request was sent and rejected by the provider.
8. Exceptions thrown inside the SDK's `onChunk` callback are swallowed by the
   SDK, so the adapter catches them and re-raises the historical
   `Provider callback failed` behaviour. Without this, a throwing UI callback
   would be silently ignored.

### Still unverified

On-device React Native/Hermes behaviour. The SDK imports `TextDecoder` and
`TransformStream` at module load; Expo 58 / RN 0.88 is expected to provide both,
but no device or emulator exists in this environment, so the claim is untested.
Per the owner's rule, a passing Node suite is not device evidence.

## 2026-11-11 — Anthropic transport also moves to the AI SDK

Directly after the OpenAI-compatible swap, the owner asked for the same treatment
for Anthropic: `@ai-sdk/anthropic` replaces the hand-written
`AnthropicMessagesClient` (640 lines) and its 1,248-line test suite. Same split
as before — the SDK owns request encoding, SSE framing and usage extraction;
Vittaz keeps preflight, credential rules, the failure vocabulary, cancellation
and the result contract.

Pinned: `@ai-sdk/anthropic@4.0.104` (its `engines` field says Node >= 22; the
project already runs Node 24).

### Preserved deliberately

- **Endpoint pinned** to `https://api.anthropic.com/v1/messages`. It is never
  taken from configuration; supplying a `base_url` for an Anthropic config is
  rejected at construction rather than silently ignored.
- **`anthropic-version` kept at the project's verified value** via a caller
  header override (verified to reach the wire). The SDK's own default differs.
- **Default reply budget stays 1024 tokens.** The SDK defaults to the model
  maximum (128000). Silently multiplying the worst case of every un-capped
  request is a cost change, not a migration detail.
- **In-band SSE error discards the partial answer.** Measured: the SDK resolves
  with the partial text and `finishReason: "error"`. Returning that would
  reproduce the historical truncation bug, so it is mapped to `protocol_error`.
- **Malformed 200 bodies are protocol failures.** Measured: the SDK throws an
  `AI_APICallError` carrying HTTP status **200**; without special handling that
  would be reported as a successful HTTP response.
- **Unpaired `tool` messages are rejected before HTTP**, as the deleted client
  did. The SDK looks the tool _name_ up by call id, so an unpaired message would
  otherwise go out with an empty name instead of failing fast.
- **Reply bounds re-applied post-parse**: ≤16 tool calls, ≤32768 characters,
  tool name `^[a-z][a-z0-9_]{0,127}$`, tool id `^[a-zA-Z0-9_-]{1,128}$`.
- **`Provider callback failed`** on a throwing stream callback, as before.

### Accepted differences

1. `system` text is sent as a content-block array; the old client sent a string.
   The API accepts both.
2. A `tool_choice: {"type":"auto"}` field and an `anthropic-beta` header are now
   sent; the SDK adds them. Harmless, but they were not on the wire before.
3. The 64 KiB request-size cap is now enforced on the pre-mapped wire (shared
   with the OpenAI-compatible transport) rather than on the final Anthropic body.
   The mapped body can exceed it by per-block overhead (~50 bytes/block).

### Test coverage moved, not lost

The deleted suite's 25 tests mostly probed SSE framing minutiae (fragmented
frames, out-of-order frames, unknown events, unterminated final frames,
`thinking` deltas). That is now the SDK's job and is deliberately not re-tested.
The replacement, `anthropic_ai_sdk.test.ts` (21 tests), asserts the _contract_
against a real local HTTP/SSE fake server: request mapping, pinned version,
reply budget, tool-use mapping, streaming, in-band error, all HTTP status
classes, preflight and redaction, cancellation, and no key/endpoint leakage.

### Still unverified

On-device React Native/Hermes behaviour for `@ai-sdk/anthropic`, and any live
Anthropic call. No device, and no API credentials, exist in this environment.

## 2026-11-11 — Opt-in app-attribution headers

Mechanism: some gateways name the calling app from two optional request headers
— `X-Title` (app name) and `HTTP-Referer` (app URL). OpenRouter uses them for its
dashboard; without them all usage is filed under "Unknown", which is exactly what
the first live test showed.

Decision: add `attribution?: { title, referer? }` to `ProviderConfig`. It is
**opt-in and per configuration**, not inferred from the hostname. Inferring it
would require a provider-specific branch (`if host is openrouter`), which this
codebase forbids, and it would silently fingerprint every request to every
endpoint — including self-hosted Ollama on a laptop.

Constraints enforced by the schema:

- `title` is 1–80 characters and rejects control characters, so a header cannot
  be split or injected.
- `referer`, when present, must be `https:` and a URL. It is displayed in a third
  party's dashboard, so a typo or a user-identifying URL fails loudly instead of
  being sent.
- Neither field may identify a person. They carry the app name and the
  deployment's own public URL, nothing else, and no key or ledger data.

When `attribution` is absent the wire is byte-identical to before; a test asserts
the headers are absent, present, and title-only.

**Wired:** the mobile app sends `X-Title: Vittaz` and
`HTTP-Referer: https://github.com/OnlyXianzo/Vittaz` on the OpenAI-compatible
BYOK path only (`APP_ATTRIBUTION` in `mobile_qa.ts`). The Kilo free gateway and
the Anthropic path are left byte-identical, because neither reads these headers
and adding them would be fingerprinting without a benefit.

The CLI does not set it: `attribution` is a configuration field, and the CLI
builds its config from environment variables only. Adding an env pair for it is
a separate, small change — not done here, to keep this commit to one thing.

## 2026-11-11 — Provider shape is configuration: API path, auth header, extra headers

Driver: the owner asked for Bedrock, Vertex and "any other API" plus custom
providers. Investigating first found a real defect rather than a missing SDK:
the transport hard-coded `/v1`, so **Google Gemini's OpenAI-compatibility
endpoint (`/v1beta/openai`) could never have worked** — it would have requested
`/v1beta/openai/v1/chat/completions` and returned 404, which reads to a user as
"my key is broken".

### Added to `ProviderConfig` (all optional, all validated)

| Field           | Purpose                                                         | Default         |
| --------------- | --------------------------------------------------------------- | --------------- |
| `api_suffix`    | API path appended to `base_url`; `""` means the URL is complete | `/v1`           |
| `auth.header`   | `authorization` / `api-key` / `x-api-key` / `x-goog-api-key`    | `authorization` |
| `auth.scheme`   | Prefix before the key; `""` sends the bare key                  | `Bearer`        |
| `extra_headers` | Static headers (API versions etc.), ≤8 entries                  | none            |

Guard rails: `api_suffix` must be empty or start with `/`, with no `..`, `?`,
`#` or whitespace; `extra_headers` can never contain `authorization`, `api-key`,
`x-api-key`, `x-goog-api-key`, `host`, `content-length`, `content-type` or
`user-agent`, so credentials cannot be smuggled through configuration.

This stays a **format** choice, not a provider branch: no code anywhere asks
which provider is calling.

### Presets are data

`providers/registry/presets.ts` lists known-good endpoint shapes (OpenAI,
OpenRouter, Groq, DeepSeek, Together, xAI, Mistral, Gemini, Ollama, Anthropic).
Adding a provider is a row, and a test proves every row passes the real
validator, so the app cannot offer a provider that throws when selected.

### Bedrock and Vertex: deliberately not added

Both are recorded in `UNSUPPORTED_PROVIDERS` with a reason and an alternative,
rather than silently left out:

- **Bedrock (SigV4).** `@ai-sdk/amazon-bedrock` signs with SigV4 via `aws4fetch`,
  which needs WebCrypto SHA-256 **at request time**. This repo has
  `hermes_crypto_regression.test.ts` asserting the transport still completes
  with `globalThis.crypto` removed — a fault actually seen on device. Adding
  SigV4 would reintroduce exactly that. Alternative: a Bedrock API key (bearer
  token) as an `openai_compatible` entry, or a gateway.
- **Vertex AI.** Requires a service-account JSON or a short-lived OAuth token. A
  service-account file on a phone grants broad cloud access and cannot be
  protected by an app passcode. Alternative: the Gemini preset, same models,
  plain AI Studio key.

### Wired into the app

The Keys screen now offers these presets plus Custom. A preset only prefills
fields; it is the same code path as a hand-typed custom endpoint. Advanced fields
(API path, auth header, auth scheme) open automatically when a preset deviates
from `/v1` + `Bearer`, so Gemini's `/v1beta/openai` is visible rather than magic.

Model discovery uses the same API path and key header as chat. Previously a
Gemini-style profile would have listed models from one URL and chatted to
another.

`extra_headers` is supported by the contract and tested at the transport level,
but has no form field yet: it needs a key/value editor, and no preset requires it.

### Follow-up: the missing `include_usage` was user-facing

Live testing against Gemini (and then Groq) proved this was not a cosmetic
token-counter gap. `qa_loop.ts` treats `usage.total_tokens === 0` as a failure
and returns `stopped("token_budget")`. The mobile app streams. A local fake
server that streams text _without_ usage reproduces it exactly:
`{answered: false, stopReason: "token_budget", chunks: 0}`.

So a provider that omits usage from streams would have shown a **token-budget
failure instead of the answer** on a real phone. Fixed in `1bcab8d` and now
verified live on two providers.

### How the live checks were permitted, given the synthetic-data rule

`AGENTS.md` requires synthetic data only: no real transactions, names, bank
messages, keys or spreadsheets anywhere. The live checks above were run against
throwaway provider accounts created for the purpose, with **owner authorization**
and **throwaway keys**, and the rule was applied to everything else:

- The prompts sent were a fixed synthetic question. No ledger, transaction,
  account name or export was involved, and none was available to the checker.
- Throwaway keys were used only in the shell session that ran the check. They
  were never written to the repository, a test file, a log, a screenshot or the
  workspace, and were revoked afterwards.
- Everything committed to the tree uses synthetic credentials: fake keys such as
  `sk-ant-synthetic`, and local fake servers (`tests/helpers/fake_*_server.ts`) that
  speak the real wire protocols.
- No test asserts against a live provider. The suite runs entirely offline; the
  live results were recorded here as evidence, not encoded as tests.

So the policy holds: the repository contains synthetic data only, and the live
key checks were an owner-authorized exception that left no credential behind.

Lesson recorded for future work: the fake server always returns usage, so the
whole Node suite could not see this. Any transport property that a real provider
may simply omit needs a fake that omits it.

### Bug found while wiring this

Attribution and the custom auth header were both passed to the SDK as a
`headers` option. Two spreads with the same key meant the later one won, so
configuring attribution **silently dropped the credential** — on a phone that
would have looked like an invalid key. Merged into a single object, with a
regression test asserting key + attribution + extra headers arrive together.

## Open

- License. Undecided. Do not add a license file until it is chosen.
- Backup encryption and key recovery.
- Whether to support multiple persisted provider configurations (see the 2026-11-11 entry; needs an owner decision).
- Which local model and size ships first.
- How a future Gmail connector handles OAuth without a Vittaz server.
- Whether the first assistant slice in the UI should be manual entry (current plan) or chat.

## Reference source confirmed — 2026-11-04

The owner supplied `https://github.com/OnlyXianzo/khataclaw-typescript` as the previously missing reference engine. Use revision `b21801c3755f4da4ba4075782c45621d42a3c34c` as the read-only reference, replacing the expected reference zip as the source format. Keep its checkout external to workspaces and CI; record provenance in docs/references.md. Source inspection confirms the expected 31 baseline checks plus 10 extras. Do not claim those checks have been rerun. Preserve public behavior through module-by-module TDD, not wholesale source import. The original source colocates synchronous storage and AI code under core; Vittaz's planned async repository and package boundaries govern the port.

S1 is still local work in progress: the interrupted response did not leave the replacement CI workflow in the working tree, and foundation contracts must be rerun after CI is restored. No completed step, green CI, authenticated push or PR is claimed. The user authorized continued local work, but no approval gate is waived.

## Foundation implementation — 2026-11-04

- Use Node 24.22.2 LTS (within the plan's Node 20-or-newer allowance), because current Vitest does not support the inherited Node 20 runtime.
- Apply a tested, pinned minimatch 11.0.1 override to resolve the current tooling advisory without weakening npm audit. Six bootstrap/configuration tests now cover the foundation. A clean-build failure caused by stale incremental metadata was reproduced; force reference builds to regenerate all distributable output in ephemeral sandboxes.
- Preserve existing apps/cli and the inert mobile scaffold; do not write UI, relocate packages or choose a license during S1. Record the CLI-location proposal for later resolution. The reference is external and reproducible from its pinned public revision.
- The privacy CI job is explicitly a bootstrap placeholder until S11-S16; it is not a G2 sign-off. Live-provider tests and release CD are deferred until their actual CLI/provider steps, not fabricated now.
- Latest owner instruction authorizes autonomous continuation. Nevertheless do not merge the PR or open canvas before the required sign-off.

## Reference inventory discrepancies — 2026-11-04

S2 identifies two behavior/schema differences needing resolution before their affected steps:

- The reference stores text benefit and tags_json; Plan.md specifies benefit_paise and tag. Proposal: retain legacy textual classification under a distinct field if needed while introducing the planned monetary benefit field; never reinterpret text as paise. Defer final schema choice until S4 failing migration tests expose the needed contract.
- The reference supports opt-in cloud note improvement; Plan.md specifies local improve_note. Proposal: retain local-only default and implement the planned local-model port, without adding cloud opt-in scope in S26.

These are proposals, not implemented deviations. All 31 baseline checks are mapped with pending status; no fresh reference pass or implemented parity is claimed. Ten extra checks are tracked separately. No reference files were modified or imported.

## S3 money port and merge controls — 2026-11-04

The money module is ported independently through failing tests, not copied wholesale. Keep public function names and accepted notation, integer bounds and exact final-sum behavior. Monetary failures use MoneyValidationError without echoing arbitrary input; formatting uses BigInt division/remainder to guarantee cents at safe limits. A failing Devanagari prefix test exposed the reference regex's shorter रु alternative consuming the start of रुपये. Match the longer prefix first so documented रुपये notation works; this deliberate bug fix is backed by the failing case.

Baseline 1.1 remains partial: pure guards/parser/sum are covered at S3, but SQL float rejection and SQL sum are deferred to S4. Never mark the full baseline check green before both parts pass.

Owner authorized conditional autonomous merging. Active ruleset 26531429 protects main with PRs, resolved threads, strict five-job CI and CodeRabbit checks, no bypass actors, deletion and force-push protection. Required human approval count is zero to support the owner's requested automated merge workflow; CodeRabbit completion and unresolved-thread checks remain mandatory. No rules were weakened to merge. Token remains ephemeral in process environment rather than files.

### Foundation scan compatibility after owner reviewer import

The owner commit 1730231 adds a clearly synthetic negative-example credential assignment in the review checklist. The history scanner flagged it after merging main. A failing scanner test reproduced the false positive; a narrowly exact whole-line exception fixes that single fixture while tests retain detection of a one-character variant and another synthetic high-entropy assignment. No history, directory or token prefix is excluded. This is S1 CI maintenance necessitated by the new upstream skill import, not an application feature.

### CodeRabbit optional — owner clarification, 2026-11-04

Supersedes the mandatory CodeRabbit requirement above. The owner clarified that CodeRabbit is optional. Updated active main ruleset 26531429 to remove only the CodeRabbit required-status entry and renamed it to "Protect main with required CI". Required quality/privacy/test/security/build checks remain bound to GitHub Actions, with strict up-to-date policy, pull requests, resolved threads, deletion/force-push protection and no bypass actors. CodeRabbit feedback remains advisory; its absence or pending status alone does not block merging. Existing unresolved review threads and mandatory CI failures still block merge.

## Independent review remediation — 2026-11-04

CodeRabbit returned review 5768766230 with two valid foundation findings: raw scanner snippets in logs/results, and privacy CLI overriding @live exclusion. Reproduced both through failing tests and applied minimal fixes. Record actual independent findings and bounded implementation-agent review in docs/code_review.md, without misrepresenting the external foundation review as coverage of S3. CodeRabbit remains optional per owner's clarification; required CI and resolved threads still govern merge.

## Reversal of tooling rewrite and agent tooling protection — 2026-11-04

## 2026-11-04 — Storage compatibility and money columns

Keep legacy reference `benefit`, `tags_json`, and split fields for behavior
preservation; add independent numeric `benefit_paise` and scalar `tag` required
by Plan.md. They are not aliases; no inferred conversion of legacy text to money.
Later import tests must explicitly map both forms. Use safe-integer SQL bounds
and core guards at repository entry. Node-native code lives only in storage.
S4 will be delivered as migrations then async repositories, not marked complete
on migration-only proof. Native prebuilt installation avoids Python build tools.

## Reversal of tooling rewrite and agent tooling protection — 2026-11-04

Per owner directive, `.agents/` is developer tooling and agent configuration, not application codebase. Reverted the unnecessary Python-to-TypeScript tooling conversion back to normal. Codified Rule 15 in `AGENTS.md` explicitly prohibiting agents from refactoring or porting `.agents/` skills and scripts.

## 2026-11-04 — Approval corruption fails closed

Async approval preserves reference idempotency but rejects an approved proposal
whose committed transaction is missing/null with COMMITTED_TRANSACTION_MISSING,
instead of relying on a non-null assertion that returns null as a transaction.
Synthetic corruption regressions cover both cases. No repair or AI write path is
introduced. Batch approval runs within one repository unit, not reentrant calls.

## 2026-11-04 — Undo must not overwrite newer state

Reference undo blindly restores old snapshots. Vittaz will reject stale undo if
the current transaction differs from the recorded after-state (or a deleted row
has since reappeared), and verify approved proposal linkage before restoring it.
Unsupported entity types or empty snapshots fail instead of falsely marking an
event undone. Normal create/edit/approval/deletion snapshot results remain exact;
audit rows are retained with undone=1. Tests document these safety extensions.

## 2026-11-04 — Rebase follows owner's agent-tooling decision

PR4 and Rule 15 supersede the earlier Python-free developer-tooling decision.
Preserve restored .agents tooling in its original language; application/core
remain TypeScript. PR5 rebase retains both this owner policy and the ledger
corruption/stale-undo decisions. Do not reapply the earlier tooling conversion.

## 2026-11-04 — Backup encryption and recovery decision (S9)

Current development backup is explicit **plaintext** with a SHA-256 corruption
checksum, NOT encryption, authentication, anonymity or secure cloud storage. It
contains private ledger names/notes and must display the inherited warning.
Only send_notes_to_cloud is exported/restored; secure-store keys and connector
tokens are excluded. AI never receives backup or restore capabilities.

Production encrypted export requires a separately reviewed, versioned authenticated
encryption envelope and user recovery/passphrase policy before release; no custom
cryptography or pretend key recovery is introduced now. This remains a recorded
release decision, not proof that Android at-rest encryption is implemented.
Keep reference format identifier/envelope for behavior preservation, but only
current schema-v2 backup rows validate; automatic conversion of external older
backups requires explicit migration tests later. Restoring raw notifications,
analytics or non-allowlisted settings is intentionally excluded as in reference.

## 2026-11-04 — Exact allowance calendar and integer outputs

Preserve reference allowance result fields/truncation. Use Gregorian leap math
for years 1-9999 to avoid Date.UTC's special remapping of years 0-99; reject year 0000. BigInt subtraction/division rejects unsafe returned values and yields
canonical 0 for negative fractions rather than the forbidden monetary -0.
Omitted date uses an injectable clock and Asia/Kolkata; explicit dates never
consult the clock. This is pure domain code, with no UI or Node import.

## 2026-11-04 — G1 approval and sensitive ingress boundary (S11)

Owner explicitly said "Approve G1, continue backend". Record G1 owner-approved;
continue planned backend only and stop for G2 owner sign-off. No G3/UI authority.
S11 retains pure checkSensitiveMessage and adds withNonSensitiveMessage to ensure
a rejected message never reaches a supplied downstream processor. Nonstring and
blank inputs now fail closed with static invalid_input, unlike the reference.
NFKC and removal of Unicode format controls prevent basic fullwidth/zero-width
keyword bypasses without mutating allowed content. This does not prove arbitrary
secret detection, memory erasure or future channel-wide zero trace. S17/S27d must
use the filter before any logging/storage/provider activity and prove integration.
The restored sandbox had stale Git metadata, missing review instructions and old
CI/scanner files. Archived it externally, fetched main, verified all application
files match main, and restored exact upstream tooling/workflow (no rewrite).

## 2026-11-04 — S12 name mapping separation

PrivacyRedactor is pure and in-memory; seed it with ordered canonical names from
async storage at the future application boundary, not the reference's synchronous
DatabaseAdapter. Placeholder identity is stable for that mapping and reproducible
from the same ordered seed, NOT yet proved across device restarts. Reserved
Person_N names are rejected to prevent token/name cascades. Reverse substitutions
are callbacks, so literal `$&` in a name cannot expand into the original token.
Only known exact names (case-insensitive, canonical Unicode) are covered; aliases,
unknown names and spelling variants are not anonymity guarantees. Raw notes stay
local by default. Real outbound entry points remain S27d.

## 2026-11-04 — S14 safe diagnostics use a codebook, not raw text

Reference regex sanitization preserves arbitrary free text and may leak names,
unknown key formats, notes or error paths. To satisfy S14, diagnostics retain only
five static operational event codes and omit ALL arbitrary metadata/error/context,
without traversing properties/getters/causes or coercing objects. No secret registry
stores keys: registerSecret remains a compatibility method but need not retain
anything. This intentionally sacrifices raw messages/stacks for privacy. Existing
logger/reporter method names remain; crash captured_at uses snake_case. No raw
caller-supplied id/path/name/key is allowed. Last100 records bounded in memory,
returned copies cannot poison retained records, crash IDs monotonic. Diagnostic
codebook/clock/sanitizer dependencies are trusted application composition, not AI
inputs. Actual device crash SDK/ingress error wiring remains later work; don't
log dropped messages, even through the sanitizer. Application errors still need
explicit caller handling, not swallowed failures or a claim of device proof.

## 2026-11-04 — S15 adversarial name fixes and remaining limits

Adversarial red tests reproduced known-name NFKC/format-control mismatch, literal
Person_N impersonation, absent cold-start discovery, and a Hindi honorific
stopword bug during implementation. Fixed by consistent matching normalization,
masking incoming placeholder-like tokens, and in-memory discovery for explicit
English/Hinglish/Devanagari payment constructions. Discovery rejects pronouns,
common expense words and numeric candidates; trailing Hindi जी is an honorific,
not a reason to reject a whole name. Sensitive text is dropped before discovery.
Redaction is ONE PASS on raw input: an already-redacted Person_N payload must not
be redacted again or it becomes [PERSON_TOKEN]. Reply reversal is local only.

Limits (not tests silently pretending to establish anonymity): unknown nicknames,
typos, transliteration, arbitrary names in prose/notes, indirect identifiers,
encoded strings and mixed-script confusables may remain. Tests explicitly show
`amann`, `munna`, and Cyrillic-А `Аman` are not recognized without local mapping.
A locally validated alias can be registered; no fuzzy identity guesses. Inline
heuristics can over-redact common words and are not general name recognition.
Normalize known names to NFKC for matching; stylized forms may become canonical
ASCII in a returned mapping. Unknown/uncertain free text and raw notes must stay
local, and real outbound contexts require allowlists and validation at S27d.
Full provider/Expo/multi-turn extra checks remain pending. No zero-trace, memory
erasure or device parity guarantee follows from these pure unit tests.

## 2026-11-04 — Owner authorizes autonomous checkpoint progression

Latest owner instruction: "Approved all next check point continue without any
user input do it in autonomous". This explicitly supersedes routine owner-wait
pauses for remaining backend checkpoints and accepts the documented G2 foundation
limitations. Advance only after each gate's documented technical checks pass;
never pre-mark future work/gates complete or bypass privacy/CI/protected merges.
Continue backend/CLI scope, not frontend/device implementation. Physical Android
proof and release encryption/model decisions cannot be invented by advance consent.
PR11 exact2803c63 CI41853443703 five green merged normally as d2b80c4.

## 2026-11-04 — S17 bounded and fail-closed notification ingress

Preserve reference baseline3.1-3.4 asynchronously. Notification input is capped at
16000 characters and never coerced. Snapshot app package once (a regression first
reproduced two getter reads), catch unreadable metadata without echoing errors;
nonallowed/sensitive input never reads later fields or writes anything. Accept
safe epoch or strict ISO-Z postTime only, rejecting nonstandard/rolled calendar
strings rather than reference raw-input error messages. Unknown sanitized text
uses the existing v2 local-only queue; no cloud/log capabilities. Numeric UTR
matching/standard fixtures are bounded format support, not all-bank parsing.
New unparsed async repository capabilities remain app-only, never AI tools.
Same-payment deduplication deliberately belongs to the next separate S18 step.

## 2026-11-04 — S18 atomic replay and audited enrichment

Verified S17 exactcadaed3 CI41854664678 five success; normal SHA-pinned PR12
merge aa8a26a84465d747f82a289dffd7ffd8e583cdfc, zero unresolved threads.
Proceed under existing autonomous backend authorization. Keep reference matching
order while avoiding financial suppression of manual/import rows, conflicting
known accounts/references or multiple ambiguous candidates. Exact stored-key
identity conflicts error statically instead of claiming a match. Within a single
existing async write unit, enrich missing fields only and audit that mutation;
unchanged replay writes nothing. Internal (non-barrel) captured unit helper avoids
nested transactions and preserves root input validation/public ledger behavior.
Refund/reversal no-reference fallback remains unsupported as reference; identical
UTR/event replays are supported. Amount/time-only matching can still false-merge
legitimate equal-value payments and remains unverified/reviewable, not a claim of
universal identity. Future indexed query optimization requires measured evidence.

## 2026-11-04 — S19 importer boundary and privacy-safe errors

PR14 exacta5aa761 CI41855573141 five SUCCESS; SHA-pinned protected merge
18dcfc95f07ac9800670a760f94077faa27993cd with no unresolved threads. Under
existing autonomous permission, port reference3.6 incrementally. Put SheetJS CE
0.20.3 in Node storage adapter using official version URL+lockedSRI, not outdated
npm0.18.5. Broaden exact-pin foundation test to cover storage and this ONE exact
URL; no generic URL pin exception. Core importExcelRows stays framework-free,
async and deterministic except injected ID/clock and standard SHA256.

Preserve default first-sheet import, benefit string, normalized tags, occurrence
ordinal duplicate semantics; add benefit_paise integer column mapping/singular tag.
Wallet-aware row hash prevents silent suppression across selected wallets. Check
per-row Wallet column conflicts rather than reference ignoring it. Reject formula
cached values/error cells/sensitive fields, nonpositive/inexact money (no numeric
rounding), calendar-roll dates/fake1900leapday/fractional serials, duplicate mapped
headers. Return static errors with physical row numbers, never raw cell exception
messages. Real missing wallet/audit/storage failure aborts batch atomically.

Only XLSX ZIP32 stored/deflate subset, max1MiB input/128entries/16MiB actual
expanded/10000rows/64columns; bounded CRC and header/descriptor/extra consistency
preflight addresses compression expansion before SheetJS. Not CRC authentication,
not XLS/ZIP64/encryption or comprehensive hostile-file certification. Node-only
preflight intentionally not claimed as a mobile implementation. No cloud/model/
logger capability, UI, migration, backup change or native build. G3 still pending.

## 2026-11-04 — S20 test-only protocol harness

After S19 exact green/protected merge, introduce only tests/helpers fake server,
not a production service. Keep synthetic request captures in memory for privacy
assertions. Script JSON/tool/usage, HTTP status/retry header, fragmented raw SSE,
missing DONE, socket interruption and delay. Responders' exceptions are static500,
not echoed. Bound64KiB request body, strict POST route/JSON, loopback ephemeral
port. Close then force-close connections per Node24 docs, idempotent teardown.
No live provider, runtime package/dependency, DB, UI or tooling changes.

## 2026-11-04 — S21 isolated bounded provider protocol

After protected green S20 PR16, create packages/agent for provider-only functions,
with exact existing Zod4.6.7. No core AI framework import or provider DB/logger
capability; reference analytics coupling belongs to S24, never raw DB in client.
Preserve4.1/4.2 behaviors while replacing raw errors with static400/abort/callback/
all-key statuses and safe reason enums. Private pool fields, snapshot credentials,
unique safe nicknames, max8keys, bounded metadata/header values and cooldown.
Keep legacy default model string for API compatibility, NOT an availability/live
service claim. No actual credentials or live calls; keyless empty config omits auth.
HTTPS required except loopback fake HTTP; reject URL userinfo/query/fragment and
redirect:error prevents forwarding auth to redirects.

Real fake-server and injected byte-stream tests cover400/401/429 fallback, cooldown
seconds/date/default/clamp, truncated/error streams/reset even final failure,
UTF8 fragments/CRLF/multiline/comments/tool accumulation, malformed/oversized/
missing bodies, cancellation mid-delta and deadlines. Correct failing regressions
caught raw sensitive tool-history bypass, abort-after-last-delta returning success,
standard nullable stream usage, and invalid stream/signal inputs. Guard entire
validated outbound wire before network. Request reserve1KiB for bounded model/
wire metadata; cap responses1MiB and text-only single-choice subset. Ask for stream
usage; missing/null counts remain zeros (UNKNOWN, NOT proof of free/zero billing),
not reference invented token counts. Fatal UTF8 flush validates truncation without
unreachable replacement-text branch. Application callbacks fail statically and do
not trigger paid retries. Service-level name/history/privacy gating and actual
Kilo/Expo interoperability remain separate unproved steps.

## 2026-11-04 — S22 schema/capability restricted tool catalog

After S21 exact1607336 CI41860787302 five success and SHA-pinned protected PR17
merge3ab6e63a6bb4535a394501d776c6b446512775fd, implement the six Plan7 tools.
No generic SQL/DB/repository or user-only action handle enters registry. QA receives
two application query functions; draft receives only create-pending-proposal use
case. Tests wire actual core/store.read capabilities. Physical PRAGMA/read-only
Q&A loop integration remains S23, not preclaimed as full baseline4.5.

Strict Zod input/output validation, JSONSchema from same input schemas, no
coercion. Enforce safe integer paise/negativezero/split bounds, domain years1..9999,
real calendar dates/months, bounded names/arguments/limits, no unknown properties.
Unknown/forbidden/sensitive/invalid calls rejected before application ports. Raw
names forbidden in counterparty args: stable Person_N resolves locally. Local
helper returns core ProposalRow for app only, model-facing draft result minimal.
No approval/rejection/undo/import/settings/credential/tool escalation possible.

Read projections omit raw names, notes, IDs, account digits/references entirely.
Custom freeform category labels are not certified anonymous: output built-in
vocabulary only, other bucket for unknown labels. Do not claim full anonymity or
raw cloud-safe rows. Balance returns existing cash movement semantics, not an
invented outstanding-debt engine. find_person checks local placeholder registry,
not a new contacts database/search engine. check_unverified includes ai_checked
rows still needing human confirmation. Reference get_category_breakdown and
list_recent_transactions behaviors are covered via catalog monthly breakdown and
query_transactions; no extra advertised tools. Static validation/execution errors
omit provider/storage payloads. No framework/provider/SQL integration in registry.

## 2026-11-04 — owner G3 approval; S23 readonly Q&A

Owner: "Continue and G3 is also approved by me". Record G3 owner permission,
not technical completion; remaining Plan/G3 evidence must pass before readiness.
No UI scope change. Restored snapshot git metadata was stale; preserved full
workspace archive and metadata-difference stash, fetched authoritative commits.
Owner merged UI PR18/main6f149ab into S22 headce6add4. Revalidated164tests100% plus
full quality; exactce6 CI41867920638 five SUCCESS, no review threads, normal
SHA-pinned protected PR19 merge2e8681c5621a12bf456096c528a13892aeee571c. No stale
20e7 merge or protection bypass; owner UI/.agents changes retained.

S23 shares private repository implementation between writer and separate existing
file readonly constructor. Readonly opens with native readonly:true plus
query_only ON, no migrations, current schema required. Returned object has read
and close only; no native connection, SQL, transaction/restore/export capabilities.
Core getWalletSummary needs only the existing read port (no behavior change).
Tests instrument actual private native connection and attempt DELETE/DDL with
query_only both ON and OFF; native readonly still blocks writes.

Q&A constructs QA-only registry internally from trusted application query ports.
Step/token/deadline/options/output bounds, combined cancellation and bounded waits
for non-cooperating async adapters. Both actual S21 HTTP client+S20 fake and actual
readonly SQLite integration tested; no network while holding repository scope.
Missing/zero/invalid usage fails closed; provider-reported token stop is NOT an
exact billing/input-token ceiling. No added tokenizer guess. Completion reservation
capped by remaining budget. Synchronous work cannot be preempted, but elapsed
monotonic deadline checked after provider yields (regression red before fix).
Raw provider/storage errors never exposed. Replies buffered until validated;
no streaming callback here. Internal synthetic call IDs, private provider text
not echoed with calls, validated argument echo canonicalized/redacted/scrubbed.
No full AssistantService/history/analytics/channel/persistent privacy proof yet.

## 2026-11-04 — S24 operational analytics boundary

S23 exact3643947 CI41870171432 five SUCCESS/no review threads, protected PR21
merge1cac19ff39f3031d15187cc766f1df4fca9d1b22. G3 owner approved, technical gate
still requires remaining steps. S24 adds opt-in AnalyticsClient completion decorator
and separate application-owned operational append/list functions on writer store.
Agent receives only append-metadata callback, never DB or operational read handle;
QA financial data source remains physically readonly. Operational telemetry is
trusted app side effect, not a model tool permission or financial write/audit.
No new migration/dependency; existing ai_analytics_log table now has typed mapping.
Analytics excluded from financial backups/restores and inaccessible via QA tools.

Success per logical request only (winning fallback key), not per failed HTTP
attempt: prevents fabricated usage/cost on failures and sensitive-drop trace.
Provider failures remain sanitized S21 errors with no analytics; sink failure
raises static AnalyticsError, never repeats HTTP or fallback. Strict storage
allowlist rejects unknown fields, getters, unsafe numbers and outcome mismatch.
Configured metadata strings are public codes, not payload text. KeyPool now rejects
any public nickname/provider/model containing ANY configured nonempty secret,
including cross-key aliases (correct red first). Not a general covert-channel or
unknown-secret detector; trusted app must not encode private data in public codes.

Reference hardcoded fallback prices deliberately not adopted: caller-supplied
per-model integer micro-USD/1000 tokens only; unknown price flagged unpriced,
missing usage usage_unknown, explicit free rate0 remains success. Integer BigInt
half-up rounding and safe storage limits; synthetic test prices not market claims.
No financial/accounting/phone privacy completion claim. Clock exception regression
red fixed to static error before provider calls. Only metadata reaches storage.

S24 publishing correction: the first local secret scan correctly flagged the
literal synthetic negative-test api_key fixture (not a real credential). Shell
command grouping was not fail-fast and erroneously pushed df58e3b/PR22 despite
that failure. PR22 closed unmerged; own branch replaced from green S23 base with
short synthetic fixture preserving the exact rejection behavior. No scanner,
allowlist, tests or protections weakened; no force push. Prior all-green/scan0
claim in PR22 was invalid. Rerun every check before publishing replacement.

## 2026-11-04 — S25 controlled LangChain model adapter

S24 exactbf52d2f CI41871839252 five SUCCESS, protected PR23 merge6406350.
Latest owner main5faf427 reverts chat-first UI (PR20); preserved as-is, no backend
UI rollback/reintroduction. G3 owner approval remains granted, technical gate open.

Pin @langchain/core1.3.4 only in agent, exact lock and audit0. Use real native
BaseChatModel.invoke/_generate and AIMessage, implementing CompletionClient and
QuestionAnsweringAgent interfaces; core imports no framework. Keep S23 authoritative
QA loop instead of a competing createAgent/LangGraph loop. Private one-shot model
holds original validated wire closure; generic native message projection carries
role/text, original null/developer/tool-call protocol never gets rewritten on HTTP.
Standard native valid/invalid tool-call representation plus exact raw result in
private response metadata retain malformed/negativezero argument strings until
S22 validation. No framework tool execution. No cache/outer retries, streaming
callbacks deliberately unsupported here; low-level S21 stream behavior unchanged.

Extract shared S21 preflight (same behavior) before framework invocation: malformed,
sensitive or pre-aborted input has no framework/provider calls. Private callback
manager copy preserves restrictive subclass; all handler attachment throws before
payload delivery. Blocks ambient verbose/tracing/configure hooks without changing
global env/library methods. Explicit invocation config prevents parent callback/
metadata propagation. No telemetry error swallowing or assumption callbacks:[] is
safe. Node inherited callback/context-hook tests and zero-fetch/log tracing tests
exercise this actual pinned manager. Re-audit on dependency upgrades. No claim of
resistance to trusted global prototype tampering or device/Metro certification.

Correct missing-module red and deprecated native tool-warning red before fixes.
195tests31files100% implemented-source metrics, no vendor coverage claim. Actual
fake HTTP/read-only SQLite projections/no mutations, forbidden/malformed tool
rejection, limits/timeout, fallback/400/all-keys/no extra retry, original protocol,
no cache, static unknown/abort errors. No independent-review or full service proof.

## 2026-11-04 — S26 local task ports, no inference engine selected

S25 exact5392074 CI41874462072 five SUCCESS. First normal merge refused while PR
build remained pending; waited for BOTH push and PR required checks, then normal
SHA-pinned protected PR24 mergeddbb90e6126a1936028d8624d181cfbe28e41a61e. No bypass.

Core LocalModelTasks/LocalModelRunner are pure type-only interfaces. Validated
agent task adapter exposes parse_entry/improve_note, NOT catalog tools. Driver
receives task/text/signal only; no DB/logger/cloud fallback capabilities. Local
names intentionally retained. Draft output is minimum amount/direction/category/
local name/note/split data, not a proposal row or transaction, no source/wallet/
status/ID authority. App use case must map it to pending proposal at S27d; unknown
notification routing itself still remains queued, not falsely integrated here.
Improve note is returned suggestion only; no updateTransaction action performed.
Null explicitly not_understood; sensitive inputs drop before runner; strict
malformed/sensitive outputs rejected. Exact safe positive integer paise and split
bounds, bounded labels/text and unknown fields rejected. Model output remains data.

No real local model/SDK/download/catalog or heuristic Hinglish parser introduced.
Scripted fake runners are test-only; arbitrary trusted driver implementations
could have their own side effects, and Node tests do not certify future on-device
inference/offline status. No implicit cloud fallback. Bound deadline/cancellation
for async adapters, elapsed checks before AND after output validation (correct
late-output getter regression red first). JS cannot preempt synchronous inference,
but late values cannot be accepted. Static error codes, no native error text.

205tests32files100% implemented-source metrics. Tests actual unchanged ledger and
clone boundary, valid raw names, defaults/no guessed money, null/invalid/sensitive,
zero runner calls, driver errors, abort/non-cooperative timeout/late inference and
late validation. No independent-review or device-readiness claim.

S26 publish reconciliation: required CI41875662202 succeeded on91ebb3d, but normal
merge was refused because owner main advanced with UI PR25/04a59f1. Merge owner
main into this step without editing its UI; re-run full local checks and exact-head
CI before retrying protected merge. No force push or branch-protection bypass.

S27a: history is local append-only user/assistant text with source app/cli/telegram,
not an AI tool or ledger write capability. Host creates IDs/timestamps. Repository
uses the existing native connection/serialization boundary. Histories do not use
ledger wallet IDs, and ledger-only backup format/schemaVersion2 stays unchanged
when DB schema advances to3. Such backups do not export chats; restoring them
preserves existing local chats. No new full-database backup or cross-device sync
is proposed by this step. Recent reads bounded100, no automatic retention/deletion.

S27a ordering refinement: a failing same-clock/backward-clock regression proved
that sorting turns by host time/random IDs can reorder user/assistant context.
Message windows therefore use a private SQLite INTEGER PRIMARY KEY sequence,
allocated by the database for the append-only API. No AUTOINCREMENT or exposed
numeric sequence/cursor, no caller-supplied ordering key. Host time is metadata.

## S28 — headless Telegram capabilities, no SDK (2026-11-05)

Use official HTTP Bot API with fetch/Zod; no new SDK or package. Keep connector in
agent package, consuming only core AssistantService port. Extract existing S21
bounded UTF-8 response reader/ProtocolError into internal http_body shared module;
existing provider semantics and100% regressions unchanged. Token/cursor/chat lock
secure-host port is deliberately not app_settings/ledger backup. Platform storage,
CSPRNG generator and polling lifecycle remain explicit host responsibilities, not
fake encryption/background-service claims.409 requires operator resolution;429
cooldown enforced, no automatic retries/force takeover. Plain text only to paired
private chat. Cursor metadata advances for ignored messages without storing body.
No exactly-once reply delivery promise; stable request IDs prevent repeated AI
writes on replay. Fake transport and real loopback HTTP/native shared-history
integration tests only; no live Telegram credentials or device claim.

## Verification take-over and provider privacy boundary (2026-11-05)

Independent verification on Node v24.22.2 / npm 11.19.1 reproduced the inherited
S28 backend green: 262 tests / 46 files, 100% implemented-package coverage,
lint/typecheck/format/privacy/build/CLI/audit 0/secret scan 0. Remote main
a12b239ebbff946362a0dbfcce78a737579630dd CI 41964578966 success. S1-S28 and the
owner-owned native visual shell are not redone.

Provider outbound boundary is now enforced at the shared completion-request
preflight, not only in the QA service. `validateCompletionRequest` rejects
sensitive wires before network, sanitizes string leaves with the shared
`PrivacyRedactor.redactOutboundText` / outbound scrubber, re-parses the wire, and
re-checks the 64512-byte body budget because redaction can expand text.
`redactOutboundText` preserves all `Person_N` placeholders so an already-redacted
tool protocol is not destroyed by a second transport pass; impersonation masking
remains on raw-input `redactText`, and tool execution still rejects unmapped
tokens. JSON string leaves are sanitized structurally; numeric JSON values and
tool names/keys are not string-scrubbed. `OpenAICompatibleClient` and
`LangChainCompletionClient` accept the host redactor; the agent privacy CI suite
pins a fake-provider + native-SQLite composition test as required evidence.

Known owner-owned issues remain open, not decided by AI: repository contains a
GPL-3.0 LICENSE file but the project license is still undecided; backups are
plaintext and backup encryption is undecided; the owner-owned native preview
reuses the web demo reducer through Metro watchFolders, duplicating core logic,
and must be replaced when packages/core is wired through expo-sqlite. Telegram
outbound reply text currently redacts only the bot token; reply privacy beyond
the existing assistant redaction remains a reported gap, not silently rewritten
S28 scope.

## S29 — snake_case CLI in apps/cli (2026-11-05)

Keep the CLI at `apps/cli`, matching docs/ARCHITECTURE.md and the existing
workspace/build/CI smoke path. Plan.md's `packages/cli` wording is treated as a
plan-location discrepancy, not a reason to move the app or duplicate a package.
Commander 15.0.0 is the only new dependency. Commands: add, ledger, inbox
list/approve/reject, undo, balance, import, backup, restore, ask. All stdout JSON
keys are snake_case; errors are static codes without raw input echo. The CLI is a
trusted host: it opens the native store, seeds the redactor from ledger
counterparty names, and calls the same core use cases/AssistantService as other
channels. AI still creates only pending proposals; approve/reject/undo/import/
backup/restore remain explicit user CLI actions, never assistant tools. Cloud
ask requires explicit provider env; no default public endpoint or key. Local
draft_entry/improve_note are unavailable without a local model runner, not
silently sent to cloud. Backup encryption/license remain owner-owned open items.

## S30 — headless eight-flow interpretation (2026-11-05)

docs/TESTING.md does not enumerate eight manual flows; the authoritative list is
docs/reference_inventory.md `baseline_headless_flows`: manual, split draft,
approve, improve note, reject, undo, batch approve, export/import. S30 implements
those eight as `tests/integration/headless_flows.test.ts` through the real CLI,
native SQLite, core use cases, and SharedAssistantService with a fake local model
runner. No cloud provider is used for draft/note flows; no Android/device behavior
is claimed. Export/import means ledger backup/restore plus spreadsheet import
replay safety. Improve-note remains suggestion-only and never edits a ledger note.

## S31 — mutation spot-check method (2026-11-05)

S31 uses six deliberate working-tree mutations, one per key rule: name
replacement, sensitive filter, approval, dedupe, key fallback, read-only. Each
mutation must make its targeted existing suite fail; then the file is restored
and `git diff --exit-code` must be clean. Results are recorded in
docs/mutation_checks.md. This is a spot-check method, not a full mutation score
or a claim that every possible mutation is detected. No mutation is committed.

## S32 — documentation completion (2026-11-05)

- README now describes the verified backend through S31, the S32 documentation
  pass, CLI quick start, and the report-only G3 checkpoint awaiting owner sign-off.
- Added `docs/device_tests.md` as a pending checklist. No Android device behavior
  has been verified; the owner must run `adb devices` before S33.
- Added `docs/gates/G3_backend_report.md` as a report only. It does not grant
  frontend authority, device acceptance, or owner approval.
- Owner-owned open questions remain unresolved: the license is still undecided
  despite the GPL-3.0 LICENSE file; backup encryption is undecided and backups
  remain plaintext; native preview reuse of the web demo reducer through Metro
  watchFolders duplicates core logic and must be replaced during core wiring.

## G3 owner sign-off and S33 environment method (2026-11-05)

- Owner explicitly accepted G3 with “Yes — approve G3, start S33.” This accepts
  the backend checkpoint only; it does not accept device behavior, frontend
  wiring, license, backup encryption, or the native preview reducer issue.
- S33 begins with a sandbox/owner-PC environment checker, `npm run android:env`,
  and `docs/android_environment.md`. The checker parses `adb devices -l`, masks
  serials, and reports static errors. It does not claim a device is present unless
  the owner runs it on their PC with the phone attached.
- The sandbox has Node 24.22.2 but no Android SDK/adb and only Java 11, so S33
  device/build evidence must come from the owner PC. No Android device behavior
  is claimed from sandbox checks.
- A blank Expo development build is the S33 build target. The owner-owned native
  visual shell is not rewritten or promoted in S33; S34–S35 will wire
  `packages/core` through an `expo-sqlite` adapter and replace the preview demo
  reducer.

## S33 CI Android proof workflow (2026-11-05)

Owner requested a manual GitHub Actions workflow for S33 Android proof. The
workflow is `workflow_dispatch` only, pins actions to commit SHAs, uses minimal
`contents: read` permissions, and uses no secrets. It builds a blank Expo
TypeScript development-client debug APK on `ubuntu-24.04` with JDK 17 and Node
24.22.2, then uploads the APK with 7-day retention. It does not touch
`apps/mobile/ui/native` and does not claim device behavior. S33 remains open
until the owner reports that the artifact installed and opened on their phone.

## S34 — native app promoted to `apps/mobile` (2026-11-06)

The owner explicitly chose **"Move it — promote to apps/mobile"** when asked how
to handle the owner-authored UI directory. `apps/mobile/ui/native` was moved to
`apps/mobile` with `git mv`, so every file is recorded as a rename and history is
preserved. 27 of 36 files are byte-for-byte identical; the 9 that changed are all
configuration or path files. **No screen, asset, `App.tsx`, `ui.tsx`, `store.tsx`
or `theme.ts` was modified.** `src/domain.ts` changed only to repoint the shared
imports and to re-export the core bridge.

Structural decisions forced by the move:

- **`apps/mobile` is not a root workspace.** Root `workspaces` changed from
  `["packages/*", "apps/*"]` to `["packages/*", "apps/cli"]`. The Expo app keeps
  its own lockfile and ~1151 packages; hoisting it would drag React Native into
  every backend CI job. It is also removed from the root `tsconfig.json`
  project references, and root prettier/eslint/vitest/tsc ignore `apps/mobile`.
- **The web preview stays at `apps/mobile/ui`** and is now nested inside the Expo
  app. The app's own eslint/prettier/tsconfig ignore `ui/`; Metro and Jest
  deliberately consume `ui/src` as the shared domain source.
- **`apps/mobile` keeps Expo's SDK-managed version ranges** (`~58.0.23`, `~5.11.1`)
  because `npx expo install` maintains them. The existing
  `dependencies_are_exactly_pinned` test therefore no longer covers
  `apps/mobile/package.json`. It was **not weakened**: a new companion test,
  `promoted_mobile_app_is_reproducible_through_its_own_lockfile`, asserts
  lockfileVersion 3, a matching `expo` entry, `npm@11.19.1`, and that the app is
  not a root workspace. Reproducibility comes from `npm ci` + the committed
  lockfile. All backend packages remain exactly pinned.
- **`android/` is now gitignored** in the promoted app. Prebuild output is
  generated, and the CI workflow builds it in a temp copy.

### Core wiring (S34 acceptance)

`apps/mobile/src/core.ts` re-exports from `@vittaz/core`, and `src/domain.ts`
re-exports that bridge, so core is reachable from the entrypoint through the seam
every screen already imports. `@vittaz/core` is resolved **as source** via Metro
`watchFolders` + `extraNodeModules`, Jest `moduleNameMapper`, and a tsconfig
path. It is deliberately not a `package.json` dependency, so there is no build
step or published copy between the app and the domain logic.

Two real defects were found by running an actual `expo export`, not by string
assertions, and both are recorded so they are not rediscovered:

1. An unimported bridge file is **dead code**. The first bundle contained no core
   symbols at all. Fixed by re-exporting through `domain.ts`.
2. `packages/core` uses NodeNext `"./x.js"` specifiers while shipping `.ts`
   files, so Metro failed with `Unable to resolve "./ledger/money.js"`. Fixed
   with a Metro `resolveRequest` extension remap and a matching Jest
   `moduleNameMapper` rule.

Verified: the Android Hermes bundle grew from 2.3 MB to 2.5 MB and now contains
`MoneyValidationError`, `normalizeIndicDigits` and `assertIntegerPaise`.

At S34 merge time, the screens still ran the preview reducer and no
`expo-sqlite` adapter existed. S35 implementation is in progress; see the S35
record below. No device behavior is claimed for S34; the S33 owner report covers
the earlier APK opening only.

## S35 — Expo SQLite and native core-backed state (done 2026-11-06)

- Added `expo-sqlite ~58.0.15` through `npx expo install expo-sqlite` (SDK 58
  recommended pin) and enabled its app config plugin. It is only in
  `apps/mobile`'s standalone lockfile, not root dependencies.
- Extracted the exact existing versioned SQL to
  `packages/core/src/ledger/migration_steps.ts`; Node storage and Expo adapter
  now share one `MIGRATION_STEPS` source. Migration SQL itself was not rewritten.
- `packages/storage/src/expo_sqlite_store.ts` implements the framework-free
  core `LedgerStore` port with CRUD repositories, migration-on-open, scoped
  capabilities, queue serialization, async rollback, close semantics, and FK
  enforcement. The app imports this same source; it has no Expo runtime import.
  `apps/mobile/src/storage/open_ledger_store.ts` opens persistent `vittaz.db` and
  closes on initialization failure.
- Initial protected CI exposed an integration boundary: root Vitest followed a
  test import into `apps/mobile/src/storage/expo_sqlite_store.ts` and OXC tried
  to load the app's `expo/tsconfig.base`, absent from backend CI. The adapter
  moved to `packages/storage`; Metro watches it, APK CI copies the package, and
  Native CI triggers on its path. Root tests exercise the same adapter source
  without installing Expo in backend CI.
- Expo docs warn `withExclusiveTransactionAsync` opens a new connection where
  `PRAGMA foreign_keys=ON` does not apply. Since the adapter owns and serializes
  all access, it uses `withTransactionAsync` on the configured connection
  instead. A shared contract case proves orphan foreign-key inserts fail.
- Added framework-neutral contract cases in `packages/core/test/ledger_store_contract.ts`.
  The exact same cases run against both the Node `openLedgerStore` and Expo
  adapter in root Vitest, using a real SQLite engine through the Expo async API
  shape. They cover CRUD/scopes, async rollback/recovery, FK enforcement,
  external-operation serialization, direct reentrancy rejection, close, and
  proposal/audit round-trip. Additional tests prove file persistence across
  close/reopen and shared migration version.
- Replaced the native `useReducer(reducer)` preview path with a local presentation
  state handler and a database-loaded transaction view. Manual entry calls
  `createManualTransaction`; approve/reject call core proposal use cases. Demo
  rows and balance offsets are removed. Native selectors are date/data-driven.
  Chat/quick capture explicitly refuse rather than fabricating answers or
  proposals.
- Native Jest tests use a deterministic in-memory `LedgerStore` double for shell
  behavior. That is not a native database test; the shared contract suite uses
  real SQLite in Node, and the app's manual APK build is still required for
  compile proof. No S35 device claim.
- Expo SQLite web bundle support was also required to keep the existing `web`
  script usable. First export failed on missing `.wasm`; Metro now includes wasm
  and COEP/COOP headers. Android export (2.6 MB Hermes) and web export (502
  modules + 641 KB WASM) both succeed locally; native CI checks both.
- Final local root gate: 344 tests / 56 files, 100% coverage; root audit 0.
  App Jest 11/11; app lint/typecheck/format and Android/web exports pass.
- Local `npm audit` in the app reports 33 issues (1 low/32 moderate). Forced
  remediation wants Expo 53/Jest 29, so no forced downgrade was applied; the
  app audit finding is documented separately from the clean root backend audit.

Known scope limit: the adapter rejects _direct_ synchronous re-entry from within
a store callback, matching the tested core case. As with the Expo transaction
API, repository handles passed to the callback must be used for all work; do not
call the outer store from inside a callback. Core use cases follow this rule.

## 2026-11-06 — S35 Android UUID compatibility repair

Owner's post-S35 phone screenshot showed Add transaction failing with
`Cannot read property 'randomUUID' of undefined`. The app had relied on
`packages/core`'s default `globalThis.crypto.randomUUID`; Android Hermes on the
target device does not expose that Web Crypto global. The operation errors while
building the transaction row before its insert, and the SQLite unit rolls back,
so the failed manual entry was not saved. The standalone APK already embeds its
JS bundle; no Metro server is required.

After a failing UI regression reproduced both manual save and proposal approval
with `globalThis.crypto` absent, the app now injects SDK-matched
`expo-crypto@58.0.7` `randomUUID()` for those two core calls. Core's default
runtime and public behavior are unchanged; no fallback to `Math.random` is
introduced. The tests assert Expo's UUID function is used, with synthetic IDs.
The Expo SDK 58 official docs and version are recorded in `docs/references.md`.
The repair alone did not establish device persistence. On 2026-11-06 the owner
later confirmed that a synthetic entry saved with the corrected APK remained
after closing and reopening Vittaz. This accepts only S35's basic manual-save
persistence check; assistant, approval, migration, Keystore and other device
checks remain pending.

## 2026-11-06 — Owner-approved Add form grouping clarification

The owner reports that the Direction chips (Spent/Received/Lent) and Category
chips (Food/Travel/etc.) read as one group because there is no separator, while
the amount area is already clear. The owner explicitly approved a narrow
presentation change: small Direction and Category labels plus a subtle divider.
Keep the screen's existing palette, chips, spacing language and overall layout;
do not otherwise redesign the owner-authored UI. A focused native screen test
asserts both labels and the divider are present. This is presentation-only; it
does not change ledger writes or duplicate-save behavior.

## 2026-11-06 — Owner-approved S36 assistant route and provider key

The owner authorized wiring the read-only assistant into the native app and
allowing users to enter their own provider key. S36 uses Kilo Auto Free as the
initial keyless route; an optional Kilo Gateway key is stored with Expo
SecureStore and sent only in the request Authorization header. No provider key
was supplied or embedded. The app sends prompts to Kilo, whose Auto Free pool
may route to providers that log prompts/outputs, so the UI warns to use
synthetic data only. The assistant is limited to the existing read-only QA
capabilities and cannot write ledger data or create pending proposals. The S36
Settings screen replaces the old, unimplemented approval/name-replacement/note-
sharing toggles with an explicit read-only/privacy-limit notice; inert controls
must not imply protections or permissions that are not wired. Other providers/
local backends are not wired in S36; Ollama local inference remains a separate
possible keyless route, but requires a reachable local server.

## Owner-approved native BYOK provider scope

The owner selected three separate choices for native read-only chat: keep Kilo
Auto Free as an optional keyless route, add OpenAI-compatible BYOK, and add
Anthropic API-key BYOK. The supported Claude path is direct Anthropic API-key
use only. Do not add Claude.ai subscription/OAuth login or handle subscription
credentials; Anthropic's current developer policy says third-party apps must
not offer that login or route subscription credentials for users.

Provider choice is explicit: do not silently move a prompt between providers.
Keep all provider API keys in Expo SecureStore; never put them in app source,
logs, SQLite, backups, analytics, fixtures, or tests. Tests use synthetic
credential strings and fake HTTP/SSE responses only. Continue to pass requests
through the existing privacy filter, bounded read-only QA loop, and answer
validation; AI must never write to the database or create proposals. No real
provider key or personal prompt is authorized for development or testing.

S36's owner-reported run #13 failure remains unresolved and is not evidence for
or against the new provider integrations. Do not claim a device fix or infer a
root cause from `KILO_UNKNOWN`.

## 2026-11-05 — S38 Android diagnostics build scope (owner-requested)

Owner requested an intensive test-only build, detailed logs, user-triggered log
export to a dedicated Downloads folder, and a descriptive replacement for the
active S33 preview APK workflow. This is recorded as S38 in Plan.md. The device
uses private financial data, so “everything in logs” is implemented as every
relevant _operational stage and outcome_, not raw inputs/outputs: event names,
static stage/reason codes, provider kind, HTTP status, elapsed time, and
allowlisted tool names only. Prompts, replies, ledger records, keys, tokens, full
URLs, response bodies, arbitrary exception text and stacks remain prohibited in
console, memory, and exported logs. Logs are bounded and local; export requires
an explicit tap and Android folder-picker permission. The build must say
“TEST ONLY — synthetic data only”, use a distinct package ID so it cannot
replace personal Vittaz, and keep diagnostics disabled in ordinary builds. The
active preview workflow is replaced with a descriptive manual diagnostics APK
workflow; historical S33 records remain historical and are not erased. This
implementation does not claim a cause for KILO_UNKNOWN until a real device run
of the diagnostics build establishes one. SDK 58 Expo FileSystem/legacy SAF
documentation is recorded in `docs/references.md`; the implementation uses the
Android Storage Access Framework picker.

### S38 implementation checkpoint (2026-11-05)

The mobile bounded allowlist logger, agent/provider/LangChain/QA event forwarding,
synthetic-only diagnostics panel, explicit Android SAF Downloads export, and
safe export service are implemented in the feature branch. Test results so far:
52 focused agent tests passed; all 46 mobile tests passed; mobile and root
TypeScript checks passed; the repository privacy gate passed; and a no-bytecode
Android Expo export confirmed the TEST ONLY banner and Downloads button in the
bundle. A temp-only Expo Android prebuild confirmed the test label, distinct
`com.vittaz.diagnostics.test` package ID, and `expo-file-system` autolinking.
The owner selected the actual Vittaz app preview workflow as the S38 target.
`.github/workflows/mobile-diagnostics-test-apk.yml` now replaces the old
`s33-preview-apk.yml`; the unrelated blank Expo proof workflow remains intact.
All 24 workflow/promotion regression tests pass. The local runner has JDK 11
and no Android SDK/ADB, so no APK/Gradle build or
physical-device SAF verification has been performed. No workflow run/APK has
been produced. No root cause for `KILO_UNKNOWN` is established.

## S38 diagnosis and fix — assistant fails on device; add-provider flow (2026-11-08)

Verified-implementation workflow (Research → Verify → Implement → Prove) applied
to the owner-supplied diagnostics export and the `OnlyXianzo/Vittaz` checkout.

### Root cause (resolves the long-standing S36 "KILO_UNKNOWN")

The diagnostics show, for every question and for both `kilo` and
`openai_compatible`, `langchain_invoke_started` immediately followed (~1 ms) by
`langchain_invoke_failed` with `reason_code: langchain_error`,
`failure_stage: provider_call`, and **no** `provider_request_started` /
`provider_http_response` events. The failure is therefore before any HTTP call.

`@langchain/core@1.3.4` `BaseChatModel.invoke` reaches
`CallbackManager.handleChatModelStart`, which mints a UUID v7 run id via
`utils/uuid/rng.js` → the global `crypto.getRandomValues`. Hermes (React Native)
ships no Web Crypto global, so this throws a generic error that the adapter
classifies as `langchain_error`. Node and the jest-expo runner provide a global
`crypto`, which is why every unit test passed while the device failed. The S35
fix injected `expo-crypto` `randomUUID` for ledger ids only; it never installed a
global `getRandomValues`, so the chat path kept failing.

### Verified approach

Install a global `crypto.getRandomValues` backed by the already-present
`expo-crypto` at app entry (`apps/mobile/index.ts` imports
`src/assistant/web_crypto.ts` first), before any LangChain import is evaluated.
Idempotent and non-destructive (never replaces an existing native impl). Chosen
over adding `react-native-get-random-values` to avoid a new native dependency and
to stay consistent with the owner-approved S35 Expo Crypto approach. The
framework adapter (`packages/agent`) is unchanged; the fix lives only at the
mobile platform boundary. Sources recorded in `docs/references.md`.

### Blast radius

Consumers of the chat path: `apps/mobile/src/assistant/mobile_qa.ts`,
`store.tsx` chat action, and the bounded `ReadOnlyQaLoop` (unchanged). A new
end-to-end regression test removes the global `crypto`, reproduces the
`provider_error` with zero HTTP calls, then confirms a synthetic question answers
once the polyfill is installed.

### Add-provider flow redesign (owner request)

`ModelsScreen` previously rendered all three providers' endpoint and key cards at
once, with three separate Save buttons across disconnected cards. Redesigned to
progressive disclosure: only the selected provider's configuration is shown;
OpenAI-compatible endpoint + model + key share one card with a single "Save and
use" action and inline field-level validation that blocks an incomplete save;
Anthropic uses the same one-step save; Kilo stays keyless with an optional key.
All security guarantees are preserved (keys in SecureStore, never shown; removing
a key never switches providers; selection persisted; no silent fallback). Shell
tests updated to the new flow; progressive-disclosure and inline-validation tests
added.

### Secondary finding — diagnostic export (not changed in this pass)

The export log shows four `export_permission_denied` results before a successful
export. `save_diagnostic_log` only accepts the Downloads root or an existing
`Vittaz-Diagnostics` folder; any other granted folder (or a cancelled picker)
maps to `export_permission_denied`. This is a UX/SAF-classification issue, not the
chat failure. Changing SAF acceptance needs owner device verification, so it is
left as a separate planned step rather than bundled here.

### Verification

Mobile: 57 tests / 9 suites pass; mobile TypeScript, ESLint, and Prettier checks
pass. Repository privacy gate passes; deep secret scan reports zero findings in
history and working tree. No live provider request, real key, APK build, or
physical-device run was performed; on-device confirmation remains owner-only.

## S38 follow-up — post-fix device diagnostics (2026-11-08, afternoon)

After the Web Crypto fix merged (PR #72), a new device export confirms the chat
path now works: real `provider_request_started` / `provider_http_response 200`,
tool execution (`find_person`, `query_transactions`, `get_month_summary`,
`check_unverified`) and many `qa_completed` answers. Three remaining failure
classes were observed:

1. **Mid-step timeout (code bug — fixed).** `store.tsx` called `answerQuestion`
   without `timeoutMs`, so the bounded `ReadOnlyQaLoop` used its 30s default as a
   single budget shared across all tool steps. Each provider call may take up to
   45s and the Kilo free tier was observed at ~24s for one call, so a healthy
   two-step answer ran out of total budget mid-second-step (`qa_stage_failed`
   `timeout`, then `provider_fetch_failed` `cancelled`, and a truncated SSE parse
   logged as `protocol_error`). Fix: pass `timeoutMs: 120000` (the loop maximum)
   from the mobile chat action so multi-step answers complete; the per-call 45s
   provider timeout still fails a hung call quickly. Mobile-only change; the
   shared loop semantics are unchanged. A shell regression test asserts the chat
   passes a total budget >= 90s (fails before the fix, passes after).

2. **HTTP 401 unauthorized (credential issue — not a code bug).** Seen for
   `openai_compatible` and for `kilo` when a key was saved (`count: 1`). The saved
   key is invalid/expired; the app correctly reports `*_AUTH`. Removing the Kilo
   key returned to the keyless route (`count: 0`), which then succeeded. Owner
   action: correct or remove the key.

3. **HTTP 402 payment required (billing issue — not a code bug).** Seen for
   `openai_compatible`; the endpoint requires credits/billing. Currently mapped to
   the generic `provider_http_error` (`BYOK_HTTP`). A dedicated, actionable
   "payment required" category would touch the shared agent reason allowlists and
   privacy gates, so it is left as a separate planned enhancement rather than
   bundled here. Owner action: add credits to the BYOK account.

Verification: mobile 58 tests / 9 suites pass; mobile typecheck, ESLint, Prettier
pass; privacy gate passes; deep secret scan zero findings. No live provider call,
real key, APK, or device run by the agent.

## S37c — provider disclosure and selection checks (2026-11-08)

S37c is a verification step, not a feature. The disclosure/selection guarantees
already existed in the UI (ChatScreen per-provider "leaves device" copy and route
label; SettingsScreen privacy card; ModelsScreen per-provider key removal; the
read-only chat path). S37c adds a focused, auditable shell test suite that locks
these guarantees for all three providers and fills the one test gap (Anthropic key
removal; provider-failure → no ledger mutation). The provider-failure test required
the mobile_qa test mock to expose the real mobile_qa_failure_message; application
code is unchanged. Plan.md S37c marked done with evidence; S37d (device verification)
remains owner-only.

### Remote branch cleanup (owner request, 2026-11-08)

Deleted 70 remote branches confirmed merged into main: either ancestors of
origin/main (true merge commits) or heads of merged PRs whose tip exactly matches
the merged PR head SHA (squash/rebase merges, no post-merge commits). Kept main,
the open PR #73 branch (fix/s38-chat-multistep-timeout), and
feat/privacy-sensitive-filter (its PR #9 merged but the branch tip advanced beyond
the merged SHA, so deleting it would lose unmerged work). Deletions used the GitHub
API per branch with backup SHAs recorded for recovery; 70 deleted, 0 failures.

## Chat Markdown rendering (owner request, 2026-11-09)

Owner device screenshots showed assistant replies arriving as Markdown (bold
`**headers**`, `-` bullet lists, inline `→`) but rendered as literal text — the
chat displayed the raw `**` and `-` markers. This is an owner-requested UI fix to
the existing read-only chat surface (recorded here per the "propose outside-Plan
work in DECISIONS.md" rule; it does not add a new product capability).

Decision: render the common Markdown subset with a small, dependency-free
component (`apps/mobile/src/Markdown.tsx`) using React Native nested `<Text>`
inline styling, rather than adding a third-party Markdown library. Rationale:
the recent Hermes Web Crypto incident showed that new runtime dependencies can
fail on-device in ways Node/browser tests miss; a pure-RN renderer adds no new
dependency, keeps prompt text on-device, and is fully unit-testable. Only
assistant messages are rendered as Markdown; user bubbles stay plain text.

Scope of the renderer: bold (`**`/`__`), italic (`*`/`_`), inline code, headings
(`#`..`######`), unordered/ordered lists, horizontal rules, and links rendered as
their label only (read-only chat never navigates). Underscore emphasis is honoured
only at word boundaries so snake_case tool names such as `get_month_summary` are
preserved. Opener/closer space rules keep stray markers (e.g. `2 * 3`) literal.

Verification: 15 new Markdown unit tests + 1 chat integration test (assistant
Markdown renders without literal markers); mobile 79 tests / 10 suites pass;
mobile typecheck/lint/format pass; Android Metro export bundles cleanly; privacy
gate passes; deep secret scan zero findings. No live provider call, real key, or
device run by the agent.

## S38 owner device-feedback batch (owner request, 2026-11-09)

Owner approved a follow-up batch from device testing: visible request progress,
progressive answer reveal, trusted current date/month, local chat history, and a
multi-key provider manager with fetched model choices. These are recorded as
owner requests only; no other app is referenced as a product source.

S38a decision: keep the existing privacy boundary (only final validated text is
revealed) and fix the UX by pacing validated chunks and surfacing bounded tool
events, rather than exposing raw provider SSE deltas. Inject the host clock into
the QA context so relative periods do not depend on model training data. New QA
options are optional so CLI/backend callers keep default behavior.

S38b decision: implement mobile chat history as a small local KV adapter using
Expo SQLite's AsyncStorage-compatible store rather than changing the LedgerStore
port or adding a new schema. Rows are validated with the existing core
conversation parser, sensitive messages are dropped, and only a bounded recent
window is sent to the QA loop. This is chat history/recent context, not the
deferred automatic long-term memory feature.

S38c decision: keep the existing chat provider selection contract intact by
storing multiple labeled key profiles separately and writing the active profile
into the legacy single-provider/key slots on explicit activation. This gives the
owner multiple BYOK keys and fetched model choices without changing the QA loop
or introducing silent fallback. Model discovery is read-only and user-initiated;
manual model entry remains available when a provider does not return a list.

S38d build reliability decision: the diagnostics APK workflow may retry the
Gradle assemble up to three times because upstream Gradle/Kotlin artifact
downloads can return transient 504s. This changes only CI retry behavior, not
app code, signing, or the diagnostics-only identity.

S38d status decision: do not mark the diagnostics APK/device verification complete
without a successful APK artifact. The current blocker is external Gradle
distribution download failure; app fixes are merged and locally verified, but
owner device evidence must remain separate and pending.

## Proposed assistant workspace (owner request)

The owner requested an easier-to-reach + button across main screens; opening
chat directly from the message option; a list of separate conversations; and a
chat menu for history, custom instructions, and connectors. Section 17 of the
plan records the work in small steps. The current chat history implementation
stores only one bounded message array and restores it automatically; it does
not yet offer a conversation picker. Existing history must be migrated, not
silently discarded.

Custom instructions are user-controlled preferences, not executable skills or
higher-priority policy. Sending them to a provider requires clear disclosure
and the existing privacy boundary; they cannot grant tools or approval powers.
The connector screen must describe the mobile app's actual capabilities and must
not represent future integrations as connected. Existing external connector
work remains deferred until separately scoped. Detailed implementation and
verification, including in-flight request isolation and migration failure modes,
require the verified-implementation research and test-first process.

## Vercel AI SDK evaluation (owner request, 2026-11-11)

Owner asked whether the Vercel AI SDK (`ai` and provider packages) can replace the
LangChain-based provider implementation and support an OpenCode-style multi-provider
architecture, with a compatibility spike and migration only if every required check
passes. Full evidence is in `docs/ai_sdk_evaluation.md`; the spike harness is in
`spikes/ai-sdk/` and the production tree is unchanged.

Decision: **do not migrate to the AI SDK now.** This is Outcome B from the brief, not a
judgment that the SDK is unusable.

What the investigation established:

- LangChain is not the provider transport. `OpenAICompatibleClient` and
  `AnthropicMessagesClient` own `fetch`, SSE parsing, zod wire validation, the key pool
  and error classification; `LangChainCompletionClient` is a one-shot `BaseChatModel`
  decorator that calls them and deliberately buffers streaming. LangChain is also the only
  reason the assistant needs a global `crypto.getRandomValues`, which is the S36
  `KILO_UNKNOWN` root cause.
- The AI SDK is functionally capable on the RN 0.88 / Expo 58 surface (`generateText`,
  `streamText`, tool round-trip, cancellation, structured output, status-code error
  mapping), compiles with the exact RN 0.88 Hermes compiler, and bundles under Metro.
  Replacing LangChain with it would shrink the Android Hermes bundle by ~6 %; keeping both
  would grow it by ~25 %.
- Two blockers prevent claiming success. First, the mandatory Android runtime gate cannot
  be met in this environment (no Android SDK, emulator or `adb`), so Hermes streaming and
  tool calling on a device remain unproven. Second, the SDK does not raise in-band SSE
  provider errors as exceptions: a 200-then-`{"error":...}` stream ends with empty text and
  only `finishReason === "error"`. A naive port would reproduce the `KILO_UNKNOWN` symptom
  the project just eliminated, so the existing normalized error categories would have to be
  re-established on purpose rather than assumed.
- The SDK also depends at import time on `TextDecoder` and web streams (available only
  from RN 0.88 / Expo 58 onward) and uses `crypto.subtle` for its signed tool-approval and
  MCP fingerprint features, which Hermes does not provide.

Rationale for the ordering that follows: the owner's actual goal — multiple configured
providers, user-owned keys, per-model capability selection and one assistant interface —
does not require the AI SDK. It requires a Vittaz-owned provider contract, a registry that
can hold several endpoints/accounts, and rejecting the assumption that every model has the
same capabilities. Removing the vestigial LangChain decorator is where the maintenance win
is, and it is verifiable on a device with today's pipeline, whereas the SDK migration is
not. Deleting a working provider transport in exchange for an unverifiable one would trade
away the project's own safety guarantees.

Consequence for this step: no dependency, lockfile, production module or existing test was
changed. A Hermes regression test was added
(`packages/agent/src/hermes_crypto_regression.test.ts`) so the historical failure stays
pinned while any future provider work is evaluated: the transport must keep working with
no Web Crypto global, and the framework layer's failure must remain a classified
`provider_call` diagnostic rather than an unclassified crash.

Next step: perform the LangChain removal as its own small step behind a provider contract,
then revisit the AI SDK only if provider breadth becomes a real requirement and a device
test plan exists for streaming, tool calling, error mapping and cancellation.

## 2026-11-11 — Remove LangChain, establish a Vittaz-owned provider contract

**Context.** `@langchain/core@1.3.4` arrived in S25 as a `BaseChatModel` decorator
(`LangChainCompletionClient`) plus a thin `LangChainQaAgent`. It wrapped
`OpenAICompatibleClient`/`AnthropicMessagesClient` and added nothing the assistant used:
the completed AI SDK evaluation (`docs/ai_sdk_evaluation.md`) found the decorator
vestigial, and S38 traced the long-standing `KILO_UNKNOWN` device failure to LangChain
minting a UUID v7 run id with `crypto.getRandomValues` before any HTTP request.

**Decision.** Remove `@langchain/core` and keep the two transports unchanged, behind a
small contract written in Vittaz:

- `providers/contracts/` — `ProviderAdapter` (which _extends_ the existing
  `CompletionClient`, so there are no new request/result types), `ProviderConfig`
  (stable user-visible id, `kind: "anthropic" | "openai_compatible"`, a credential
  **reference** rather than a key, optional base URL, default model), normalized errors,
  and per-model capability metadata where `"unknown"` stays unknown.
- `providers/adapters/` — wrappers that validate a config and construct the real
  transport lazily, resolving the credential through a resolver closure.
- `providers/registry/` — configuration and capability registries. A single config is
  unambiguous; two or more require an explicit `select()`, and `active()` throws rather
  than falling back.

**What did not change.** Fetch behaviour, SSE parsing, request/response validation, body
limits, redaction, tool allowlisting, the key-pool retry policy, HTTP error classification,
`AllKeysFailedError`'s eight reason codes, `BadRequestNoFallbackError` on HTTP 400,
`QaStopReason` values and the `KILO_*`/`BYOK_*`/`ANTHROPIC_*` failure codes. The assistant
still cannot write: it can only create a pending proposal, and approval stays explicit.

**Diagnostics.** `langchain_error`, the three `langchain_invoke_*` codes and the
`"langchain"` source are gone. The two codebook collisions (`disabled`, `cooldown`) and
unclassified failures still normalize to `provider_error`, so the user-visible failure
vocabulary is unchanged.

**Web Crypto.** `apps/mobile/src/assistant/web_crypto.ts` stays. Its original cause is
gone — `web_crypto.test.ts` now proves the assistant answers end-to-end with no global
`crypto` — but it is the only place the app records that Hermes has no Web Crypto global
while `packages/core/src/ledger/ledger.ts` still defaults `makeId` to
`globalThis.crypto.randomUUID` (mobile overrides it in `ledger_runtime.ts`). It is
idempotent and never replaces a native implementation. Removing it is an unverified
Android runtime change and needs device evidence.

**Bundle, measured like-for-like.** The "before" column was produced by exporting a
clean worktree at `9dfb528` with the same command and the same toolchain:

| Measurement                                            | Before      | After       | Change |
| ------------------------------------------------------ | ----------- | ----------- | ------ |
| `expo export --platform android` (Hermes bytecode)     | 5,801,607 B | 3,562,111 B | −38.6% |
| Same command with `--no-bytecode`, modules             | 1,440       | 1,053       | −387   |
| Same command with `--no-bytecode`, bytes               | 3,778,690 B | 2,458,436 B | −34.9% |
| Occurrences of the string `langchain` in the JS bundle | 149         | 0           | −149   |

The historical eval figure (1,438 modules / 5,791,858 B) reproduces within 0.2%, so the
two measurements agree. This is static bundle evidence only; no device or emulator run
is implied.

**Correction (2026-11-11, after reviewing `provider_keys.ts`).** An earlier draft of this
entry claimed multi-account persistence was unimplemented. That was wrong: S38c already
ships it. `apps/mobile/src/assistant/provider_keys.ts` keeps
`assistant_key_profiles_v1` = `{active_id, profiles[]}`, where each profile has a stable
`id`, a label, a provider kind, a base URL and a model, with its secret stored under
`secret_name(id)`; `KeysScreen.tsx` adds, activates and removes profiles and calls
`fetch_model_choices` (`GET {base_url}/v1/models`) to populate the model picker. The
registry projects the active profile into the older single-provider keys in
`secure_key.ts`, which is what the agent still reads.

So no credential migration is needed and none was performed. What remains is optional
wiring, not a user-facing capability: the assistant passes only the active profile to the
agent, so `ProviderRegistry`'s multi-configuration support is unused. Feeding it the whole
persisted list would let the active selection change without the legacy projection. That
is a separate, small refactor and is not required for any behaviour the app exposes today.

Also unchanged: the transport implementations, the approval and proposal semantics, the
Telegram path, and any financial data model.
