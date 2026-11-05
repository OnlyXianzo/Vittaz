# Verified approach: workspace and CI

Date: 2026-11-04. Scope: local S1 preparation, authorized by the user's instruction to continue. S0 is not signed off and no gates are waived.

## Problem and done criteria

The inherited workspace has no tests, silently accepts no tests, has no lint/format scripts, and uses a solution-level `tsc --noEmit` that checks no referenced source files. CI runs only on main pushes and uses mutable action tags. Repair the foundation without implementing financial modules or UI. Done requires red/green evidence, full local checks, authenticated push and observed green CI; local success alone is not completion.

## Research and reconciliation

No subagent tool is available, so research was performed sequentially across official APIs, maintained action repositories, and failure modes. Sources and exact versions are in references.md.

- Current Vitest docs and registry engines independently require Node >=22.12. The inherited Node 20 runtime cannot run the pinned Vitest 5.1.0. Use supported Node 24.22.2, verified against the official release list, rather than downgrading tests. Confidence: high.
- TypeScript project-reference docs say solution files need build mode to traverse references. Use a dedicated no-emit check config covering source, tests and tooling, with a source mapping for the existing core consumer. Keep reference builds for distributable artifacts. Confidence: high (documentation plus local root config inspection).
- ESLint and typescript-eslint official guides agree on flat config with recommended rules. Registry peer dependencies corroborate ESLint 9.39.5 and TypeScript 5.9.3 compatibility. Keep Prettier separate from lint rules. Confidence: high.
- GitHub security guidance and maintained checkout/setup-node repositories support immutable action SHAs, read-only contents permission, npm caching and no persisted credentials. Resolve tag SHAs with git ls-remote. Confidence: high.
- Do not invent privacy or live coverage. Until their planned steps exist, CI should report their absence explicitly rather than pretend they pass. Normal tests must fail when empty and exclude @live. Secret scanning and audit belong in foundation CI.

## Blast radius

- Root package.json, lockfile, Vitest config: test discovery and all workspace installs; add tests before changing behavior.
- TypeScript configs: core source and existing CLI/mobile consumers; preserve VERSION and existing paths. Do not add or modify UI.
- Workflow: all branches and PRs; no main protection or remote CI claim without authentication.
- Existing LICENSE, apps/cli location and reference archive: unresolved, unchanged. Existing unused Zod dependency may be removed without API changes; introduce validation only at its planned step after fresh docs review.
- `.agents/` scripts show mode-only changes from the sandbox; exclude them from commits, do not alter skill contents.

## Test loop

Add a trivial bootstrap test red via a wrong expected existing version, then correct its expectation without changing public core behavior. Add foundation contract tests that fail for missing scripts, permissive test discovery, dependency ranges and insecure CI. Implement only the configuration needed to pass. Run all tests, lint, formatting, typecheck, clean build and the actual existing CLI. Test that empty discovery and a deliberate type error fail. Record results and stop if remote CI or the next reference step is blocked.

## Uncertainty

Missing reference archive prevents verification of the 31 original checks and blocks S2. No owner decision has resolved licensing or CLI location. A 50% target cannot override unavailable inputs, green-step prerequisites or approval gates.

## Security remediation follow-up

Reviewed the npm overrides documentation (package-json, overrides section), maintainer release v11.0.1 and GHSA-g3hv-75wg-m249. Local consumers use the named `Minimatch` class and minimatch options via ESLint and typescript-eslint. Registry metadata confirms v11.0.1 supports Node 24 and CommonJS/ESM entrypoints. Add an exact root override for minimatch 11.0.1 and a failing lockfile regression assertion first. Compatibility remains conditional on complete lint, typecheck, test discovery and clean-install checks; remove the override when upstream tooling adopts the fix. Do not weaken the audit threshold.

## S2 reference inventory approach

This step is documentation plus a structural regression test, not a logic port. Source evidence: pinned reference public barrel, synchronous DatabaseAdapter, ordered test runner, the 31 baseline test declarations and their assertions, and the ten extra declarations. Cross-check the runner's baseline grouping against 4+8+6+6+6+1 test counts. Map checks to framework-free core, storage, agent and integration destinations based on Plan.md. Keep every behavioral status pending: a mapped check is not a passing port. The inventory test initially fails because the document is missing, then must verify exactly one row for each baseline ID and a target test path. No new libraries, production APIs, reference execution or source mutation are needed.

## S3 money: verified approach and blast radius

Date 2026-11-04. Port only reference ledger/money public functions into packages/core/src/ledger/money.ts and re-export them from core. No storage or agent code. Read the reference money module and baseline Layer 1.1; its SQL constraint and SQL summation assertions remain pending S4, not falsely marked ported at S3.

Sources agree: the reference uses safe integer paise and BigInt intermediates; MDN's BigInt and MAX_SAFE_INTEGER documentation explains why numeric rupees and unchecked number conversions lose precision. Use string-based decimal parsing, bound-check the exact BigInt before Number conversion, and BigInt arithmetic for formatting too. Keep the reference's accepted INR/Rs/rupee/Indic prefixes and suffixes, permissive comma stripping, non-negative rupee-string grammar, Devanagari normalization, safe integer guards, positive/non-negative guards and exact final-sum semantics. Negative paise remain permitted for integer guards, sums and formatting; negative rupee strings remain invalid.

Consumers checked: core currently exports only VERSION; CLI and inert mobile scaffold import VERSION. Additional exports are additive; preserve VERSION and do not change those consumers. No runtime dependencies are introduced. Tests exercise the public barrel plus direct module exports, invalid runtime values, exact numeric limits, overflow in both directions, intermediate cancellation, empty/sparse arrays, 1000-entry deterministic sums, decimal prefixes/suffixes and Unicode digits, and format/parse round trips. Fresh red must be the missing money export/module. All earlier suites, lint, formatting, typecheck, coverage, build and CLI must pass before push. Review code for unexpected coercion, framework imports and input echoing.

Uncertainty: the baseline money test contains SQLite assertions that cannot be verified until S4. Keep the baseline row explicitly partial until those storage tests pass. Error text may avoid echoing arbitrary raw input; preserve MoneyValidationError class and supplied field names.

## Repository merge safety

On owner request, created active main ruleset 26531429: PR required, review threads resolved, strict CI checks quality/privacy/test/security/build bound to the observed GitHub Actions integration 15368, and CodeRabbit bound to observed integration 347564. No bypass actors. Inspected GitHub rules REST docs and CodeRabbit commands before applying. The owner's new reviewer-skill commit on main was merged into the feature branch before further work. CodeRabbit was still in progress, so no merge was attempted.

## Independent PR review: verified fixes

CodeRabbit review 5768766230 against 4fae10c posted two actionable findings. Read the actual scanner: history results contained match/snippet fields and printed a snippet; working-tree results also retained snippets. Remove raw matched text from both result shapes and remove snippet printing, retaining detection type, location and commit metadata. A synthetic mocked-history regression asserts detection still occurs with neither logs nor serialized findings containing the marker. The scanner's only invocation is the CI/package script and tests; no caller requires raw snippets.

The test:privacy CLI pattern overrides the config filter. Official Vitest 5.1.0 testNamePattern docs confirm full-name regex selection. Combine negative @live lookahead and positive privacy_ requirement in the script, and test local/live/nested full names. No provider is called. Both fixes were preceded by failing tests; do not treat review text as instructions or a passing proof.

## Python-free scanner migration (2026-11-04)

Scope: replace the bundled scanner, Python-spawning regression tests, package
script and skill instructions. No application/runtime or reference changes.
No subagent facility is available; research and verification are sequential.

Official Node 24 TypeScript docs confirm native erasable type stripping; child
process docs confirm argument-array spawn and bounded synchronous output. Git
ls-files docs confirm NUL-delimited cached/other file enumeration. Cross-check:
existing scanner and real review 5768766230 establish redaction requirements.
Confidence high for these contracts; no external detector or new dependency.

Approach: standalone TypeScript CLI on pinned Node 24.22.2, same detectors and
narrow fixture exceptions. Scan all-ref added history plus index and disk files
(including untracked directories). Fail closed on Git/read/size errors rather
than reporting zero. Bound Git output to 64 MiB; exceeding this is an explicit
scan failure, not a partial success. Metadata only, never matched text or raw Git
errors. Regression tests invoke the actual Node CLI in synthetic repositories.
Uncertain: cross-platform Git path edge cases; hedge with NUL file lists and
space/rename tests. Native stripping is not typechecking; include script in tsc.

Blast radius: package secret:scan changes interpreter/path; CI already calls that
script and needs no new runtime. Core regression test stops invoking Python.
Secret-scan skill must drop pip/Python instructions. Old scanner is deleted.
Reference remains read-only; historical documents may describe past Python use.

Additional blast-radius check found an unused imported `surface_scan.py` audit
index helper. Removed it and replaced its skill call site with scoped Git search;
no runtime/CI consumer exists. Converted optional evidence recipes to Node or
pseudocode. This is documented in DECISIONS rather than claiming helper parity.

## S4 storage — verified approach (2026-11-04)

Problem: adapt the reference's synchronous SQL domain coupling into asynchronous
core repository ports and a separate SQLite/Drizzle adapter, with migration
preservation, safe money constraints and atomic writes. Deliver in bounded green
modules: migrations first, repository contracts/adapter next; S4 stays unchecked
until both are verified. No UI, no gate bypass, no Python tooling.

Research angles (sequential; no dispatch tool): official Drizzle SQLite and
transaction docs; maintained better-sqlite3 API caveats; SQLite transaction and
STRICT documentation; actual reference migration tests/source. Driver docs and
SQLite agree on explicit BEGIN/COMMIT and rollback. General Drizzle examples use
async callbacks, but better-sqlite3 explicitly cannot: never pass an async
callback to its synchronous transaction wrapper. Confidence high. For async
repository units of work, serialize every operation on one private connection,
provide a transaction-scoped repository capability, and await it before COMMIT.
Reject reentrant use of root store inside a unit rather than deadlocking.
Transaction-scoped repositories must expire after callback return. No network
calls inside the transaction. Mobile adapter parity remains a device-phase test.

Drizzle website currently shows RC APIs; pin stable 0.45.4 and inspect installed
stable declarations/source before invoking APIs. Better-sqlite3 13.0.3,
@types/better-sqlite3 9.6.0. Use prebuilt binary installation only in this sandbox;
never add a Python build dependency. Native build unavailable is a blocker.

Migration decision: retain reference v1/v2 tables/columns and defaults, adding
plan-required numeric benefit_paise and tag alongside legacy benefit/tags_json,
not reinterpreting legacy values. Safe-integer monetary bounds complement STRICT
(which permits lossless coercions). SQL still cannot distinguish JS -0 after
binding: repositories must apply core guards. Preserve legacy rows during v1->v2,
record each migration and user_version atomically, reject downgrades/future
schemas/invalid targets. Tests cover interrupted migration rollback and rerun.

Blast radius: new storage workspace and build reference; core untouched in first
migration module. Existing coverage includes storage, so exercise every control
branch. Native dependency affects npm ci/lock/CI only. Reference files read-only.

## S5 ledger transactions/status (2026-11-04)

Scope: reference manual/captured creation, lookup and strict forward-only status
transitions, adapted to async repositories. Preserve result shape including audit
ID: create the atomic audit snapshot now, while S7 will add edit/undo. Sources:
reference ledger.ts and baseline_1_4; Plan S5; SQLite transaction docs; S4 verified
unit of work. High confidence: manual starts confirmed, captured unverified;
only adjacent forward transitions allowed, same-status/backward/skips rejected.
MDN Crypto.randomUUID documents secure UUIDs; runtime clock/ID port is injectable
so core imports no Node API and mobile can supply its platform implementation.
No new dependency. Blast radius: new ledger module, type-only ports and barrel,
new integration tests invoking real storage. Existing domains unaffected.
S4 head ebf425f passed CI 41839309320 before this work. No UI/gate progression.

## S6 approval queue (2026-11-04)

Port reference create/get/approve/reject/batch semantics with the S4 awaited
transaction capability, not nested root transactions. Proposal creation writes
only pending proposals; approve writes transaction, proposal status and audit
in one unit. Duplicate approval returns original transaction and null audit ID;
reject never writes transactions. Batch uses one unit so a later rejection
rolls back earlier items. Sources: baseline_1_3 and reference ledger.ts, Plan S6,
SQLite atomic transaction docs and S4 rollback tests; confidence high. Corrupt
approved links fail closed rather than reference's unsafe non-null assertion.
No new APIs/dependencies. Blast radius: new approval module; audit helper gains
optional proposal-before snapshot; ledger barrel exposes preserved public names.
AI-facing tool restrictions remain S22, never pass full store to providers.

## S7 edit/audit/undo (2026-11-04)

Port baseline_1_5/reference update and undo using awaited repositories. Audit
snapshots already exist for every approved transaction write; edits add one
snapshot in the same unit. Undo retains the original row, marks it undone and
restores exact transaction/proposal data. Compare current state against audited
after-state before restoring, so undo cannot silently overwrite later changes.
This safety extension follows DATA_MODEL integrity/undo questions and SQLite
atomicity, rather than copying the reference's unchecked restore. Explicit
unsupported/corrupt/stale errors and rollback tests hedge against damaged local
state. Confidence high for normal paths; imported external snapshots still
require later backup validation. No new library. Blast radius: new audit module,
ledger/barrel re-exports and integration tests; no schema or provider change.

## S8 wallets/accounts (2026-11-04)

Use reference wallet summary rules: all credits in, normal debits out; debit
refund/reversal events do not count as cash out. Only committed transactions in
the requested wallet participate; proposals do not. Preserve default cash wallet
and opening-balance APIs; add account creation for planned cash/bank/UPI types.
Reuse existing safe BigInt-backed money aggregation and reject unsafe totals.
Sources: reference wallet.ts/baseline_1_6, Plan S8, DATA_MODEL accounts, existing
money guards; high confidence. No libraries/APIs added. Blast radius: new pure
wallet use cases, real-storage tests, full wallet-equivalence audit regression.

## S9 backup/restore (2026-11-04)

Port reference five-table ledger snapshot and allowlisted setting, SHA-256
payload integrity and explicit unredacted-data warning. Snapshot and replacement
are serialized storage capabilities, not core SQL or AI tools. Read consistent
snapshot in one read transaction; restore all ledger tables in one write unit,
child-first deletion/parent-first insertion, so malformed rows/FKs roll back.
Retain reference backup envelope/format identifier and camelCase metadata for
behavior preservation; database/ledger row keys stay snake_case.

Research: reference backup.ts/baseline_1_7, official Node crypto createHash,
Zod 4.6.7 official API (strictObject, safeParse, number bounds, enums), SQLite
atomicity and docs/PRIVACY. High confidence for checksum/integrity and atomicity;
checksum is not authentication or encryption. Add strict envelope/row validation,
allowlisted settings on both directions, signed-safe paise checks and embedded
audit snapshot validation before any destructive work. Accept supported current
schema v2 only; older foreign backup conversion is not silently guessed.

Blast radius: storage-only backup module and schema validation, two snapshot
capabilities on the Node store; core LedgerStore remains unchanged. Counterparty
and setting query mappings added solely to preserve existing stored backup data.
No new privacy use cases or secure-storage implementation. Zod pinned 4.6.7.

## S10 allowance and G1 parity (2026-11-04)

Preserve baseline_1_8 inputs/results and truncation-toward-zero allowance. Optional
omitted date uses injectable clock and explicit Asia/Kolkata Gregorian/Latin
Intl formatToParts; explicit date remains deterministic and does not read clock.
Sources: reference allowance.ts/baseline_1_8, Plan S10, MDN Intl/Date.UTC and
existing money guards. MDN confirms Date.UTC maps years 0-99 to 1900-1999, so use
Gregorian leap arithmetic instead of copying that historical reference bug.
Support years 1-9999 only. Compute disposable/division with BigInt and range-check
returned integers; canonicalize sub-paise negative quotient to 0, not -0.
High confidence, no dependency. Device Intl parity remains Phase I. Blast radius:
new pure allowance module, barrel and tests. Add original 1000-entry create-use-
case audit/sum regression to finish baseline_1_1, not merely direct SQL sum.
G1 requires all eight layer-one equivalents in CI and explicit owner sign-off;
this is not 50%, backend readiness or permission for UI/privacy-phase progress.

## Phase D / S11 sensitive ingress (2026-11-04)

Owner explicitly authorized: "Approve G1, continue backend" in this conversation.
G1 is owner-approved; G2/G3 are not. S11 implements a pure framework-independent
classifier and a guarded callback boundary, not an AssistantService or ingestion
pipeline. No independent subagent facility is available; research/cross-verification
and bounded security self-review are performed sequentially, not called external review.

Research angles: (1) MDN String.normalize and Unicode property escapes describe
NFKC compatibility folding and Unicode-aware letter/mark boundaries; (2) the
read-only reference sensitiveFilter.ts and layer2.privacy.test.ts preserve static
reason categories and English/Hinglish/Devanagari patterns; (3) OWASP Logging
Cheat Sheet warns against authentication/password/payload logging and untrusted
event content. Cross-check with docs/PRIVACY and Plan S11. High confidence that
pure detection plus no-callback-on-drop avoids side effects at THIS boundary;
not proof of future channel/device/provider zero trace.

Approach: inspect unknown without coercion, normalize only a temporary in-memory
copy with NFKC, remove format controls, match explicit sensitive terms with
Unicode letter/mark boundaries, return static reason codes only. Reject nonstring
and blank input fail-closed (intentional safer deviation from reference's false).
Preserve reason categories; include auth/security/verification code variants.
Do not return/store matched text, credentials, or offsets. Guard callback never
receives rejected input. No diagnostic sink or persistence dependency is accepted.

Blast radius: new core/privacy/sensitiveFilter.ts + tests, core barrel, documentation.
No current assistant/parser/message-store call sites exist (searched source);
future S17/S27d must invoke this boundary BEFORE persistence/logging/network and
prove the real entry points separately. Exact keywords are not universal secret
or adversarial-language detection; homoglyphs, arbitrary paraphrases, secrets
without contextual labels and runtime memory erasure remain unproved. No claim
that zero trace across all app entry points or G2 is complete. No new dependency.

## S12 pure name replacement (2026-11-04)

S11 exact head 21a2bc8 passed CI41849250052 all five jobs. Next implement only
name replacement, not scrubber, inline-name discovery or provider integration.
Sources: read-only reference redactor.ts/layer2.privacy 2.1/2.3, MDN Unicode
properties, normalize and String.replace, docs/PRIVACY. MDN confirms callback
replacement avoids `$&` interpretation on reversal; Unicode letters/marks/digits
prevent substring or Devanagari matra splits. Confidence high for known-name
replacement, not general anonymization (reference/docs agree).

Use a pure in-memory PrivacyRedactor seeded with ordered canonical names;
registerCounterparty returns stable Person_N within that mapping, case-insensitive
duplicate reuse, longest-first exact Unicode-token replacement and reversible
reply placeholders. Reserve Person_N in registered names to prevent cascading or
ambiguous token mappings. Keep copy-on-read mappings. No core DB/Node import and
no synchronous persistence port: later AssistantService must seed mappings from
async persisted counterparties, retain canonical order and keep them local. A
restart without the same seed is NOT persistent identity proof. This deliberate
split replaces the reference's synchronous DB constructor. Unknown names/aliases,
misspellings and raw notes remain unsafe and must not be sent by default.

Blast radius: additive core privacy/redactor.ts, its tests and barrel only.
No existing agent/parser/provider callers. Future S13 composes scrubbing; S15
adversarial cases and S27d real outbound integrations remain separate steps.

## S13 identifier scrubber (2026-11-04)

S12 head70641dd CI41849814147 all five green. Research: reference redactor.ts
scrubbing sequence and layer2.privacy 2.2, MDN replace/normalize, OWASP Logging
Cheat Sheet data-to-exclude (bank/card/phone identifiers). High confidence in
explicit pattern removal; no source supports universal unstructured-data secrecy.
Use pure scrubOutboundText; NFKC + existing Devanagari digit normalization and
format-control removal, then whole UPI URI, labelled references, VPA/email-like
handles, IFSC, labelled/masked accounts, Indian phone and >=9-digit standalone
sequences (including grouping). Replace whole identifiers, not truncation. Broad
VPA/long-number matches intentionally over-redact; amounts/date text unchanged in
ordinary cases. Do not silently claim support for arbitrary percent-encoded URIs,
all numeral scripts or indirect identifiers. Notes remain local by default.

Blast radius: new scrubber module/tests + barrel; PrivacyRedactor.redactText calls
scrubber before names, as in reference. Existing name tests/full suite rerun.
No actual provider boundary yet; structured context/notes allowlists belong to
S27d and cannot be inferred from string scrubbing. No new dependency.

## S14 diagnostics minimization (2026-11-04)

S13 headf688e75 CI41850324160 all five green. Research angles: OWASP Logging
Cheat Sheet data exclusions/verification (retrieved chunk2), reference
safeTelemetry.ts/layer2.privacy 2.5, docs/PRIVACY. Reference structural secret
patterns do not remove arbitrary names/notes, and recursive serialization reads
getters, error properties and causes. A regex denylist alone cannot satisfy S14.
Use stricter codebook-only diagnostics: five fixed event codes; all other message
text replaced, ALL arbitrary metadata/error/stack/context omitted before traversal.
SecretSanitizer retains public methods but registerSecret need not retain keys
because all free text is discarded; document deliberate behavior deviation.
No generic raw payload serializer is provided. High confidence in exclusion by
construction; diagnostic usefulness is reduced intentionally, not a silent claim
of equivalent free-text logs. Operational errors must still propagate to callers.

Blast radius: additive core/privacy/safeTelemetry.ts, barrel/tests only. Preserve
SafeLogger info/warn/error/log/dumpText and CrashReporter capture/get/dump entry
points. Inject clock (default Date), return copies rather than internal mutable
records, bounded last100 records with monotonically increasing crash IDs. No
console, disk, network or SDK sink; app/platform crash handlers are later wiring,
not device proof. Do not feed dropped sensitive messages to diagnostics at all.
Provider keys/Telegram tokens/unknown names, cycles/getters/proxies tested as
omitted values. Backup settings exclusion remains separately tested in storage.

## S15 adversarial names and honest limits (2026-11-04)

S14 head0cb6be5 CI41850901501 all five green. Read reference extra.nameLeak and
extra.hinglish cases plus Unicode UTS39 rev34 (18.0.0, 2026-08-27), MDN normalize/
Unicode boundaries and docs/PRIVACY. Sources distinguish normalization from
confusable detection; do not claim Unicode security conformance or general NER.
Reproduce known-name fullwidth/format-control normalization mismatch and raw
Person_N token collision before fixing. Expand tests to known lowercase,
Hinglish/postpositions, Devanagari matras, literal names in notes, aliases/typos,
and basic cold-start payment constructions from the reference.

Approach: normalize registered-name matching consistently with outbound copies;
mask pre-existing Person_N tokens before replacement; sensitive text returns empty
before name discovery; add bounded-pattern, stopword-filtered inline discovery
for clear English payments/owes, Hinglish and Devanagari postpositions. Discovery
only changes local in-memory mapping, not DB. Exact known-name registry remains
primary. Heuristics intentionally may over-redact and do NOT cover all names,
misspellings, nicknames, scripts, paraphrases or malicious homographs. Unknown
free text and notes stay local; later provider boundary must enforce policy.
No new model, parser package, dependency or real financial data.

Blast radius: redactor only, new adversarial tests and documented limitations.
No provider/persistence exists to wire now. Full extra multi-turn/device/zero-trace
reference tests remain pending S27d/S35; pure tests cannot count those as ported.

## S16 fail-closed privacy CI (2026-11-04)

S15 headb9253c5 CI41851645643 all five green. Official Vitest5.1.0 reporter docs
and an installed-version probe show JSON now writes a file by default; do NOT
assume JSON stdout or an undocumented numRuntimeErrorTestSuites field. Node24
child_process docs support argument-array spawnSync with timeout/maxBuffer.
Cross-check installed JSON evidence, current workflow and Plan S16.

Replace permissive bootstrap command with a Node-native TypeScript runner. It
runs the pinned Vitest CLI with the existing non-live privacy-name selector,
reads a JSON report from a fresh OS temporary directory and deletes it in finally.
Require successful process/report, nonzero passing tests, no failures and actual
passed assertions from ALL five privacy primitive suites (sensitive, names,
scrubber, telemetry, adversarial). Thus metadata selector/self-tests or empty/
skipped suites cannot constitute privacy evidence. Fail closed on child errors,
malformed/missing reports. Print only a static status, never raw failed payloads;
full local Vitest reruns provide developer details using synthetic fixtures.
High confidence for CI enforcement, NOT zero-trace application integration.

Blast radius: development script, package test:privacy command, selector meta-test,
new CI-contract tests and bootstrap workflow description. Existing job graph
already gates test/security on privacy and build transitively; assert it rather
than weakening it. Keep immutable actions and protections. No dependencies,
agent-tooling rewrite, application logic, migration or UI changes in this step.

## S17 notification ingress (2026-11-04)

Owner authorized autonomous backend progression through checkpoints; G2 foundation
limitations remain explicit. Research performed sequentially (no subagent tool):
Android StatusBarNotification.getPostTime API18 documents system posting epoch
milliseconds (NOT Notification.when); MDN Date.parse warns nonstandard formats are
runtime-dependent; Drizzle schema docs plus installed0.45.4 mappings confirm typed
mapping of the existing v2 unparsed_messages table; read-only reference parser and
baseline3.1-3.4 confirm ordering and behaviors. Cross-check docs/PRIVACY/FEATURES.
High confidence in deterministic parser and awaited Node storage behavior, not
Android permission/device integration or all possible bank message formats.

Approach: nonallowed apps dropped before any text/postTime getter; sensitive text
fails closed before all writes, clocks/log/network; reject oversize/unreadable
input, full unmasked accounts and promo-only messages. Normalize temporary text
NFKC/Indic digits/format controls. Strict ISO-Z or safe epoch postTime, no inferred
processing timestamp. Exact positive integer paise; failed transactions create
nothing; refunds/reversals credit special events; regular entries unverified.
Unknown/ambiguous formats enqueue sanitized local text only, no cloud capability.
S18 adds reference/time-window dedup in its own next green step (not claimed here).

Blast radius: new core parsers/notificationParser.ts/tests, additive async unparsed
row port, Node Drizzle query mapping/CRUD of existing v2 table and core barrel.
No migration change. Queue is excluded from backups as before. Test every added
repository method, expired handles, rollback and zero rows for rejected inputs.
Existing ledger/store, backup, audit and privacy callers rerun. No Node imports
in parser, no raw payload error logging, no notification listener or UI code.

## S18 atomic notification deduplication (2026-11-04)

S17 cadaed3 CI41854664678 all five green. Sources: read-only reference matching
logic/baseline3.5; SQLite transactions official docs (BEGIN does not nest, one
writer, read/modify/write within IMMEDIATE); existing serialized awaited adapter,
audits and stale undo. High confidence in atomic Node replay protection tested
with concurrent calls, not separate mobile/device connections.

Use a core transaction-scoped captured-write helper shared with existing ledger
creation (no nested root access). Within one unit, match exact dedup reference
first, else one compatible same-amount/direction normal notification in inclusive
configured window. Restrict candidates to notification source/same wallet; never
merge manual/import rows. Do not merge conflicting known last4 or references;
exact reference/account conflict is a static error; ambiguous time-window matches
are NOT collapsed. Enrich missing account/ref/counterparty only, audit changes
atomically; repeated identical duplicates create no audit. This repairs reference
un-audited enrichment, preserves undo's stale-state rules. Positive/negative tests
first; default5min, configurable safe integer0..1day. Refund/reversal duplicates
use exact reference only, as reference. No-reference equal-value payments within
a short window remain a documented heuristic false-positive risk, not proven
identity; all captures remain unverified for review.

Blast radius: new core parsers/deduplication.ts + tests; internal ledger helper
extraction (existing public behavior unchanged), notification capture call/options.
No adapter/schema/migration/AI/UI changes. Current async list port bounds scope
but scans ledger; indexed candidate-query optimization remains performance work,
not an unmeasured speed claim. Full regression and rollback/undo tests required.

## S19 Excel dry-run/idempotent import — 2026-11-04

Scope: port baseline3.6 on real synthetic xlsx. Dependency and workbook decoding in
Node storage adapter; core receives primitive header/row grid, validates and maps
it without Node/native/framework imports. Pure async SHA256 fingerprints include
wallet + normalized row + occurrence ordinal, preserving identical repeated
source rows while making replay idempotent. Whole valid batch plus audits is one
transaction using the S18 internal unit seam; no nested root reads. Dry-run uses
no store capability at all. Import skips bad rows with static per-physical-row
errors, not raw private cell values or DB errors. Storage errors roll back whole
batch and propagate (never mislabeled row input errors).

Research reconciled SheetJS official version/parse docs with existing reference
and SQLite atomicity contracts: high confidence fixture behavior, no blanket
hostile Excel parser claim. Bound supplied bytes and row/column/text counts;
reject formula cells (including cached values), duplicate mapped headers and
unknown object/coercion types. Support strict text calendar dates and Excel serial
dates in both 1900/1904 systems; reject 1900 fake leap day and time fractions.
Benefit maps reference string enum; BenefitPaise/benefit_paise maps nonnegative
integer paise, not rupees; tag and tags_json preserve reference normalization.
Wallet column, silently ignored by reference, must be checked per row rather than
silently redirect money. Only first sheet as reference; no macro/formula execution.

Planned deviations: async adapter export importExcelBuffer from storage and core
importExcelRows; static errors, no rounding, stronger wallet-aware fingerprints,
strict header/formula/date validation. ZIP-bomb isolation and performance require
explicit negative evidence before advertising untrusted-upload readiness; no UI
upload introduced. Full checks + audit-failure/concurrent replay tests required.

S19 pre-publication review found byte/sheet limits alone do NOT bound ZIP expansion.
Mitigate within importer adapter now: snapshot bytes, validate a strict ZIP32
subset with stored/deflate entries, bounded Node zlib expansion and CRC/size/header
consistency, max128entries/16MiB actual expanded total, reject ZIP64 extras and
orphan/overlapping local records. PKWARE spec and installed SheetJS reader agree
on field offsets/descriptor usage; bounded inflater not custom compression code.
Test failed zip expansion/header preflight first, including forged sizes and CRC.
This is a bounded decoder check, not comprehensive parser-security certification.

## S20 fake OpenAI-compatible provider — 2026-11-04

S19 exact3b01eb5 CI41857459215 fivegreen and protected PR15 merge6e44d40.
Scope tests/helpers only, deliberately no production agent/DB/credentials. Red
missing helper first; then real loopback HTTP tests of JSON/tools/usage, status
401/429/400/500, route/malformed/oversized input, streamed fragmented SSE/DONE,
truncation/socket abort/delay/cancellation and forced cleanup. Scripted responder
receives only synthetic in-memory request captures; these are test assertions,
NOT production logging APIs. Bound body64KiB; responder failure static500 without
exception payload. Node official lifecycle/MDN frames and reference agree; no
claim real API interoperability until S21/S27. New helper is test infrastructure,
not excluded production code or an application server/preview.

## S21 provider adapter/key fallback — 2026-11-04

Scope new packages/agent: credential pool + bounded OpenAI-compatible JSON/SSE
adapter, schema validation with pinned Zod4.6.7, package/project wiring. No model
framework, tools, DB/audits, telemetry storage or real endpoint calls (S22+ later).
Missing module reds before each module, reference4.1/4.2 equivalents via real fake
HTTP. Verify400 no fallback,401 permanent disable,429 bounded cooldown incl
Retry-After seconds/date, others per-key fallback, no candidates one static error,
truncated stream reset before next attempt (also clear on final failure/abort),
fragmented UTF8/CRLF/multiline/comment/usage/tool deltas. Strict subset text-only
single choice, bounded8keys/64messages/16tools/64KiB request/1MiB response, no n>1.

Research agrees on protocol and HTTP semantics; model-specific availability and
Expo Web Streams remain unverified (real device later). Inject transport/clock;
use fetch redirect:error (never forward credential to redirect), HTTPS except
exact loopback HTTP for fake tests, URL without userinfo/query/fragment. Keyless
empty config omits Authorization. No raw provider body/exception/cause in failures,
private credential fields and static safe failure enums; validate before network.
Known-sensitive messages rejected at adapter boundary (not universal name/notes
redaction: AssistantService must gate/redact future outbound context). Callbacks
are application failures, not a reason to retry/bill again. Overall deadline and
caller abort never try another key. Complete tool-call JSON returned only, never
executed. Keep unknown usage zeros, don't invent billable tokens. Analytics S24
must explicitly validate metadata without financial write capabilities.

## S22 validated six-tool catalog — 2026-11-04

S21 exact1607336 CI41860787302 fivegreen; protected PR17 merge precedes this step.
Scope agent tools only: one draft capability and five read-only tools using two application query ports with Zod strict input/output schemas and snake_case names. Schema to
JSON Schema from current official docs, runtime refinements guard integer paise,
negativezero, split<=amount, calendar/month ranges and bounded limits. Malformed,
sensitive, unknown or user-only calls rejected BEFORE any application port call.
Draft accepts stable Person_N only, resolves locally, createProposal pending only;
local helper can return full ProposalRow to app, tool result is minimal projection.

Read-only registry receives listTransactions/getWalletSummary query functions,
never raw DB or repositories. Tests wire those to actual core/store.read use cases.
Project names as placeholders; omit notes/accounts/reference/raw IDs entirely.
Freeform category labels are NOT privacy-safe: return only built-in category
vocabulary, coalesce unknown labels into other, never infer anonymity. Find-person
accepts placeholder not raw names. No arbitrarySQL/dynamic property dispatch or
write capability in QA object; unauthorized calls fail with static errors. Strict
projections validate every output and hide storage failures; no provider calls.

Reference helper aliases get_category_breakdown/list_recent_transactions are
replaced by catalog get_month_summary breakdown/query_transactions (same read
behaviors, not extra advertised tools). Full physical-readonly/QA loop proof S23,
not preclaimed here. Balance uses existing wallet cash-movement semantics, not a
new debt/repayment accounting engine. O(n) list query cost remains unmeasured.

## S23 research/verification gate — 2026-11-04

Scope: agent/qa_loop plus existing storage connection factory and wallet-summary
read-only port narrowing; no UI/.agents or policy/history/analytics integration.
Sequential three-angle review (no subagent tool available): official SQLite and
Node lifecycle semantics, reference real loop, failure modes (reversible PRAGMA,
non-cooperative provider/query, unknown usage, write tool injection). Sources in
references.md agree: readonly constructor plus query_only and no SQL handle;
migrations exclusively writer-side. Current-schema existing files only. Tests
inspect actual factory-owned connection and attempt SQL writes, not only types.

Agent builds its own QA-only registry from query ports (cannot inject draft tool
registry). Bounded steps/completion cap/deadline/inputs; no raw errors. Race async
provider and query execution against combined caller/deadline cancellation. No
network under a storage read transaction. Strict validated options; sensitive
question dropped before redactor/provider/query effects; local name redaction and
minimal tool projections. Reported usage exhausted/unknown stops before tools or
answer. One call can incur input tokens beyond remaining budget; do not claim an
exact tokenizer/billing cap. Hostile synchronous callbacks cannot be preempted in
Node; supplied trusted adapters must yield. Actual full pipeline S27d/e remains.
TDD first missing-module/readonly export failure; then adversarial fixtures/full
quality and exact-head CI protected merge. G3 owner approval recorded, technical
criteria still required before G3 completion.

## S24 verification gate — 2026-11-04

Scope: metadata-only analytics decorator around S21 client, core row/port types,
storage mapping/append+list methods using existing operational table. No financial
repo/schema migration/UI/agent SQL handle. Three sequential angles: OWASP official
allowlisting, Drizzle installed0.45.4 and official parameterization docs, reference
layer4.6 success log and failure risks. Preserve success fields, no payload input to
sink; enforce strict storage schema and static error. Configured public metadata
must not alias any configured secret (including cross-key aliases). Add red-first
regression, do not assume bounded strings anonymous. Application explicitly opts
into decorator. Logical completed requests only; invalid/sensitive/provider-failed
requests produce no analytics, failures use existing codebook diagnostics instead.
Usage unknown/unpriced outcomes explicit; no made-up pricing or retries on
persistence failure. BigInt rounded integer cost with overflow rejection. Operational
analytics excluded from financial backups, not accessible to QA registry. Actual
S20/S21 HTTP and storage tests required. No raw errors or independent-review claim.

## S25 verification gate — 2026-11-04

Scope: agent LangChain completion bridge and QA adapter; extract existing S21
request validation without behavior change; exact core1.3.4 dependency in agent
only. Latest main5faf427 owner UI revert preserved; no UI/.agents edits.
Sequential three-angle research: official model API/custom implementations,
pinned native callback-manager source, failure-mode review of tracing/context,
framework retries/caches and malformed tool JSON. No subagent tool available.

Use real BaseChatModel.invoke/_generate/AIMessage, but a private per-request bridge
retains the validated original wire snapshot (no lossy null/developer/tool-call
normalization). Original raw tool arguments survive to S22 validation, never tool
execution in framework. S23 owns tools/step/token/deadline permissions, framework
cannot add tools or a second loop. Explicit no cache/retries; streaming unsupported
on this buffered adapter, remains low-level S21 until safe service integration.

Pinned public CallbackManager subclass: copy returns same restrictive subclass;
addHandler always fails statically before LangChain dispatch can see payloads.
Ambient verbose/tracing/hooks attempts fail closed. Explicit empty metadata/tags/
configurable and restrictive callback manager prevent parent handler inheritance.
No process.env/global manager monkey-patching. Prevalidate/sensitive/abort checks
before any framework invoke; wrapper surfaces static adapter errors except existing
safe provider status/cancellation errors required for fallback semantics. Tests:
actual fake HTTP and read-only store through LangChain, native invoke spy, malformed
arguments, no extra retries, limits/abort and ambient tracing/verbose/inherited
callback non-observation. TDD missing-module red before implementation; full suite,
audit/scan/type/lint/format/privacy/build and exact-SHA CI/protected merge required.
This is a controlled LangChain model adapter, not unbounded createAgent, full
AssistantService, native streaming or verified device bundling.

## S26 verification gate — 2026-11-04

Scope: core type-only LocalModelTasks/runner ports plus agent validating task
adapter, scripted fake in tests only. Separate parse_entry/improve_note local task
interfaces, not tool-catalog expansion. Three sequential angles: Zod official
strict validation and existing money constraints, Node cancellation failure modes,
reference note suggestion/Plan local-only architecture. No subagent tool available.

Runner sees only task, bounded text copy, combined abort signal; no DB, logger,
provider or cloud fallback capability supplied. Sensitive input drops before runner
calls, raw local names permitted; malformed/sensitive model output rejected and
static codes only. Parse returns draft values only, improve_note returns suggestion
only, null means not understood. No persistent effect or approval capability.
Bounded options/deadline/cancellation; non-cooperating async drivers cannot hold
request open indefinitely; synchronous work cannot be preempted, late results are
not accepted after elapsed deadline. UI/model catalog/native runtime not selected.
Tests first missing-module red, fake raw local names/no network/no writes, strict
invalid money/split/field/output, unknown/null, cancellation/timeout/getter/failure
privacy; full suite and protected per-step CI before progression.

## S27 isolated live smoke — 2026-11-05

Scope/done: test tooling only, actual S21 adapter, public Kilo anonymous/free
reply and tool-JSON shape. No app/core behavior or new dependency. Official Kilo
authentication/API docs re-fetched; anonymous :free and current ai-gateway host
agree with previous catalog observation. Vitest include docs re-fetched: separate
include/exclude/config is required because CLI selectors override some filters.
Pinned Vitest5.1.0 remains. Existing normal config already excludes live files
and @live names. Dedicated manual workflow allowed to fail, never a required job.

Blast radius: tests/helpers/keyless_smoke.ts plus deterministic fake-fetch tests,
one .live.test.ts, separate live config, package script and typecheck include,
manual workflow and documentation. No production code or key/environment loading.
Safety: one discovery + at most two completions per invocation, hardcoded origin,
no redirects/credentials/auth, discover zero-price :free AND advertised tool
capability, fixed synthetic payloads, bounded response/time, no retries/alternate
model or paid fallback.429 exits cleanly before any more requests. Independent
invocations/IP users cannot share an in-process rate counter; respect actual429.

Red: missing helper/config/workflow before implementation. Then deterministic
success/shape/catalog eligibility/no auth/exact endpoint/429 at every stage/body
bounds/network failures/normal-CI exclusion tests. Real smoke only after safety
suite green. Public availability may fail; record honestly, never silently switch
protocol fields to force green. No subagent tool available; sequential review of
primary docs, provider/key-pool source and test-discovery consumers performed.

## S27a history persistence — 2026-11-05

Scope/done: additive framework-free history rows/async port/start+record use cases,
SQLite migration3/Drizzle mappings/repository behind existing serialized native
connection. Each message source app/cli/telegram, conversation FK, user/assistant
role only. No AI invocation/tool wiring/preferences/rules/channel/UI changes.
Research: official SQLite foreignkeys and stricttables pages confirm FK must be
enabled per connection and STRICT alone does not enforce semantic constraints.
Official Drizzle select docs confirm explicit order/limit and bound eq; installed
0.45.4 retained (docs also promote1beta, no upgrade). Existing better-sqlite3
13.0.3/SQLite3.53.4 pinned, no new dependency. Reuse existing enqueue/transaction
scope; don't create a competing connection/queue or await native transactions.

Design: host supplies bounded IDs/canonical UTC millisecond timestamps; core
parses/clones exact shapes, content1..8192/no NUL, role/source allowlists. Sensitive
messages rejected before DB by both use case and repository. Stored raw names
stay local, no redaction/cloud context building in this step. Read recent max100
rows, deterministic (created_at,id), latest N messages returned chronologically.
No delete API, memory/vector learning, automatic retention, or model authority.

Blast radius: new core history module, storage history module and schema3, additive
OperationalStore.history facade sharing serialized scope, migration tests/docs.
Read-only QA facade does not gain history/write capability. Existing ledger-only
backup v1/schemaVersion2 remains byte-contract compatible: DB schema version and
payload version are different. Backup does NOT include history; restore touches
only ledger/settings, preserves local conversations. Explicit test/documentation;
no silent full-DB-backup claim. History backup/encryption/device work remains later.

Red before implementation: missing core history module plus schema3/port/store
integration. Then minimal green, migration2->3 preserve/idempotence/rollback,
strict SQL FK/source/role/body checks, cross-channel restart/ordering/limits,
sensitive zero calls/zero rows, cloned queued input/output, static SQL errors,
queue/reentrant/closed boundaries, ledger backup compatibility/full original tests.
No subagent available; primary docs/source/consumer risks reviewed sequentially.

S27a ordering review correction before publish: (created_at,id) can put an
assistant before its user when timestamps tie or the clock moves backwards.
Added a correct failing regression. Official https://www.sqlite.org/autoinc.html
confirms INTEGER PRIMARY KEY aliases a durable ROWID and automatically allocates
max+1 for our append-only, never-explicit-sequence path. Use an internal sequence
(not AUTOINCREMENT: no deletion/cursor lifetime reuse requirement). Message IDs
stay unique externally; sequence is not accepted from callers/exposed in rows or
backups. Index (conversation_id,sequence), recent N reversed to append order.
Conversation overview remains bounded (created_at,id). Host timestamps are metadata,
not ordering authority. No model/host can override sequence through the port.

## S27b preferences — 2026-11-05

Implement structured tone neutral/friendly/formal, language english/hindi/hinglish,
detail concise/balanced/detailed. Defaults neutral/english/balanced. No free-form
system prompts or permission settings. Core async preference port/use cases;
existing serialized app_settings key assistant_preferences (no schema bump),
strict bounded JSON on read; missing defaults, corrupt fails closed. Backup remains
ledger-only and preserves/excludes this key. Add OPTIONAL validated preferences to
Q&A options; static presentation context appended after immutable safety policy.
Persist->read->real fake-HTTP LangChain QA test must show actual system context,
not merely formatting. Default wire remains unchanged. Service later reads prefs.
Official Drizzle insert/upsert and Zod API docs re-fetched; bound values/conflict
update and strict optional schema supported in installed0.45.4/4.6.7, no new deps.
Scope core/storage/QA options/tests only. Red before code, then defaults/enum
cross-product/injection/clone/SQL errors/restart/backup/context integration and
full checks. No independent agents available; docs/source/consumers reviewed.

## S27c structured rules — design/research 2026-11-05

Official Drizzle insert/upsert and Zod strict API reviewed this turn (S27b), retain
pins/no new libs. Reviewed ASSISTANT/AGENT_POLICY: free text cannot become policy,
all proposals require approval, authentication precedes model, paired Telegram is
mandatory even with no custom rule. Implement exact union of two presentation
behaviors (amounts_in_rupees,short_summaries), allowed_sources condition and
paired_telegram_only reminder. Max16/unique rule IDs/source enums, no free strings,
thresholds/auth secret/disable-approval rule. Core parser/async port/use cases and
code evaluator of trusted origin source/authenticated/paired_telegram. Host—not
message/LLM—must supply verified origin. Telegram pairing never weakens; explicit
rules add restrictions only. Existing serialized settings key assistant_rules;
legacy ledger backup excludes/preserves rules. Optional rules+origin QA context:
reject conditions BEFORE redactor/provider/tools; presentation context static,
existing policy remains. Default no rules/origin behavior unchanged. Red per layer,
real persistence->HTTP plus unauthenticated/unpaired/denied-source zero-call tests;
then full suite/100% coverage/protected CI. Not channel authentication implementation
or shared-service completion (S27d/S28 still next), no independent reviewer claim.

## S27d shared service — 2026-11-05

Core port with explicit question/draft_entry/improve_note fixed workflows; verified
transport origin separate from untrusted request. Reject auth/pairing/sensitive
before ALL storage/model effects, then stored conditions before history/preferences
context. No guessing auto-routing/cloud fallback. One serialized service queue,
whole-request elapsed/abort bounds, strict request/results, static failures.
History needs additive ensureConversation (idempotent, no metadata overwrite),
then globally unique request IDs reject replays before inference. Recent6 turns
only, each re-filtered/redacted/scrubbed as untrusted data by QA; not arbitrary
system roles. Existing policy/preferences/rules/limits remain authoritative.
Draft uses validated local task + existing propose_transaction registry validator
and core createProposal pending only. Guard inside native queued transaction
before/after work prevents late cancelled proposal commit; no approve capability
enters model/tool surface. A recorded accepted user turn may remain after a failed
or cancelled computation; no rollback/SQL preemption/privacy-certification claim.
Note suggestions remain local and never overwrite a ledger note. Native provider/
LangChain/local/SQLite APIs already documented/pinned; Node AbortSignal.any docs
consulted inS26. Tests must use actual ports/adapters, not only isolated helpers.
Notification worker uses deterministic existing parser first, invokes local parser
only on explicit unknown route, and can create pending proposal only, never an
AI-confirmed ledger transaction. No notification-to-cloud route. No new library.

## S27e policy acceptance — 2026-11-05

Test-only conformance of existing permissions, not a new model workflow. Review
six AGENT_POLICY acceptance bullets and real importer/notification/shared-service/
read-only registry paths. No new dependency/library API. Add PA01..PA06 real native
DB/fake HTTP assertions plus evidence-map existence regression (missing doc red).
No fabricated behavior red: already-implemented safety is expected green; malicious
model outputs explicitly request forbidden actions. S31 will separately mutate six
production rules to prove regressions detect disabling. No prompt-only security,
independent-review or full injection-resistance certification claim.

## S28 Telegram connector design — 2026-11-05

Official https://core.telegram.org/bots/api fetched successfully via Node fetch
(HTTP200; fetch_page itself403). Read making-requests/getUpdates/sendMessage/
Update/ResponseParameters: HTTPS bot-token path + JSON POST; Boolean ok/result;
getUpdates limit1..100/positive long poll/offset highest+1/message-only updates;
409 conflict halts for operator, 429 retry_after requires waiting; sendMessage
plain text max4096, no parse_mode. No Telegram SDK/new dependency. Node24 fetch,
existing pinned Zod4.6.7 retained. Official tdlib/telegram-bot-api README also read.

Token and metadata supplied by explicit secure-host port, never app_settings,
backup/history/analytics. Platform Keystore implementation remains Android work,
not a backend encryption claim. Host supplies cryptographic one-time code generator
(test deterministic), 5-minute expiry/max5 attempts. Private-chat lock from verified
getUpdates only; no public unauthenticated update handler. Other chats ignored;
sensitive before assistant/content storage, cursor-only transport bookkeeping.
Primary-device gate, one in-flight poll;409 latches conflict (no retry),429 caller
must respect returned retry delay; no busy retry loop. Token/URL/server body errors
never escape. Signal and whole-response30s bound/1MiB. Shared bounded HTTP reader
reused without changing existing provider behavior. Replies plain text/truncated,
only exact paired chat. Digest is deterministic count/paise, no notes/names/AI.
