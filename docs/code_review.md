# Code review results

Date: 2026-11-04. PR: https://github.com/OnlyXianzo/Vittaz/pull/1 .

## Independent review actually received

CodeRabbit review https://github.com/OnlyXianzo/Vittaz/pull/1#pullrequestreview-5768766230 reviewed foundation head `4fae10cf51250b076768d61c17c3492cba62b000` and posted two actionable findings. This was a real external bot review, not a second local agent simulated by the implementation agent. It does not cover the later money changes.

| Finding                                          | Verification                                                                                            | Fix                                                                                             | Regression evidence                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Scanner copies detected content into CI logs     | Read scan_repo: printed first 80 characters; history and working-tree returned raw match/snippet fields | Remove raw detected values from output and result records; retain type/location/commit metadata | Synthetic mocked-history test first failed, then passed while still reporting a finding; no marker in captured output or serialized result |
| Privacy CLI pattern can select future live tests | CLI testNamePattern overrides configured exclusion; confirmed against official Vitest docs              | Require privacy_ and exclude @live in the same anchored expression                              | Selector test first failed for live-tagged privacy names, then passed for nested/local names and rejected both placements of @live         |

## Implementation-agent review, not independent approval

Reviewed current dirty changes relative to foundation head plus owner's reviewer import. Applied repository code-reviewer and security-auditing checklists sequentially; no subagent dispatch tool exists here.

- Money: framework-free pure exports, safe integer rejection including negative zero, BigInt parsing/summing/formatting, exact bounds and cancellation, Devanagari parsing and additive public barrel.
- Reference: unchanged; baseline 1.1 is only partially covered until SQL checks exist at S4. No claim of all 31 checks passing.
- Scanner compatibility: exact whole-line synthetic review-checklist exception only; one-character variant and unrelated synthetic secret remain detected. No directory or prefix bypass.
- Current tests: 18 pass, with 100% statements/branches/functions/lines on implemented core, lint/format/typecheck/build/CLI/audit and secret scan passing locally. Zero audit findings. Local checks are not remote CI proof.
- No remaining high-confidence critical/high findings in these reviewed local changes. This is bounded review evidence, not a guarantee of security or an external approval of S3.

## Merge conditions

Owner clarified CodeRabbit is optional. Main ruleset 26531429 still requires quality/privacy/test/security/build, strict up-to-date code, PR and resolved threads; deletion and force-push are forbidden, with no bypass actors. Reply to the two validated external findings and resolve only their fixed threads after pushing. Merge only the exact tested head after required CI succeeds. A pending or missing optional CodeRabbit update alone is not a blocker.

## Remote verification and thread resolution

Implementation head `04d0ecfff487dc649eee05f96ae73af299f7a9f3` passed all required CI jobs in https://github.com/OnlyXianzo/Vittaz/actions/runs/41835469588 . Posted detailed replies to both external findings and added the review-results summary at https://github.com/OnlyXianzo/Vittaz/pull/1#issuecomment-6631472878 . Queried actual review thread IDs; only fixed findings were resolved, leaving zero unresolved threads at verification time. Requested an incremental CodeRabbit review of later changes without making its availability mandatory. The existing owner-account approval comment is not represented as an independently launched local agent.

## Python-free tooling change — 2026-11-04

Bounded self-review only; no new independent review claimed. Checked consumers:
CI invokes package script and therefore now uses Node; script is linted and
typechecked; tests execute the actual CLI with synthetic repositories. Preserved
all ten detector families and exact fixture exception, with redaction assertions.
Added staged-only, deleted historical, untracked-directory and renamed-file cases.
Git/read errors fail closed. Remaining limits: regex-based detection, ignored
untracked files, submodules and 64 MiB bounds (explicit failure); core coverage
excludes developer scripts. Removed unused optional Python audit helper and
replaced its instructions with scoped Git searches, not an equivalent scanner.

Initial migration red run: missing TypeScript CLI produced 3 failures / 2 passes;
the two status-1 cases could falsely pass on missing CLI. Tightened the harness
to require `SCAN FINISHED` and empty stderr for every completed scan. Final suite
has 22 passing tests, including seven real scanner integration tests. Publishing
and independent remote review remain blocked by unavailable GitHub authentication.

## S4 bounded self-review — 2026-11-04

No new independent agent review claimed. Migration head f3bf728 passed all five
required jobs in run 41838467754. Async adapter uses private connection ownership,
serialized reads/writes, explicit awaited transactions, rollback after rejected
work, and expiring callback capabilities. AsyncLocalStorage rejects reentrant
root-store access instead of deadlocking. Read callbacks receive no write methods.
No raw SQL is exposed by core ports. Drizzle query mappings preserve every field
of the four current ledger row types; migration SQL owns constraints/indexes.

Tests cover all CRUD paths, missing rows, strict money and FK errors, duplicate
IDs, concurrent ordering, rollback after await and SQLite automatic rollback,
queue recovery, expired methods, idempotent close, file reopen and future-schema
open failure. 35 local tests and 100% implemented core/storage coverage. Remaining
limits: no Expo device proof before Phase I; caller must await callback work and
must not perform network work during a transaction. AI receives use-case-only
capabilities later, never the store or write repositories.

CI correction: final repository head aa31d16 failed privacy bootstrap import on a
clean checkout because @vittaz/core resolved to absent dist. Reproduced locally
by removing core/storage dist directories. Added a test-only source alias per
Vitest docs; no build prerequisite and no privacy job bypass. All subsequent
checks must start without dist to avoid masking package-resolution regressions.

## S5 bounded self-review — 2026-11-04

Preserved manual/captured creation and forward-only transitions via async store.
No database, framework or Node API import in core. Runtime ID/clock injectable;
global Web Crypto default exercised in Node, mobile implementation deferred.
Audit snapshots created atomically now to preserve reference result shape; edit
and undo remain S7. All legacy and numeric benefit/tag columns round-trip, import
source retained. Invalid amounts/direction/event/FK or duplicate dedup key leave
no partial write. 38 tests, 100% implemented core/storage coverage locally.

## S6 bounded self-review — 2026-11-04

S5 head 3b8da49 passed five jobs in CI 41839861735. Approval uses one awaited
unit for transaction/proposal/audit, returns original transaction on repeated
approval, and rejects corrupt approved links. Batch helper shares one capability
rather than nesting root transactions; a later invalid proposal rolls back the
whole batch. Synthetic injected audit failure leaves proposal pending and ledger
empty. Concurrent same-store double approval writes once. No provider/tool gets
the store. 42 tests, implemented core/storage coverage 100% locally; no new
independent review claimed.

## S7 bounded self-review — 2026-11-04

S6 head 4ca95ba passed all five jobs in CI 41840252895. Edits preserve status and
all untouched fields, validate money and create an atomic audit snapshot. Undo
restores exact row timestamps/fields and proposal state, retains audit rows,
rejects repeat/stale/unsupported/corrupt-shape events and rolls back on audit
failure. Deletion-snapshot restoration is preserved although no delete use case
is introduced. Stale-undo extension is recorded in DECISIONS. 48 tests and 100%
implemented core/storage coverage locally. Wallet-summary equivalence follows S8.
Audit snapshots are local trusted records, not an authenticated external format;
backup parsing/validation remains S9. No new independent review claimed.

S7 publication correction: inventory prose omitted both expected `ported` and
`pending` labels, causing the inventory test to fail after the code suite was
green. The shell incorrectly continued to commit/push after that failed command.
Corrected prose in 00ea599 and switched all subsequent command batches to
`set -e`; reran full checks before pushing the correction. No failing head is to
be merged, and the gate remains pending until exact-head remote CI passes.

## S8 bounded self-review — 2026-11-04

S7 corrected head 00ea599 passed CI 41840867890 all five jobs. Wallet summaries
preserve reference treatment of refunds/reversals, exclude pending proposals and
other accounts, and use checked BigInt-backed sums/balances. Cash/bank/UPI account
creation and safe opening-balance update tested; no transfer or lending use case
added. Baseline_1_5 now verifies wallet summary equivalence after edit/approval
undo. 51 tests and 100% implemented core/storage coverage. Large unsafe totals
fail rather than silently round. Opening balance config follows reference API,
not a proposal/AI mutation. No new independent review claimed.

## PR5 owner review/rebase resolution — 2026-11-04

Read actual owner-authored comments:

- https://github.com/OnlyXianzo/Vittaz/pull/5#issuecomment-6632302029
- https://github.com/OnlyXianzo/Vittaz/pull/5#issuecomment-6632410929

Both request a rebase onto main after PR4. Rebased S5-S8 onto main 231d95d,
retained both DECISIONS entries at the one conflict, and preserved Rule 15 plus
the owner's restored agent tooling unchanged. Verified no AGENTS.md or .agents/
difference from main. No implementation change was requested in those comments.
Their module names/test counts are descriptive review text, not exact execution
proof; actual modules are ledger.ts, approval.ts, audit.ts and wallet.ts.

Fresh install and clean-dist validation after rebase: **47 tests pass**, 100%
implemented core/storage coverage, lint/typecheck/build/CLI/privacy bootstrap,
audit zero and full-history/working-tree scan zero. Count changed from 51 because
PR4 restored the original three scanner regressions instead of seven Node scanner
regressions; ledger coverage remains unchanged. Owner comments are recorded as
owner review, not newly asserted independent-agent execution. CodeRabbit optional.

Unfinished S9 backup work is excluded from this PR and preserved separately; it
has a known TypeScript audit-row narrowing error to fix before any later commit.
Required exact-head CI and normal branch protections remain prerequisites to merge.

## S9 bounded self-review — 2026-11-04

Resumed only after owner-requested PR5 rebase/merge, preserving Rule15 and leaving
agent tooling unchanged. Fixed the uncommitted type error by treating snapshot
export as unknown and returning Zod-validated cloned payload, not by casting
AuditLogRow.entity_type to a literal. LedgerStore core port remains unchanged;
Node-only SnapshotStore holds raw snapshot/replacement capabilities which must
not be given to AI. Five ledger tables plus allowlisted setting match reference
backup scope; nonallowlisted local settings/analytics/notifications excluded.
Checksum is corruption detection, not authentication/encryption (DECISIONS).

Tests reproduce full round-trip/idempotent restore, all fields/embedded audit
snapshots/counterparty rows, strict format/schema/money/tag/secret-setting rejects,
checksum mismatch, duplicate/FK rollback leaving target unchanged, invalid local
export and deterministic audit ordering. 51 current tests after owner's scanner
restoration; implemented core/storage coverage 100%. No new independent review
claimed. Current schema-v2 snapshots only; older external conversion deferred.

## S10 bounded self-review — 2026-11-04

S9 head 966e00a passed all five jobs in CI 41843092936. Allowance is pure integer
math with checked BigInt intermediate outputs and explicit India Gregorian date
selection when omitted; injected clock and explicit dates are independently
tested. Leap/century/year bounds, month/year rollovers, malformed dates, money
invalids/overflow, positive rounding and canonical zero on negative fractions
covered. Original 1000-entry creation path now proves one audit per write and
exact stored sum, supplementing the existing SQL sum regression. 55 tests and
100% implemented core/storage coverage locally. All eight layer-one baseline
families implemented; actual remote proof required before G1 report. No new
independent review claimed, privacy/device/agent/UI phases not implemented.

## PR6 owner review and concurrent merge — 2026-11-04

Owner comment https://github.com/OnlyXianzo/Vittaz/pull/6#issuecomment-6632687254
approves the backup changes. Record as owner review, not independent execution
or an assertion that the later allowance received external review. Actual S10
code head c989e99 passed 55 tests and CI41843604522. During final gate-document
publication, fetch showed PR6 already merged by owner as a082d17; no attempt was
made to re-merge or overwrite main. Rebased the documentation-only commit onto
that merge and publish gate evidence separately. G1 still awaits sign-off.

## S11 bounded privacy self-review — 2026-11-04

G1 explicitly approved by owner in conversation. Eight new tests first failed
for missing sensitiveFilter module, then passed. Inspected all explicit reason
patterns, Unicode boundaries, noncoercing invalid-input handling, stateless regex
use, and callback-not-invoked assertions for DB/log/network spies. No private
payload is returned on drop, no sink is accepted by the classifier. Original safe
text reaches the handler exactly once; handler failures propagate and must later
be caught by safe ingress error handling (S14/S27d), never log raw errors.
63 full-suite tests and 100% implemented-source coverage locally; lint/types/
format/build/CLI/privacy/audit/scan pass. No new independent review claimed.
Limit: actual notification/assistant channels do not yet exist; unit callback
sinks are not app-wide zero-trace proof. S12-S16 and G2 remain pending.

## S12 bounded self-review — 2026-11-04

S11 CI41849250052 all five green. S12 missing-module red, then68 total tests with
100% implemented-source coverage. Inspected escaping, copy-on-read mappings,
case-insensitive deduplication, Unicode mark/digit/underscore boundaries,
longest-first overlap handling and exact Person_1/Person_10 reversal. Reserved
placeholder-containing names rejected; callback substitutions preserve literal
`$&`. No Node/DB imports. Stable mapping seeded in memory; persistence/provider
integration deliberately not claimed. No independent external review claimed.

## S13 bounded self-review — 2026-11-04

S12 CI41849814147 all five green. S13 red missing module before implementation;
75 tests/100% implemented-source coverage green. Reviewed full URI before handles,
labelled references before numeric removal, grouped/fullwidth/Devanagari accounts,
mask suffixes and 30-digit nontruncation. Existing redactor composes scrubber;
known name reversals do not restore removed identifiers. Invalid values are not
coerced. Broad email-like handles/long numbers intentionally over-redact. No
provider/structured transaction payload boundary exists yet; raw notes remain
local by policy, not proven by this string-only module. Encoded unknown formats
and other scripts remain documented limitations. No independent review claimed.

## S14 bounded self-review — 2026-11-04

S13 CI41850324160 all five green. Missing-module red, then81 tests/100% implemented
source coverage. Checked that diagnostic inputs never reach String/JSON coercion,
getters, Proxy traps, error.stack, error.cause or key iteration; only primitives
from the codebook and generated clock/id are retained. Tested unknown/registered
synthetic credentials, names, notes, circular payloads, malicious accessors,
returned-copy mutation and retention bounds. Lower diagnostic detail is an
explicit policy tradeoff, not false regex-anonymization confidence. No SDK/sink
integration or independent external review claimed. Backup remains sensitive.

## S15 bounded self-review — 2026-11-04

S14 CI41850901501 five green. Adversarial red reproduced four failures before
changes; after initial implementation Hindi शर्मा जी still leaked because the
stopword check rejected trailing जी. Corrected honorific handling and reran ALL
tests, not just that case. 89 tests and100% implemented-source coverage, lint and
types green. Checked normalized registration, raw token masking before discovery,
no registration of dropped sensitive text, regex literal escaping, matra-safe
boundaries, cold-start examples and rejection of pronouns/digit-only candidates.
Explicit limitation assertions are NOT cloud-safety assertions: unknown aliases,
typos/homographs and arbitrary prose remain local-only requirements for S27d.
No independent external review or full reference extra parity claimed.

## S16 bounded CI self-review — 2026-11-04

S15 CI41851645643 all five green. Missing runner module first failed, then CI
contract tests assert required five primitive suites and reject missing, empty,
skipped, failed, live-only or selector-only evidence. Installed JSON reporter probe
caught stdout assumption; use fresh temp file instead, no undocumented field.
Actual copied runner + synthetic fake child tests verify success/nonzero child/
missing report/malformed JSON/zero tests exit codes, cleanup, and no raw child
payload echo. Lint caught regex-space style; fixed and reran full suite.
93 tests across19files, clean-dist100% implemented core/storage source coverage;
runner/agent tooling/mobile are NOT included in that coverage percentage. Actual
npm run test:privacy passes38 selected tests (34 core primitives +4 CI-contract
checks); meta selector no longer counts as a privacy test. Real CLI smoke remains
version only, not full CLI journeys. No new independent review claimed.

## Publication rebase and G2 pause — 2026-11-04

Read actual PR9 owner comment6633473106: S11 approval, not S12-S16 independent
review or G2 sign-off. PR9 was already owner-merged as f7f3561, so later commits
were not assumed to be included in that closed PR. Main also contains owner's
separate UI PR10. Rebased five remaining commits onto main3db9401 without opening
or editing UI; preserved new root UI exclusions. Repeated clean-dist93tests100%
and every local check. New PR11 head26ffd20 CI41852883630 all five green.
G2 report accurately distinguishes Phase D primitives from later integration,
unknown-name, persistence and device proof. Stop before S17 for owner decision.

## S17 bounded self-review — 2026-11-04

Owner accepted G2 foundation and authorized autonomous future backend checkpoints
subject to actual checks. PR11 merged normally after exact-head fivegreen.
S17 missing module red, then102 tests20files100% implemented-source coverage.
Additional failing regression proved appPackage getter read twice; snapshot once,
catch unreadable package/text/time and test grouped/fullwidth unmasked accounts.
Validated real SQLite zero transaction/audit/queue rows after sensitive/promotional
rejects, posting timestamps, positive exact paise, refunds/reversals credited not
normal spending, and sanitized local unknown queues. Async queue CRUD/missing/
rollback/expired scope covered; migration/backup format unchanged. Standard Node
fixtures do not prove a real Android listener or all bank formats. S18 dedup still
pending. No independent reviewer/external execution claim for this step.

## S18 bounded self-review — 2026-11-04

Red first: five expected behavior failures (duplicate actions/unique keys/window
and reference conflict) then111tests21files100% implemented-source coverage.
Concurrent Promise.all captures on one serialized store commit once, exact
reference beyondwindow, inclusive ±5min/zero/invalid windows, events split,
conflicting references/accounts and ambiguous fallback, manual/import isolation,
missing-only enrichment, actual audit undo and audit-failure rollback checked.
Synthetic corrupt reference identity cannot silently match wrong money/event.
No nested root-store access. All lint/types/format/privacy/build/CLI/audit/scan
passed. Real multi-process contention/device replay/performance remain unmeasured;
existing SQLite IMMEDIATE semantics are not proof of device execution.

## S19 bounded self-review — 2026-11-04

Correct missing-module reds for workbook adapter and ZIP guard.126tests23files
pass100% all implemented-source metrics. Ported reference3.6 using real synthetic
XLSX, including compressed roundtrip. Dry-run store methods intentionally throw
if touched; no calls occur. Re-import and concurrent batches preserve duplicate
occurrence counts; cross-wallet imports do not suppress data. Audits/whole batch
roll back on second-audit failure; no database fault is disguised as a row error.
Physical blank-row numbers, both calendar/serial epochs, pre1900fake-leap serial,
positive exact paise/no rounding, benefit_paise/tag mappings, formula/error-cell
rejects, sensitive/oversized/unreadable fields and static errors verified. Header
aliases reject collisions; **proto** is inert Map data. ZIP32 stored/deflate and
both descriptor formats, extra records, CRC/size/header corruption, declared and
forged expansion bombs tested before library parsing. First-sheet and format
limits documented, not universal parser security/device proof. Full local
lint/types/format/privacy/build/CLI/audit0/secret scan0 pass; dependency official
0.20.3 URL/SRI tested. No independent reviewer claim.

## S20 bounded self-review — 2026-11-04

Correct missing-helper red, five real ephemeral loopback tests now green for
JSON/tool usage/capture-reset, scripted401/429/400/500 and headers, malformed/
oversized/route failures, SSE fragments/DONE/truncation/socket break, cancelled
delay and active-socket cleanup.131tests24files full suite; production-source
coverage100%, test helper outside existing production denominator by design.
All local checks pass. No real API compatibility, credential handling or assistant
security claim; those belong to subsequent steps. No independent reviewer claim.

## S21 bounded self-review — 2026-11-04

Pool/client missing-module reds followed by real HTTP fallback/stream fixtures.
151tests26files100% implemented agent/core/storage coverage, full local quality,
privacy/build/audit0/scan0; compiled @vittaz/agent import/response smoke passed.
Additional red regressions for sensitive tool-history transport, callback-triggered
abort wrongly succeeding, null usage per current OpenAI spec, invalid request meta.
Fixed before publishing. Snapshot states, cooldown boundary, parallel fragmented
tools, missing usage0/unknown, corrupted JSON/UTF8, input/output budgets, private
provider exception payloads and redirect policy checked. No write or log capability,
no model calls outside fakes, no independent reviewer/Expo/real-provider claim.
Concurrent owner UI-only PR13/main a4a1987 preserved by clean rebase; repeated151tests100% and all quality/privacy/build/security checks pass. Exact-head CI next.

## S22 bounded self-review — 2026-11-04

Correct missing-module red; failing oversized-name and year-zero regressions
before fixes.164tests27files all pass100% implemented-source metrics.13 tool tests
cover pending-only proposal/no transactions, local Person_N restore/model-safe
projection, strict snake_case six-tool catalog, bad money/negativezero/direction/
split/placeholder/unknown fields/JSON/names/calendar, mode/unknown/user-only tool
rejection with zero application calls. Actual store.read and core wallet/month
numeric projections, sorting/filtering/limits, custom category coalescing, names/
notes/accounts/reference omission and sensitive zero-proposal trace checked.
Malformed output, invalid pending status, private storage errors and integer sum
overflow fail statically rather than leak or invent totals. Full local quality,
privacy/build/CLI/audit0/scan0 pass. S23 actual read-only loop/PRAGMA and S27d/e full
assistant integration remain unproved; not all31/G3/backend readiness. No independent
review claim. Owner UI PR13 changes preserved and not part of backend review.

## S23 bounded self-review — 2026-11-04

177tests29files100% implemented-source metrics.13 new tests exercise baseline4.4
step/reported-token/timeout, baseline4.5 forbidden action registry and actual
native readonly connection (SQL write/DDL fails even query_only OFF), schema
compatibility/no migration, escaped read scopes and recovery, invalid/sensitive
zero provider/query calls. Actual fake HTTP/S21/readonly storage roundtrip,
private data omission/no DB mutation, local-only names, no private error echo,
abort before/during provider/query, non-cooperating async timeout, malformed or
unknown usage, overflow, duplicate IDs and history bounds. Correct elapsed-time
regression red before fix; not just timer-event timeout proof. No independent
review, exact billing ceiling or whole assistant/device readiness claim.

## S24 bounded self-review — 2026-11-04

8 metadata tests,185tests30files total,100% implemented-source metrics. Correct
missing-module, credential metadata alias, clock-error reds before fixes. Actual
HTTP usage-to-SQLite strict metadata row; fallback winner attribution/one logical
row; synthetic integer pricing/half-up rounding/free/unpriced/usage-unknown. Prompt,
reply, credentials not in analytics; financial backup excludes operational rows.
Sensitive/provider failure has no analytics; malformed/gGetter/extra/unsafe number/
outcome rejection creates none. Overflow/clock/sink errors static, no HTTP retry.
Query registry receives no analytics capability. No independent review or billing
accuracy/current market pricing/full assistant privacy claim.

## S25 bounded self-review — 2026-11-04

195tests31files100% implemented-source metrics.10 new adapter tests: native invoke/
raw tool-argument preservation, real HTTP/readonly SQLite/projection/no mutations,
400/fallback/allkeys/no outer retry, forbidden+malformed tools/step/timeout, original
developer/null/tool protocol/no cache, safe unknown/abort errors, zero-call input
preflight. Ambient tracing/verbose sees no requests/log/payload; inherited callback
not invoked/forwarded; registered context handler fails before observing data.
Correct missing-module/deprecated-native-warning reds first. Pinned source review
of callback copy/handler attachment in addition to public docs; upgrade regression
required. No independent reviewer, native-device or full AssistantService claim.

## S26 bounded self-review — 2026-11-04

205tests32files100% implemented-source metrics,10 new task tests. Correct missing
module/late output-validation deadline reds before fixes. Pure type ports, no
framework/core dependency or executable model tool. Tests fake local names/draft/
note suggestion, null/not understood, zero-call sensitive/malformed input, bad
money/split/direction/unknown fields/private getter/sensitive output, static driver
failure/no retry, abort/non-cooperative timeout/late synchronous result/validation,
actual unchanged financial ledger and cloned output. Real inference/backend
notification worker/AssistantService/device behavior not covered or claimed.

## Verified S26 publish checkpoint

After merging owner UI PR25 without editing UI,205tests32files100% metrics and all
full local checks reran. Exact113c436 CI41876257278 plus every PR/push required
check succeeded, no review threads, normal protected PR26 merge1aadf51b. Earlier
405 refusals were respected; no bypass. This checkpoint updates STATE to verified
facts, not a new implementation step or S27 completion.

## S27 self-review (no independent reviewer claim)

Correct missing-helper red and missing-script isolation red before implementation.
Rechecked normal test discovery, actual adapter/key-pool wire and empty-key path,
strict suffix/zero-price/tool capability selection, exact URL/no redirects/auth,
per-invocation budget, bounded read/abort cleanup, immediate429 stop at each stage,
no retry/model fallback and no tool execution. API output is never logged/echoed.
One actual synthetic live reply+tool JSON smoke passed (not skipped), no extra
inference retry. Only test tooling/config/docs changed; native/device/service
flows and remaining G3 acceptance remain unverified.

S27 publish verified: exactf085c16876044e2a8994d9dcc55195d3c8dd8b47,
CI41957305957 every required PR/push job SUCCESS; no unresolved threads or
changes requested, normal protected PR28 merge77df4d33993d820ec9572fe8601380b7edbbaf2f.
This state-only checkpoint records observed results, not S27a implementation.

## S27a self-review (not independent review)

Correct core missing-module/storage-facade/migration reds preceded implementation.
An arbitrary port's driver-error leak was reproduced red and fixed to static core
errors; native SQL errors are also wrapped without params/cause. Snapshot inputs
before enqueue, no nested connection/queue; reentrant and closed history calls
fail statically and queue recovers after errors. Sensitive input makes zero store
calls; direct storage rejects it with zero message rows. Native constraints reject
orphan/source/role/empty/oversize/NUL data, IDs duplicate globally. SQL write facade
is not exposed by read-only ledger/QA. Tests restart/cross-channel data and ensure
no ledger snapshot changes. Explicit legacy v2 backup/restore leaves chat intact.

Review found timestamp/UUID tie ordering could reverse user/assistant turns. Added
correct red and private integer sequence fix before publish; tests also cover clock
rollback. Sequence never appears in public rows/input or ledger backups. Existing
v1->v2 tests remain explicit; latest/stale/future checks updated for additive3.
Full226tests36files100% metrics; no G3/device/service/channel readiness claim.
