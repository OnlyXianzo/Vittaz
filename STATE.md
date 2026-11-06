---
current_phase: "Phase I Android"
current_step: "S35"
current_step_status: "in_progress"
blocked_on: "none"
last_updated: "2026-11-06"
last_green_commit: "37c6263e926a0c68f3133d27dfd7b8ea6ff0d1c1"
gate_status: "G1 accepted; G2 accepted; G3 accepted by owner; G4 pending"
ci_proof: "S33 device proof accepted by owner (pre-promotion APK); S34 promotion merged b19e181 + fix 37c6263; APK run 42204863019 success, 873 modules, core symbols verified inside the shipped APK bundle"
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
- S35 implementation in progress on `feat/s35-expo-sqlite-adapter` (not merged).
  Local gates are green: shared adapter contract cases, core-backed manual entry
  and proposal review, demo reducer/seeded rows removed. See current proof.

## Current proof

- S35 local root gate green: **344 tests / 56 files, 100% coverage**. Root
  format/lint/typecheck/privacy/audit/build/secret scan all pass; root audit 0.
- App: `npm ci`, format/lint/typecheck pass; **Jest 11/11**. Android export
  succeeds (2.6 MB Hermes). Web export succeeds (502 modules + 641 KB WASM) with
  Metro wasm/COEP/COOP setup. Native workflow now exports both targets.
- App audit: 33 advisories (1 low, 32 moderate, 0 high/critical). Forced
  remediation downgrades Expo 58/Jest 30, so not applied; see references.
- Protected CI and post-S35 APK run pending.
- App `npm audit` is not clean: 33 advisories (1 low, 32 moderate, no
  high/critical). Forced fix downgrades Expo 58 -> 53 and Jest 30 -> 29; not
  applied. Root backend audit remains 0. See `docs/references.md`.
- Post-promotion APK run `42204863019` succeeded on main `37c6263`: autolink
  `missing: []`, 873 modules bundled, `BUILD SUCCESSFUL in 9m 55s`. Downloaded the
  standalone APK and confirmed core symbols inside its embedded bundle.
- An earlier APK run on `b19e181` failed: the workflow copied only `apps/mobile`
  while Metro watches `../../packages/core/src`. Fixed in PR #54 by copying
  `packages/core` too; verified by reproducing the CI temp layout locally.
- This APK is build proof only. The owner has not installed it. S33 acceptance
  covers the pre-promotion APK opening and does not extend to this build.
- Sandbox `npm run android:env` reports `ok:false` with static errors:
  `java_missing_or_unsupported`, `android_sdk_missing`, `adb_missing`,
  `no_ready_device`. This is expected in the sandbox and is not device proof.
- Protected CI on S33 head `d91bcd1`: quality, privacy, test, security, build all success.
- Older S33 gate was 302 tests / 52 files; superseded by the S35 local gate above.

## Next actions

1. Finish S35: push the current branch, pass protected CI, merge, then run the
   manual preview APK workflow. The owner has not installed that post-S35 APK;
   no S35 device behavior is claimed.
2. Every later device row needs its own owner report. Do not reuse the S33 report
   as evidence for persistence, SQLite, Keystore, Telegram or local model.
3. Do not point the blank `s33-android-proof-apk` at the preview Metro server;
   the native modules do not match and it crashes on `RNCSafeAreaProvider`.
4. Phase J UI vertical slices; prove every slice on a real device.

## Owner-owned open items (do not decide)

- License undecided despite GPL-3.0 LICENSE file.
- Backups plaintext; backup encryption undecided.
- The original native preview reused the web demo reducer through Metro
  `watchFolders`; S35 replaces that native state path with core + `expo-sqlite`.
  The browser preview continues using its own reducer.
