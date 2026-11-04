# G2 — Privacy foundation checkpoint

Date: 2026-11-04. **Phase D implemented; G2 subsequently accepted by owner (decision below).**

## In plain language

G1 was approved by the owner with **"Approve G1, continue backend"**. S11-S16
now provide the privacy building blocks: reject sensitive messages, replace known
names, remove common payment identifiers, and prevent private text from entering
diagnostics. CI enforces their tests before later jobs run.

The next planned task is S17 notification parsing. **Do not start S17 until the
owner approves this checkpoint.** G3/backend readiness and frontend authority are
not granted. Accepting this Phase D checkpoint must not waive later integration
privacy tests or mean that real user messages are safe to connect now.

## Exact implementation and remote proof

- Rebased implementation: `26ffd20bdf51e066e2f6aae54a8e8c5284b3091d`.
- PR: https://github.com/OnlyXianzo/Vittaz/pull/11.
- CI: https://github.com/OnlyXianzo/Vittaz/actions/runs/41852883630 —
  quality, privacy, test, security and build all succeeded.
- Owner merged S11 PR9 as `f7f3561d4f2365a0b63b1ba567e6aa0c64d2f5f2`.
  Owner comment6633473106 reviews S11 only, not independent execution or S12-S16.
- Owner concurrently merged PR10 as main `3db9401`. Remaining privacy work was
  rebased onto that main, preserving the owner's separate UI files and exclusions.
  This agent did not open/review/edit that UI or grant G3 approval. The repository
  now contains owner-authored UI; "no UI exists" would be inaccurate.
- Each original implementation step passed its own pre-rebase CI:
  S11 `21a2bc8` /41849250052; S12 `70641dd` /41849814147;
  S13 `f688e75` /41850324160; S14 `0cb6be5` /41850901501;
  S15 `b9253c5` /41851645643; S16 `af00019` /41852428053.
  Current rebased combined implementation is independently identified above.

## What is implemented and tested

| Step | Code                                                        | Meaningful test evidence                                                                                                                                                                                                                                                                |
| ---- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S11  | `packages/core/src/privacy/sensitiveFilter.ts`              | Eight tests: English/Hinglish/Devanagari terms; NFKC/format controls; no coercion; static reason codes; rejected messages invoke no downstream DB/log/network callback                                                                                                                  |
| S12  | `packages/core/src/privacy/redactor.ts`                     | Five redactor tests: stable seeded mappings, case-insensitive duplicates, longest-first exact boundaries, literal regex/replacement text, Person_1 versus Person_10 reversal, defensive copies                                                                                          |
| S13  | `packages/core/src/privacy/scrubber.ts`                     | Seven tests: full UPI URI, labelled references, VPA/IFSC, masked/grouped/fullwidth/Devanagari accounts, phones, long nontruncated digits and redactor composition                                                                                                                       |
| S14  | `packages/core/src/privacy/safeTelemetry.ts`                | Six tests: unknown/registered synthetic credentials/names/notes omitted; no getters/Proxy/coercion/causes traversed; only fixed events; copy protection; bounded100 entries; no console sink                                                                                            |
| S15  | `packages/core/src/privacy/adversarial_names.test.ts`       | Eight tests: reproduced/fixed compatibility and format-control name leak, token impersonation, lowercase/Hinglish, matras, cold-start clear payment patterns, sensitive drop before discovery; documented unknown-alias/confusable limits                                               |
| S16  | `scripts/privacy_check.ts`; `tests/privacy/ci_gate.test.ts` | Four tests: five required passing primitive suites; missing/empty/skipped/failed/live/meta-only evidence rejected; actual copied CLI with synthetic success/child failure/missing or malformed report/zero-count fixtures; cleanup and no child payload echo; workflow dependency graph |

Tests first failed for missing modules (S11-S14/S16). S15 first reproduced real
normalization/token/cold-start failures; its Hindi honorific regression was fixed
and the entire suite rerun. Details and bounded self-review: `docs/code_review.md`.
No new independent-agent review or external security audit is claimed. CodeRabbit's
PR9 automatic-review-skipped message is not a review.

## Commands actually executed

Using Node24.22.2 / npm11.19.1 and existing pinned lockfile:

- `npm ci` — fresh installation succeeded, audit0; native prebuild used, no Python
  application/native build introduced. Original Python developer tooling preserved.
- `npx vitest run <new_test_path>` — red evidence for each step before production
  implementation; S15 assertions reproduced concrete failures.
- Deleted generated `dist` directories before `npm run test:coverage` — **93 tests
  across19files pass**, **100% statements/branches/functions/lines** for implemented
  core/storage source. Repeated after rebase; no built output masking imports.
- `npm run lint`, `npm run typecheck`, `npm run format:check` — pass.
- `npm run test:privacy` — pass; **38 selected tests** (34 primitive +4 CI tests).
  The old metadata selector test no longer counts as privacy evidence.
- `npm run build`; `node apps/cli/dist/main.js` — pass; CLI version smoke only,
  NOT add/import/ask/full CLI journey evidence.
- `npm audit` —0 vulnerabilities; `npm run secret:scan` —0 actionable history/
  working-tree findings. Scan success is not a comprehensive security audit.
- `git diff <current_main> --name-only -- apps/mobile .agents AGENTS.md` — empty
  for this privacy work. Owner-authored concurrent changes preserved.

Coverage does NOT include development runner/agent tooling, future agent/provider
packages, UI, Expo/Android runtime behavior, device crash SDKs or a mutation-test
campaign. No all31-reference-checks,50%-product-completion or backend-ready claim.

## Important limitations — do not treat as resolved

1. **No app-wide zero-trace proof.** S11 proves its guarded callback is not invoked
   on sensitive input. Actual notification/assistant/Telegram/history entry points
   and provider requests are later work (S17/S27d/S28), not tested by callback spies.
2. **Not complete anonymization.** Known names and basic payment constructions are
   covered, not all nicknames, typos, transliteration, mixed-script homographs or
   indirect identity. Limitation tests intentionally show unknown values unchanged;
   that output is NOT declared cloud-safe. Unknown/uncertain free text and raw
   notes must stay local; later outbound payload allowlists must enforce this.
3. **Mappings are local in-memory.** Same ordered seed preserves Person_N identity;
   async persistence/restart/multi-turn mapping integration remains S27d/S35.
   Redact raw input once; already-redacted Person_N tokens must not be fed back
   through the raw-input redactor. Reply reversal stays on-device.
4. **Scrubbing is pattern-based.** Conservative matches can over-redact. Arbitrary
   encoded formats and every numeral script are not supported. It is not a secret
   classifier or an outbound schema/notes policy by itself.
5. **Diagnostics deliberately omit free text/stacks/context.** Only five fixed
   operational codes survive; less diagnostic detail is an explicit privacy
   tradeoff. Actual ingress error routing/device crash SDKs are not wired.
6. **Backups remain plaintext**, containing private ledger names/notes. SHA-256
   detects corruption, not encryption or authenticity. Current schema-v2 only;
   older foreign conversion absent. Encryption/recovery remains an owner release
   decision; excluded settings/notifications/analytics remain excluded.
7. **Node evidence is not Expo/Android parity.** No device/Keystore/storage/crash
   reporter proof or approval of G3/G4. No real accounts/messages/credentials used.

The six layer2 baseline integration families are not all marked ported merely
because these primitives pass. Original provider/notes/zero-trace/multi-turn
reference assertions remain pending in `docs/reference_inventory.md`. They must
be proved at their real dependent steps before backend acceptance at G3.

## Owner decision and next work

Please review the Phase D primitives and their explicit integration limitations.
Only the owner can approve G2 and authorize continuation to S17. If the owner
requires additional privacy evidence first, retain the pause and address that
specific scope; do not silently reinterpret or waive it.

After explicit G2 acceptance: S17 notification parser, then S18 deduplication and
S19 importer, with synthetic fixtures and privacy blockers. Each later ingress
must enforce the existing guard before persistence/log/network. No ingestion,
provider, Telegram, device or frontend implementation was started at this pause.

## Owner decision — 2026-11-04

Owner explicitly instructed: **"Approved all next check point continue without
any user input do it in autonomous"**. G2 foundation checkpoint is accepted with
its documented limitations. Proceed with planned backend work without routine
approval questions; later technical gate criteria still must actually pass.
This does not create missing zero-trace/device proof, pre-complete G3, or broaden
this backend task to frontend work. PR11 exact2803c63 passed CI41853443703 all
five required jobs and merged normally as d2b80c4, no protections bypassed.
