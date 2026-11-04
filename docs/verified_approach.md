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
