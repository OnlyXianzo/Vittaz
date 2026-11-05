# G3 — Backend readiness report (report only)

Date: 2026-11-05. **This is a report only. It does not grant owner sign-off,
frontend authority, or device acceptance.** Stop here for owner review.

## In plain language

The backend work requested after the provider privacy boundary is complete:
S29 full CLI, S30 eight headless manual flows, S31 mutation spot checks, and S32
documentation. All five required CI checks passed on the protected PRs. No
Android device behavior has been verified. The next step, S33, requires the owner
to sign off G3 and run `adb devices` on their PC.

## Technical checklist

| Check                                    | Evidence                                                                                             | Result                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------ |
| Provider privacy boundary before S29–S32 | PR #38, head `39edd53fa94f4ca0c5a3e17890a3644d3d27bea3`, CI run `41997340341`; merged main `971312b` | pass                     |
| S29 full snake_case CLI                  | PR #39, head `14435064e3efd8113138dfa329418cf6744eea70`, CI run `42000754015`; merged main `f605a4a` | pass                     |
| S30 eight headless manual flows          | PR #40, head `e6c58d4576c54b5bfa8e808c79a4480a68801a63`, CI run `42002483590`; merged main `07af676` | pass                     |
| S31 six mutation spot checks             | PR #41, head `5fdfd9dc68bec295306254596131f3ea0de7d539`, CI run `42003542907`; merged main `3106292` | pass                     |
| S32 documentation completion             | Local full gate green; protected PR CI pending at report creation                                    | pass locally, CI pending |
| Layers 1–4 in CI                         | `quality`, `privacy`, `test`, `security`, `build` required by ruleset and green on S29–S31 heads     | pass                     |
| CLI flows pass                           | `tests/integration/headless_flows.test.ts`: eight manual flows through real CLI and native SQLite    | pass                     |
| Mutation checks pass                     | `docs/mutation_checks.md`: six deliberate breaks, each targeted suite failed, sources restored       | pass                     |
| Docs complete                            | README, `docs/references.md`, `DECISIONS.md`, `docs/device_tests.md`, this report                    | pass                     |

## Local verification on S32 branch

Using Node `24.22.2` / npm `11.19.1`:

- `npm run lint`, `npm run typecheck`, `npm run format:check` — pass.
- `npm run test:coverage` — 296 tests / 51 files pass; 100% statements, branches,
  functions, lines for covered source.
- `npm run test:privacy` — pass; `privacy_checks_passed`.
- `npm run build` — pass; `node apps/cli/dist/main.js` smoke returns
  `{"ok":true,"version":"0.0.1"}`.
- `npm audit` — 0 vulnerabilities.
- `npm run secret:scan` — 0 findings.

## Explicit limitations

1. **No Android device behavior has been verified.** `docs/device_tests.md` is a
   pending checklist. S33 cannot start until the owner runs `adb devices`.
2. The native UI under `apps/mobile/ui/native` is owner-authored and visual-only.
   It still reuses the web demo reducer through Metro `watchFolders`; that must be
   replaced by `packages/core` through an `expo-sqlite` repository adapter during
   S34–S35.
3. Backups are ledger-only plaintext. Backup encryption remains an owner decision.
4. The project license is still undecided despite the GPL-3.0 `LICENSE` file.
5. Telegram HTTP egress currently redacts only the bot token; full message-body
   privacy remains an open S28 gap and must not be treated as proven.
6. Cloud/live provider tests, local model device benchmarks, Keystore, notification
   listener, voice, and OCR are not executed here.

## Owner decision requested

Please review this report. If you accept G3, reply with explicit sign-off and run
`adb devices` on your PC for S33. If you require more backend evidence first, keep
the pause and name the missing scope. Do not interpret this report as approval.
