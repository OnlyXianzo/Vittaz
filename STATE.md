---
current_phase: "Phase I Android"
current_step: "S36 LangChain check"
current_step_status: "in_progress"
blocked_on: "S36 code is merged and CI/build passed. Device/runtime acceptance remains owner-blocked because the owner cannot test now; do not claim phone behavior."
last_updated: "2026-11-07"
last_green_commit: "10e31794dbec8653b165959104d0bc703c1b578b"
gate_status: "G1 accepted; G2 accepted; G3 accepted by owner; G4 pending"
ci_proof: "PR #62 merged 2026-11-07 as 10e31794dbec8653b165959104d0bc703c1b578b. Required PR checks passed on commit 9a55779; main CI and Native app checks passed on merge commit. Local root suite: 353 tests / 56 files at 100% coverage; mobile: 19/19 tests plus typecheck/lint/format on Node 24.22.2. Final merged-head APK workflow 42279488717 succeeded on main: 1,411 modules, Gradle 9.4.1 BUILD SUCCESSFUL in 12m 43s; archived at ../S36-builds/s36-final-merged-standalone.apk, 48,634,494 bytes, SHA-256 37075cb9a7bcf3d606e171064416ab5ae659fe6bb138bf737f476cccce3c2e35, artifact expires 2026-11-13T19:39:41Z. Static package inspection only; no phone behavior is claimed. Owner cannot test now; device acceptance remains pending."}}
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
- **S35 done 2026-11-06.** PR #56 merged as `a533288`; quality, privacy, test,
  security, build and native checks all green. Root: 344 tests / 56 files, 100%.
  App: Jest 11/11, typecheck/lint/format; Android and web exports pass.
- Post-S35 APK run `42215554135` success: 904 modules bundled, APK ZIP sha256
  `115e44a0…`, core and SQLiteModule statically present. Owner later installed/
  tried it and reported the UUID save error; no SQLite/device persistence claim.

## S35 corrective follow-up — 2026-11-06

- Owner's post-S35 phone test shows Add transaction but Save errors with
  `Cannot read property 'randomUUID' of undefined`. This is an Android Hermes
  runtime issue, not missing Metro; the standalone APK embeds JavaScript.
- The failure occurs before the transaction insert; do not count this entry as
  saved and do not mark device persistence passed.
- SDK 58 Expo Crypto docs were consulted. Failing regressions reproduced the
  same missing-Web-Crypto behavior in both manual Save and user proposal
  approval. The mobile app now injects `expo-crypto@58.0.7` UUID generation into
  those core calls; core's default runtime is unchanged. Local regression tests
  pass with `globalThis.crypto` removed.
- Local corrective branch gates passed: root 344 tests / 56 files at 100% coverage,
  privacy/lint/format/typecheck/build/audit/secret scan; mobile Jest 11/11,
  lint/format/typecheck, Android export (912 modules) and web export passed.
- PR #58 merged as `e548227a4df5992a4c6ecbeb4147ff692b654fb6`; quality, privacy,
  test, security, build and native checks all succeeded. CodeRabbit was skipped
  (optional); no unresolved review threads.
- Standalone APK run `42228039226` failed its first attempt when Gradle could not
  resolve `org.gradle.toolchains.foojay-resolver-convention:1.0.0`; rerun attempt
  2 succeeded. Artifact `s33-preview-standalone-apk` expires
  `2026-11-13T13:58:02Z`; ZIP SHA-256
  `505555598a0059835e6598fe771e46e90a4203f247eb7efb0b808bd280aaedcd`, APK
  SHA-256 `3874cdb8ed54f5e4dec52d798bbc0f20c8a71f6a52fde0672f716c103be708b0`.
  Static DEX inspection found `expo.modules.crypto.CryptoModule` and
  `UUID.randomUUID()`; APK includes `assets/index.android.bundle`. These are
  build/static facts, not device execution.
- Owner then confirmed that a synthetic entry saved with the corrected APK
  survived close/reopen; S35 basic SQLite persistence is accepted. S36 is
  unblocked. This does not establish the remaining device tests.

## Owner-approved Add form grouping clarification — 2026-11-06

- Owner clarified that Direction (Spent/Received/Lent) and Category
  (Food/Travel/etc.) controls visually run together; the amount field is already
  clear. The owner approved small labels plus a subtle divider, with no broader
  redesign.
- A focused native UI regression was added first and failed because the labels
  were absent; the labels/divider implementation now passes.
- Local branch gates: mobile Jest 12/12, lint/format/typecheck; Android export
  (912 modules) and web export pass. Root gates: 344 tests / 56 files, 100%
  coverage; lint/format/typecheck/privacy/audit/secret scan/build pass.
- PR #60 merged to main as `ee274c51b654ddd04d98efce25ba23442cfd570b`; required
  quality, privacy, test, security, build, and native checks all succeeded.
- Standalone APK run `42237936656` succeeded on attempt 1 from that commit. The
  `s33-preview-standalone-apk` artifact expires `2026-11-13T15:07:16Z`; APK
  SHA-256 is `9940af8fd4f31f6b1fa03a277474b74b5727a349cbc2425789a18743a808d8f3`.
  Static bundle inspection confirms the Direction/Category label strings are
  packaged; this is not device execution.
- The owner visually confirmed the updated layout looks right on-device on
  2026-11-06. The agent did not observe the phone; model/version were not supplied.
  S36 is unblocked by the accepted S35 save/reopen report.

## Current proof

- PR #60 protected CI: quality, privacy, test, security, build, and native all
  succeeded. Grouping update merged as `ee274c5`; S35 core work merged earlier as
  PR #56 (`a533288`).
- Reconstructed S36 local validation: **353 tests / 56 files; statements,
  branches, functions, and lines all 100%**. Root test, typecheck, lint, format,
  build, privacy, audit, and secret scan pass; root audit has 0 findings.
- Native app S36: **19 tests / 4 suites**, typecheck, lint, and format pass. The
  standalone Android JS export succeeds (1,411 modules; SHA-256
  `7835ded50eb7a7121072b3dd214883d3cdf3c3230059837b4664defa0084b085`,
  5,581,887 bytes). Bundle contains Kilo Auto Free, read-only tool, secure-key
  identifier and SecureStore methods. Expo autolinking reports SecureStore,
  SQLite and LinearGradient present. The S36 Settings screen does not present
  inert approval/name-replacement/note-sharing toggles as active controls; it
  states the actual read-only cloud boundary and the limits of name replacement.
- PR #62 merged after required PR and main CI/Native checks passed. Merge commit
  `10e31794dbec8653b165959104d0bc703c1b578b`; the branch is closed.
- Final merged-head APK run `42279488717` succeeded on `main`: Node 24.22.2,
  npm 11.19.1, Temurin JDK 17.0.21, Gradle 9.4.1; 1,411 modules bundled;
  `BUILD SUCCESSFUL in 12m 43s`. Artifact `13536090229` expires
  `2026-11-13T19:39:41Z`; archived at
  `../S36-builds/s36-final-merged-standalone.apk`, 48,634,494 bytes, SHA-256
  `37075cb9a7bcf3d606e171064416ab5ae659fe6bb138bf737f476cccce3c2e35`. Static
  bundle/DEX inspection only; this is not device/runtime evidence.
- Mobile `npm audit --audit-level=moderate`: 33 advisories (1 low, 32 moderate,
  none high/critical). Forced remediation downgrades Expo/Jest/ESLint and was
  not applied; see `docs/references.md`.
- Post-S35 APK run `42215554135` success: 904 modules bundled, `missing: []`,
  `BUILD SUCCESSFUL in 12m 25s`; embedded bundle contains core symbols; SQLite
  module strings present in DEX. ZIP SHA-256 `115e44a0672a715132c65ecaf0617327256bb8b7d895e097a194d5d2197da62a`,
  expires `2026-11-13T12:23:47Z`.
- Owner did try the original post-S35 APK, but Save failed before insert with
  the UUID runtime error documented above. That attempt did not save an entry;
  the later corrected-APK owner report is recorded separately.
- Corrected APK run `42228039226` attempt 2 built the tested artifact. Owner later
  confirmed a synthetic entry survived close/reopen; the device result is recorded
  in `docs/device_tests.md`. Broader device behavior remains unverified.
- Sandbox `npm run android:env` remains `ok:false` (no Java 17/Android SDK/adb/device).

## Next actions

1. S36 code is merged and the final main-head APK is archived at
   `../S36-builds/s36-final-merged-standalone.apk`. The sole remaining S36
   acceptance item is owner device testing: keyless read-only Kilo use, validated
   answer display, and force-stop/reopen. Owner currently cannot test, so keep
   those checks pending and make no device claims.
2. S37/G4: remaining persistence scope, Keystore, local model/benchmark,
   Telegram, voice and OCR checklist. Each row needs its own owner report.
3. Do not point the blank `s33-android-proof-apk` at the preview Metro server;
   the native modules do not match and it crashes on `RNCSafeAreaProvider`.
4. Continue Phase J UI vertical slices and prove each slice on a real device.

## S36 current work — 2026-11-07

- Recovery note: after cleanup, the earlier uncommitted S36 worktree disappeared.
  This branch was recreated from upstream `744602e` and the implementation was
  reconstructed; every gate reported below was rerun against this clone. Older
  pre-recovery test and export results are not evidence for this source tree.
- Added a Quick-screen Ask Assistant path into the native Chat screen and wired
  Kilo Auto Free to Vittaz's existing read-only QA agent. The agent can call
  only the existing read-only query tools; no proposal or ledger write handles
  are reachable from this assistant path. The UI shows completed tool names and
  releases only final-answer-validated chunks after the provider response is
  buffered. This is safe progressive reveal, not raw live token streaming.
- Added an optional Kilo Gateway key form backed by Expo SecureStore. The key is
  never written to SQLite, backup, logs, source or test output. Keyless calls
  omit Authorization; the optional synthetic test key appears only in that
  header. UI tells the user Auto Free may route/log upstream and to use synthetic
  data.
- Documentation consulted and recorded in `docs/references.md`: LangChain
  models/tool/stream docs; Expo SDK 58 SecureStore (`expo-secure-store@58.0.2`);
  Kilo Gateway v1 models/API docs and live unauthenticated catalog; Ollama local
  API auth docs as an alternative. No live inference request or real provider
  key was used in development.
- Final independent validation used Node 24.22.2 / npm 11.19.1, as required.
  An initial shell invocation accidentally used system Node 20.20.2, which caused
  Node-24-specific privacy/test-runner failures; no code was changed for that
  mismatch, and all gates were rerun under Node 24. Root coverage passed 353
  tests / 56 files at 100%; typecheck, build, lint, format, privacy, workflow
  regression, secret scan and root audit passed (0 vulnerabilities). Mobile
  passed 19 tests / 4 suites plus typecheck, lint and format. Mobile audit still
  reports 33 advisories (1 low, 32 moderate; 0 high/critical); no forced
  downgrade applied.
- Final Android JS export bundled 1,411 modules. Hermes bundle SHA-256
  `7835ded50eb7a7121072b3dd214883d3cdf3c3230059837b4664defa0084b085`
  (5,581,887 bytes) contains `kilo-auto/free`, `get_month_summary`, the secure
  key identifier and SecureStore methods. Expo autolinking independently
  confirms SecureStore, SQLite and LinearGradient. S33 workflow regression
  passes with package-agent copying, SecureStore autolinking assertion and
  runner software reporting. The settings UI also replaces unimplemented
  safety toggles with an accurate read-only/privacy scope notice.
- PR #62 (`9a55779`) merged into `main` on 2026-11-07 as
  `10e31794dbec8653b165959104d0bc703c1b578b`. Initial native CI exposed missing
  isolated-app TypeScript declarations, then CommonJS Jest resolution for
  LangChain and Zod. Regression-first TypeScript/Jest mappings resolve the
  pinned exports; Node 24.22.2/npm 11.19.1 local checks pass (mobile 19/19,
  typecheck, lint, format; root 353 tests/56 files at 100%). Required PR CI and
  post-merge main CI/native checks all passed.
- Final merged-head manual APK run `42279488717` succeeded on `main` commit
  `10e31794dbec8653b165959104d0bc703c1b578b`: Node 24.22.2, npm 11.19.1,
  Temurin JDK 17.0.21, Gradle 9.4.1; 1,411 modules; `BUILD SUCCESSFUL in
12m 43s`. APK archived at `../S36-builds/s36-final-merged-standalone.apk`,
  48,634,494 bytes, SHA-256
  `37075cb9a7bcf3d606e171064416ab5ae659fe6bb138bf737f476cccce3c2e35`, expiry
  `2026-11-13T19:39:41Z`. Embedded bundle and SecureStore DEX class are present.
  Static inspection/build evidence only; not phone or runtime evidence. The
  earlier pre-fix artifact from run `42273678939` remains historical.
- Owner says they cannot test the app now. A fresh `npm run android:env` reports
  Java 11, no Android SDK/adb, and no device. Keep all device checks explicitly
  unverified and owner-blocked.

## Owner-owned open items (do not decide)

- License undecided despite GPL-3.0 LICENSE file.
- Backups plaintext; backup encryption undecided.
- The original native preview reused the web demo reducer through Metro
  `watchFolders`; S35 replaces that native state path with core + `expo-sqlite`.
  The browser preview continues using its own reducer.
