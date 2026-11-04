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
