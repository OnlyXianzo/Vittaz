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
