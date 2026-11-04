# G1 — Core logic readiness report

Date: 2026-11-04. **Ready for owner review; not signed off.**

## Verified code and CI

- Implementation commit: `c989e99e122a15581ac820324d576338bbdf173e`.
- CI: https://github.com/OnlyXianzo/Vittaz/actions/runs/41843604522 —
  quality, privacy, test, security and build all succeeded.
- PR: https://github.com/OnlyXianzo/Vittaz/pull/6.
- **55 tests pass** across 13 test files; **100%** statements, branches, functions
  and lines for implemented core/storage source. Coverage is not product progress
  and does not include agent tooling or device/runtime guarantees.
- Fresh dependency install, tests without dist, lint, typecheck, formatting,
  build and CLI smoke test, npm audit (0), and history/working-tree scan (0) passed.
- Privacy CI is still explicitly a bootstrap check, **not G2 zero-trace proof**.

## All eight layer-one reference equivalents

| Baseline | Verified behavior                                                                        | Tests                                 |
| -------- | ---------------------------------------------------------------------------------------- | ------------------------------------- |
| 1.1      | Safe integer paise, exact parsing, SQL sum, 1000 real creations with one audit each      | core money/status; storage migrations |
| 1.2      | Empty migration, v1→v2 preservation, repeat-safe and failed-upgrade rollback             | storage migrations                    |
| 1.3      | Proposal writes zero transactions; approve one, repeat once, reject none; atomic batch   | core approval                         |
| 1.4      | Manual confirmed; captured unverified; adjacent forward-only statuses                    | core status                           |
| 1.5      | Atomic audits; exact transaction/proposal/wallet restoration; stale undo rejected        | core audit/wallet                     |
| 1.6      | Cash opening + in − out; other wallets/pending proposals excluded                        | core wallet                           |
| 1.7      | Five-table restore equivalence, warning, checksum rejection, strict validation/rollback  | storage backup                        |
| 1.8      | Hand-worked allowance, month/leap/century boundaries, overspending, India injected clock | core allowance                        |

Full file mappings and original reference locations: `docs/reference_inventory.md`.
The reference checkout was read only, not run or imported as application code.
This is eight baseline families, not a claim that all 31 reference checks pass.

## Architecture and safety

- Core is framework/driver independent and contains no Node API imports.
- Async repository ports; private Node connection, serialized operations,
  awaited transaction units, rollback, reentrancy rejection and expired handles.
- Drizzle 0.45.4 / better-sqlite3 13.0.3; native package includes prebuilds.
- Legacy benefit/tags preserved alongside independent benefit_paise/tag columns.
- ID/clock injection; exact safe arithmetic, no monetary negative zero.
- Owner Rule15 and restored agent tooling preserved without .agents changes.
- Review: owner PR5 comments addressed by rebase and merged; bounded self-review
  for current code in `docs/code_review.md`. No new independent-agent review claimed.

## Limits and release decisions

1. Backup is **plaintext**, contains names/notes and has only a corruption
   checksum—not encryption or authentication. Encryption/recovery release decision
   is in DECISIONS.md. Only current schema-v2 envelopes validate; older foreign
   backup conversion is not implemented. Notifications/analytics and nonallowlisted
   settings are intentionally excluded, matching reference scope.
2. Node storage tested, not Expo/Android adapter/device parity. Native SQL mappings
   do not prove device behavior. Mobile runtime must supply compatible ID/clock APIs.
3. No sensitive filter, name redaction, scrubber, safe logger or zero-trace proof
   yet. Do not connect real user messages/credentials to unimplemented pipelines.
4. Ingestion, agent tools/providers, full CLI journeys and headless integration
   remain later work. No AI has been given direct repository/backup capabilities.
5. UI/canvas untouched. **G3 is not satisfied; frontend work is not authorized.**
6. No mutation-test campaign or new external security audit is claimed.

## Required owner action

Review and sign off **G1** before Phase D (S11 sensitive filter). This report does
not itself grant approval or waive any later gate. S1–S10 implemented is not a
reliable percentage of the whole product and is not backend readiness.

## Owner decision — 2026-11-04

Owner explicitly approved G1 in conversation: **"Approve G1, continue backend"**.
This authorizes Phase D starting with S11. It is not G2/G3 approval, an independent
security audit, or permission to implement UI. The additional owner-review audit
was cancelled before completion; no G1_OWNER_REVIEW.md report is claimed.
