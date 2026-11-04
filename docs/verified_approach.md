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
