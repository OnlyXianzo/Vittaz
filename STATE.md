---
current_phase: "Phase I Android"
current_step: "S35 corrective Android UUID runtime fix"
current_step_status: "in_progress"
blocked_on: "owner retry on corrected APK; no S36 until synthetic save survives close/reopen"
last_updated: "2026-11-06"
last_green_commit: "5014d32c11dd9974acfe4c82dfe4e0d0a232a866"
gate_status: "G1 accepted; G2 accepted; G3 accepted by owner; G4 pending"
ci_proof: "S35 PR #56 and APK run 42215554135 are build proof only; owner reported Save failure: crypto.randomUUID unavailable in Android Hermes. Corrective expo-crypto fix passes local app/root tests and exports; PR CI, corrected APK, and owner persistence retry are pending."
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
- Local corrective branch gates pass: root 344 tests / 56 files at 100% coverage,
  privacy/lint/format/typecheck/build/audit/secret scan; mobile Jest 11/11,
  lint/format/typecheck, Android export (912 modules) and web export pass.
- The fix is not yet merged or device-verified. S36 stays blocked until the
  corrected standalone APK is installed and the owner confirms a synthetic
  entry survives close/reopen.

## Current proof

- Protected CI for PR #56: quality, privacy, test, security, build, native all
  success. S35 merged as `a533288`.
- Root gate: **344 tests / 56 files, 100% coverage**; format/lint/typecheck,
  privacy, build, secret scan pass; root audit 0.
- Native app: `npm ci`, format/lint/typecheck, **Jest 11/11**, Android export
  (2.6 MB Hermes) and web export (502 modules + 641 KB WASM) pass.
- App `npm audit`: 33 advisories (1 low, 32 moderate, none high/critical).
  Forced remediation downgrades Expo 58/Jest 30 and was not applied; see
  `docs/references.md`.
- Post-S35 APK run `42215554135` success: 904 modules bundled, `missing: []`,
  `BUILD SUCCESSFUL in 12m 25s`; embedded bundle contains core symbols; SQLite
  module strings present in DEX. ZIP SHA-256 `115e44a0672a715132c65ecaf0617327256bb8b7d895e097a194d5d2197da62a`,
  expires `2026-11-13T12:23:47Z`.
- Owner did install/try this post-S35 APK, but Save failed before insert with the
  UUID runtime error documented above. No S35 persistence proof; S33 acceptance
  still covers only the earlier APK opening.
- Sandbox `npm run android:env` remains `ok:false` (no Java 17/Android SDK/adb/device).

## Next actions

1. Finish the Expo Crypto runtime repair; run app and root gates; update this
   state with exact PR/check/build evidence and push.
2. Build a corrected standalone APK and ask the owner to save a synthetic entry,
   close/reopen, and report whether it remains. Keep S35 persistence pending until
   that report.
3. Hold S36 LangChain check until that owner verification passes.
4. S37/G4: persistence, Keystore, local model/benchmark, Telegram, voice and OCR
   device checklist. Each row needs its own owner report.
5. Do not point the blank `s33-android-proof-apk` at the preview Metro server;
   the native modules do not match and it crashes on `RNCSafeAreaProvider`.
6. Phase J UI vertical slices; prove every slice on a real device.

## Owner-owned open items (do not decide)

- License undecided despite GPL-3.0 LICENSE file.
- Backups plaintext; backup encryption undecided.
- The original native preview reused the web demo reducer through Metro
  `watchFolders`; S35 replaces that native state path with core + `expo-sqlite`.
  The browser preview continues using its own reducer.
