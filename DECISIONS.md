# Decisions

Record every deviation from the plan here, with a date and a reason.

| #   | Decision                                                                                                                                                     | Status                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| 1   | The app is named Vittaz.                                                                                                                                     | Settled                              |
| 2   | Repository interfaces in core are asynchronous. This replaces the earlier synchronous `Db` interface idea, because Expo's recommended APIs are asynchronous. | Settled                              |
| 3   | SQLite with Drizzle behind a separate `storage` package. `better-sqlite3` for Node tests and the CLI, `expo-sqlite` on mobile.                               | Settled, verify against current docs |
| 4   | The CLI and CI run on Node 20 or newer in v1. Bun is evaluated later.                                                                                        | Settled                              |
| 5   | The assistant runs inside the app and CLI. One `AssistantService` serves app, CLI and Telegram.                                                              | Settled                              |
| 6   | Native TypeScript tools with `snake_case` names. No MCP in v1.                                                                                               | Settled                              |
| 7   | LangChain, not LangGraph, inside `packages/agent` only. Revisit after the phone check.                                                                       | Settled                              |
| 8   | Telegram is the only connector in v1. It uses a user-supplied bot token and a pairing code.                                                                  | Settled                              |
| 9   | Gmail, WhatsApp and Discord are deferred connectors.                                                                                                         | Settled                              |
| 10  | Conversation history is shared across channels. No automatic long-term memory in v1.                                                                         | Settled                              |
| 11  | Backend and CLI first. HTML screens are wired afterwards in vertical slices, starting with manual entry. Animation last.                                     | Settled                              |
| 12  | One ledger per device, moved by export and import file.                                                                                                      | Settled                              |
| 13  | Personal mode first. Merchant mode later.                                                                                                                    | Settled                              |
| 14  | The reference engine is read-only. Logic is ported module by module through failing tests.                                                                   | Settled                              |

## Bootstrap verification — 2026-11-04 (pending user decision)

S0 is the first unchecked step. Inspection at `2fb5f92` found:

- Required `reference/` and `canvas/` archives are absent. Do not invent the 31 reference checks or inspect any UI archive before G3.
- A GPL-3.0 `LICENSE` exists, while this document, Plan.md and README.md say the license is undecided. Preserve the file pending owner clarification; do not make a licensing decision on the owner's behalf.
- Source scaffolds already exist in core, CLI and mobile, contrary to S0's docs/config-only requirement. Proposal: preserve them and reconcile the existing foundation during S1 rather than destructively reset it.
- Plan.md targets `packages/cli`, but docs/ARCHITECTURE.md targets `apps/cli`, matching the existing scaffold. Ask which location governs before changing workspace structure.
- The user requires a separate branch, PR and review. Work is on `chore/verify-repository-bootstrap`; authenticated push and PR await `GITHUB_TOKEN` in the environment. Never persist the token in a file.

No implementation or completion claim is made. Stop at the Phase A boundary until the missing inputs and bootstrap disposition are confirmed. The verified-implementation skill has been read; implementation research and a written Verified Approach must precede non-trivial code changes.

## Open

- License. Undecided. Do not add a license file until it is chosen.
- Backup encryption and key recovery.
- Whether to keep LangChain after the Android check.
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

## S35 — Expo SQLite and native core-backed state (2026-11-06; implementation in progress)

- Added `expo-sqlite ~58.0.15` through `npx expo install expo-sqlite` (SDK 58
  recommended pin) and enabled its app config plugin. It is only in
  `apps/mobile`'s standalone lockfile, not root dependencies.
- Extracted the exact existing versioned SQL to
  `packages/core/src/ledger/migration_steps.ts`; Node storage and Expo adapter
  now share one `MIGRATION_STEPS` source. Migration SQL itself was not rewritten.
- `apps/mobile/src/storage/expo_sqlite_store.ts` implements the framework-free
  core `LedgerStore` port with CRUD repositories, migration-on-open, scoped
  capabilities, queue serialization, async rollback, close semantics, and FK
  enforcement. `open_ledger_store.ts` opens persistent `vittaz.db` and closes on
  initialization failure.
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
- Final local root gate: 340 tests / 56 files, 100% coverage; root audit 0.
  App Jest 11/11; app lint/typecheck/format and Android/web exports pass.
- Local `npm audit` in the app reports 33 issues (1 low/32 moderate). Forced
  remediation wants Expo 53/Jest 29, so no forced downgrade was applied; the
  app audit finding is documented separately from the clean root backend audit.

Known scope limit: the adapter rejects _direct_ synchronous re-entry from within
a store callback, matching the tested core case. As with the Expo transaction
API, repository handles passed to the callback must be used for all work; do not
call the outer store from inside a callback. Core use cases follow this rule.
