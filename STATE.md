---
current_phase: "Phase I Android"
current_step: "S35"
current_step_status: "not_started"
blocked_on: "none"
last_updated: "2026-11-06"
last_green_commit: "cd314219b5cc415084dd4166c50a312761e156a2"
gate_status: "G1 accepted; G2 accepted; G3 accepted by owner; G4 pending"
ci_proof: "S33 device proof accepted by owner; S34 promotion verified locally by app jest 11/11, typecheck, lint, format and a real expo export containing core symbols"
---

# STATE

## Completed this session

- Provider privacy boundary merged as PR #38 -> main `971312b`.
- S29 full snake_case CLI merged as PR #39 -> main `f605a4a`.
- S30 eight headless manual flows merged as PR #40 -> main `07af676`.
- S31 six mutation spot checks merged as PR #41 -> main `3106292`.
- S32 documentation merged as PR #42 -> main `3ed0a76`.
- G3 backend report finalized (PR #43 -> main `40a00b4`) and evidence corrected (PR #44 -> main `14a77c8`).
- Owner accepted G3 on 2026-11-05; S33 started.
- S33 environment checker/docs merged as PR #45 -> main `5aa9e6e`; state update merged as PR #46 -> main `66495c1`.
- S33 manual CI Android proof workflow merged as PR #47 -> main `ef030e6`.
- Manual workflow run `42031551861` succeeded and uploaded `s33-android-proof-apk`.
- **S33 accepted by owner 2026-11-05.** Owner installed
  `s33-preview-standalone-apk` from run `42044273087` and reported Vittaz opened
  and rendered the Home screen on their phone. Recorded in
  `docs/device_tests.md`; Plan S33 checked. Phone model/Android version were not
  supplied and are left unrecorded.
- Diagnosed owner-side crash: the blank proof APK autolinked no
  `react-native-safe-area-context`, but the Metro preview bundle rendered
  `SafeAreaProvider`, so Fabric raised `IllegalViewOperationException` for
  `RNCSafeAreaProvider`. Binary/bundle mismatch, not a UI or build defect.
- Confirmed the blank debug APK embeds no JS bundle, so it always needs Metro.
- Owner reports the Metro **web** preview renders correctly at
  `http://localhost:8081/`. That is browser proof, not device proof.
- Added manual `s33-preview-apk` workflow (PR #49 -> main `f8f0989`) that builds
  the owner preview in a runner temp copy and uploads a standalone release APK
  (embedded JS, no Metro) plus a dev-client debug APK.
- First dispatch failed `422`: `runner` context is invalid in job-level `env`.
  Fixed at step level via `$GITHUB_ENV` with a regression test (PR #50 -> main
  `816df51`).
- Preview build run `42044273087` succeeded: autolink `missing: []`, 85
  safe-area-context and 82 svg Gradle tasks, Metro bundled 855 modules, embedded
  Hermes bundle 1,889,140 B, checkout unchanged.
- Downloaded both APKs and compared DEX/native libs: the blank APK has none of
  `RNCSafeAreaProvider`, `SvgViewManager`, `LinearGradientModule`, no codegen
  `.so` for svg/safe-area, and no JS bundle; the preview APK has all of them.
- **S34 done 2026-11-06.** Owner chose "Move it — promote to apps/mobile".
  `git mv apps/mobile/ui/native` -> `apps/mobile`; every file recorded as a
  rename. 27/36 files byte-for-byte identical; the 9 changed are config/path
  only. No screen, asset, App.tsx, ui.tsx, store.tsx or theme.ts was touched.
- `apps/mobile` is NOT a root workspace and not a root TS project reference;
  root workspaces are now `["packages/*","apps/cli"]`. The Expo app keeps its own
  lockfile so React Native never enters backend CI.
- The web preview stays at `apps/mobile/ui`, nested inside the app. Metro/Jest
  read `ui/src`; the app's eslint/prettier/tsc ignore `ui/`.
- `apps/mobile/src/core.ts` re-exports `@vittaz/core`, re-exported again by
  `src/domain.ts` so it is reachable from the entrypoint. Resolved as source via
  Metro watchFolders/extraNodeModules, Jest moduleNameMapper and a tsconfig path.
- Two real defects caught by a real `expo export`, not string tests: an
  unimported bridge was dead code (no core symbols in the bundle), and core's
  NodeNext `.js` specifiers over `.ts` sources broke Metro resolution. Both
  fixed; bundle grew 2.3 MB -> 2.5 MB and now contains core symbols.
- `dependencies_are_exactly_pinned` no longer covers `apps/mobile` (Expo owns
  those ranges); replaced by a lockfile-reproducibility test, not weakened.
- S35 still owed: the preview demo reducer still owns app state; no
  `expo-sqlite` adapter yet. No device claim for S34.

## Current proof

- Root suite now 320 tests / 55 files, 100% coverage. Promoted app: jest 11/11, typecheck/lint/format clean, `expo export --platform android` succeeds.
- Sandbox `npm run android:env` reports `ok:false` with static errors:
  `java_missing_or_unsupported`, `android_sdk_missing`, `adb_missing`,
  `no_ready_device`. This is expected in the sandbox and is not device proof.
- Protected CI on S33 head `d91bcd1`: quality, privacy, test, security, build all success.
- Local full gate: lint/typecheck/format:check pass; 302 tests / 52 files; 100% coverage;
  privacy_checks_passed; build + CLI smoke pass; npm audit 0 vulnerabilities;
  secret:scan 0 findings.

## Next actions

1. S35: `expo-sqlite` repository adapter passing the same core contract tests,
   then replace the preview demo reducer so core owns app state.
2. Re-run the manual `S33 preview APK` workflow after S35 to prove the wired app
   on the phone; the workflow now copies `apps/mobile`.
3. Every later device row still needs its own owner report. Do not reuse the S33
   report as evidence for persistence, SQLite, Keystore, Telegram or local model.
4. Do not point the blank `s33-android-proof-apk` at the preview Metro server;
   the native modules do not match and it crashes on `RNCSafeAreaProvider`.
5. S34–S35: promote native app to `apps/mobile`, connect `packages/core` through
   an `expo-sqlite` repository adapter, replace preview demo reducer.
6. Phase J UI vertical slices; prove every slice on a real device.

## Owner-owned open items (do not decide)

- License undecided despite GPL-3.0 LICENSE file.
- Backups plaintext; backup encryption undecided.
- Native preview reuses web demo reducer through Metro watchFolders; must be
  replaced during core wiring.
