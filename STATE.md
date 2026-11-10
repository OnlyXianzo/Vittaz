---
current_phase: "Phase I Android"
current_step: "S37b Anthropic API-key BYOK route"
current_step_status: "required_CI_green_PR_open"
blocked_on: "PR #70 required checks passed on head 250f0453d8cf8851a76c4e5820b929d736afa518; PR remains open pending owner merge authorization. S36 acceptance remains independently pending: owner-confirmed run #13 showed KILO_UNKNOWN twice with no established cause; keyboard-open behavior remains untested."
last_updated: "2026-11-05"
last_green_commit: "250f0453d8cf8851a76c4e5820b929d736afa518"
gate_status: "G1 accepted; G2 accepted; G3 accepted by owner; G4 pending"
ci_proof: "PR #62 merged 2026-11-07 as 10e31794dbec8653b165959104d0bc703c1b578b. Required PR checks passed on commit 9a55779; main CI and Native app checks passed on merge commit. Local root suite: 353 tests / 56 files at 100% coverage; mobile: 19/19 tests plus typecheck/lint/format on Node 24.22.2. Final merged-head APK workflow 42279488717 succeeded on main: 1,411 modules, Gradle 9.4.1 BUILD SUCCESSFUL in 12m 43s; archived at ../S36-builds/s36-final-merged-standalone.apk, 48,634,494 bytes, SHA-256 37075cb9a7bcf3d606e171064416ab5ae659fe6bb138bf737f476cccce3c2e35, artifact expires 2026-11-13T19:39:41Z. Static package inspection only; no phone behavior is claimed. User-provided screenshots dated 2026-11-07 show repeated generic assistant failures after key-save UI and report a keyboard/composer issue; exact build, provider status, device model/version, and cause are unknown. One anonymous synthetic Kilo endpoint probe returned HTTP 200 SSE, but does not validate the saved key or app path. PR #64 (`5a88a7e`) merged as `c6c57d467953824bd91e0ed8ad48887eaf1eca13`; all required PR checks and main quality/privacy/test/security/build/native checks passed. Keyboard/composer handling merged in PR #65 (`661054d6`) as `6b190cfa76cbb6b5ed6bed74b805d2fc4179ec9e`; all required PR and main checks passed. Manual workflow run `42343693444` (#12) succeeded on that main commit: 1,411 modules, Gradle 9.4.1 BUILD SUCCESSFUL in 12m 20s, Ubuntu 24.04.5 image `20261101.360.1`, Node 24.22.2/npm 11.19.1, Temurin JDK 17.0.21. Standalone APK artifact `13563145707` expires `2026-11-14T05:53:58Z`, 48,636,434 bytes, SHA-256 `7663ce72020163c36fb3cbf20cdff5390a92a7a62da07eec2ada80ce57e5d29f`; archived at `../S36-builds/s36-merged-post-chat-fixes-standalone.apk`. Static package evidence only; the owner now confirms run #12 was installed and reports the same failure after clear-data/reinstall on Wi-Fi and mobile data with a blank optional key. Successful S36 device acceptance remains pending. PR #67 (`6c9b312`) was squash-merged as `0dbacde6eaa56d0d00b55b9d5d43e6b75cff53f6`; all required PR checks and main CI run `42358832997` plus Native run `42358832973` succeeded. Manual APK run #13 (`42358981476`) succeeded on that merge: 1,411 modules, Gradle 9.4.1 `BUILD SUCCESSFUL in 12m 45s`, Ubuntu 24.04.5 image `20261101.360.1`, runner `2.338.2`, Node `24.22.2`/npm `11.19.1`, Temurin JDK `17.0.21`. Standalone artifact `13568469222` expires `2026-11-14T09:30:02Z`; APK 48,638,510 bytes, SHA-256 `46f1319dda4a3e21f0943791ecc0bd24e5f8afdaebd275b08eb9336458f02559`, archived at `../S36-builds/s36-keyless-provider-diagnostics-standalone.apk`. Build evidence only. Owner now confirms a screenshot from run #13; it shows two `KILO_UNKNOWN` failures and no answer. The agent did not inspect the installed package or verify its hash. Composer is visible with keyboard closed; keyboard-open behavior remains untested. Source inspection confirms `KILO_UNKNOWN` is the `provider_error` catch-all; several QA/adapter and invalid-completion paths can reach it, so the screenshot does not identify the cause. S36 acceptance remains pending."}}
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
- S36 provider diagnostics merged in PR #64 (`5a88a7e`) as
  `c6c57d467953824bd91e0ed8ad48887eaf1eca13`. PR checks and main quality,
  privacy, test, security, build and native checks passed. Root local suite on
  this keyboard branch: **355 tests / 57 files; statements, branches, functions,
  and lines all 100%**; root typecheck, lint, format, build, privacy, audit (0
  findings), and secret scan pass.
- Native app: **21 tests / 4 suites**, typecheck, lint, and format pass. Provider
  auth, rate-limit, and rejected-request failures map to fixed actionable copy
  without raw provider text. Android keyboard handling is tested locally on a
  separate PR branch; no on-device confirmation. The keyboard-branch Android JS
  export succeeds (1,411 modules; SHA-256
  `b175234646a7eca6e6b9887daf74877aff4855e2750fa84be7190f68092a023b`,
  5,584,002 bytes). Resolved Expo public config reports SDK 58.0.0 and
  `android.softwareKeyboardLayoutMode=resize`. Export/config prove packaging
  only, not device keyboard behavior. The bundle retains Kilo Auto Free,
  read-only tools, SecureStore methods and native modules. The S36 Settings
  screen states the actual read-only cloud boundary and limits of name
  replacement.
- PR #62 merged after required PR and main CI/Native checks passed. Merge commit
  `10e31794dbec8653b165959104d0bc703c1b578b`; the branch is closed.
- Final merged-head APK run `42279488717` succeeded on `main`: Node 24.22.2,
  npm 11.19.1, Temurin JDK 17.0.21, Gradle 9.4.1; 1,411 modules bundled;
  `BUILD SUCCESSFUL in 12m 43s`. Artifact `13536090229` expires
  `2026-11-13T19:39:41Z`; archived at
  `../S36-builds/s36-final-merged-standalone.apk`, 48,634,494 bytes, SHA-256
  `37075cb9a7bcf3d606e171064416ab5ae659fe6bb138bf737f476cccce3c2e35`. Static
  bundle/DEX inspection only; this is not device/runtime evidence.
- User-provided screenshots dated 2026-11-07 show several chat queries ending in
  the generic safe-answer fallback and show the composer/send controls absent
  while the Android keyboard is open. The key remains masked; the screenshots
  do not identify the APK, HTTP status, or device model/version. This is
  failed-attempt evidence only, not acceptance. A no-auth synthetic Kilo endpoint
  probe returned 200 SSE, which does not validate the saved key or full mobile QA
  path.
- The separate 2026-11-06 `randomUUID` save screenshot is an earlier S35 issue:
  PR #58 (`e548227`) injects Expo Crypto UUID generation; a regression saves with
  `globalThis.crypto` removed, and the owner later reported successful
  save/close/reopen on the corrected APK. No additional UUID patch is indicated
  by the supplied evidence; the latest S36 APK has not been device-retested.
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

1. PR #69 (`feat(mobile): add OpenAI-compatible BYOK route`) is open and all
   required checks passed on implementation commit `85e4c97`. Await the owner's
   merge decision; do not merge without explicit authorization.
2. After S37a is on main, implement S37b Anthropic Messages API-key BYOK
   test-first. Recheck the complete official Messages API request headers,
   tool-use schema, response parsing, SSE events and current API version first.
3. Keep S36/G4 acceptance pending. Do not repeat run #13 unchanged or infer a
   root cause from `KILO_UNKNOWN`; ask only for the planned synthetic result and
   keyboard-open composer check after an APK is ready.
4. Remaining G4 work (persistence, Keystore, local model/benchmark, Telegram,
   voice and OCR) remains separate and requires its own owner reports.
5. Do not point the blank `s33-android-proof-apk` at the preview Metro server;
   the native modules do not match and it crashes on `RNCSafeAreaProvider`.
6. Do not decide license, backup encryption, or other owner-owned open items.

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
  API auth docs as an alternative. No real provider key was used in development.
  A later anonymous synthetic Kilo Gateway probe returned HTTP 200 and a complete
  SSE stream; this does not validate the mobile app or owner request.
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
- New user-provided screenshots (2026-11-07) show repeated generic chat failures
  and report that the keyboard can hide the typing area. Exact installed build,
  network/API status, and device model/version are unknown; the key is masked and
  was not copied. No successful S36 flow or force-stop/reopen acceptance is
  established. The sandbox still has no Android SDK/adb/device, so the agent
  cannot reproduce the phone UI directly.
- One anonymous, synthetic Kilo Gateway request using the app's route/model and
  streaming/tool request shape returned HTTP 200 with SSE completion and usage.
  This narrows the failure but cannot validate the user's saved key or full app
  QA path. Provider diagnostics merged in PR #64 (`c6c57d4`); keyboard handling
  merged in PR #65 (`6b190cf`). Required PR and main checks passed for both. The
  keyboard change explicitly requests Android `resize`, uses Android
  `KeyboardAvoidingView` height behavior, and protects composer input height and
  alignment. Manual APK run #12 (`42343693444`) succeeded after both fixes; its
  release artifact is archived at
  `../S36-builds/s36-merged-post-chat-fixes-standalone.apk` (48,636,434 bytes,
  SHA-256 `7663ce72020163c36fb3cbf20cdff5390a92a7a62da07eec2ada80ce57e5d29f`).
  Package/build only; no device retest or successful S36 acceptance yet.
- Follow-up owner report (2026-11-07): owner selected run #12 as the installed
  standalone APK; after clearing data and uninstalling/reinstalling, chat still
  failed with the optional key field blank on both Wi-Fi and mobile data. This is
  owner-reported; the agent did not inspect the phone package.
- Run #13 owner retest (2026-11-07): owner confirms the supplied screenshot is
  from the run #13 standalone APK. Kilo Auto Free is selected; two assistant
  replies show `KILO_UNKNOWN` and no successful answer. Exact prompt text is not
  recorded. The screen's message says no ledger changes were made, but no
  before/after ledger comparison was supplied. Composer is visible with keyboard
  closed; keyboard-open behavior remains untested. The agent did not verify the
  installed APK hash or observe the phone.
- Source inspection confirms `mobile_qa.ts` maps `provider_error` to
  `KILO_UNKNOWN`. `qa_loop.ts` maps uncategorized errors to `provider_error` and
  also uses it for some invalid/empty completions; `langchain_adapter.ts` wraps
  several unexpected errors generically. The screenshot does not distinguish
  these paths. The anonymous synthetic Gateway probe returned HTTP 200 and a
  complete SSE response but does not validate the app's LangChain path.
- PR #67 (`fix/s36-keyless-provider-diagnostics`) added fixed, safe categories
  for connection, unavailable, access, HTTP, protocol, auth, rate-limit,
  rejected-request and unknown failures. UI receives fixed codes only; no keys,
  prompt text, raw provider bodies, or HTTP body details are exposed. It also
  removed the misleading suggestion to remove a key from the generic fallback.
  Local proof: root coverage 357 tests / 57 files at 100%; root
  typecheck/lint/format/build/privacy/secret scan/audit passed; mobile 21/21
  tests, typecheck/lint/format passed; Expo Android export bundled 1,411
  modules. PR #67 initially had a `format:check` failure in
  `docs/device_tests.md`; formatting was corrected and all required PR checks
  then passed. PR #67 merged as `0dbacde6eaa56d0d00b55b9d5d43e6b75cff53f6`.
- Post-merge main CI (`42358832997`) and Native app (`42358832973`) checks passed.
  Manual S33 standalone APK run #13 (`42358981476`) succeeded on the merge
  commit; runner/toolchain details and the APK hash are in `docs/device_tests.md`.
  APK is archived at
  `../S36-builds/s36-keyless-provider-diagnostics-standalone.apk`. Build succeeded,
  but the owner-reported run #13 screenshot shows two `KILO_UNKNOWN` failures;
  successful S36 acceptance remains pending.

- Provider-scope update: owner chose to retain optional Kilo Auto Free after
  the successful direct synthetic probe, add OpenAI-compatible BYOK, and add
  Anthropic API-key BYOK only. The owner explicitly excluded Claude.ai
  subscription/OAuth login after the current Anthropic policy was reviewed.
  These choices are recorded in `DECISIONS.md`; no real provider keys were
  supplied or used.

## S37a completed — OpenAI-compatible BYOK

- PR #69 (`feat/s37a-openai-compatible-byok`) merged to `main` as
  `d588ec8816d18f5548d089fdf0f3816078bd8672` after required quality, build,
  test, security, privacy, UI, and Native checks passed. S37a remains explicitly
  separate from the unresolved S36 device acceptance.
- Added an explicit native OpenAI-compatible provider choice with configurable
  HTTPS base URL/model, isolated SecureStore API key, provider status in
  chat/settings, fixed provider-specific error copy, and fail-closed handling
  when the selected key is absent. Kilo Auto Free remains a separate optional
  keyless route. No silent fallback, database write, live provider call, or
  real key was used.

## S37b current work — Anthropic API-key BYOK

- Branch `feat/s37b-anthropic-api-key-byok` is based on S37a merge `d588ec8`.
  Test-first specification is in commit `9b9ed20`; implementation commit
  `7f3e4b6` is pushed and PR #70 is open. All required PR checks passed on
  head `250f0453d8cf8851a76c4e5820b929d736afa518`; optional CodeRabbit was
  skipped. No merge has been performed.
- Implemented direct Anthropic Messages requests, tool/message translation,
  bounded request payloads, streaming SSE handling, safe static provider failure
  categories, and explicit user-selected provider routing. Anthropic credentials
  stay in Expo SecureStore; the route fails closed, with no OAuth/subscription
  login, logging of key material, silent provider fallback, or AI database write.
- Local root verification with Node 24.22.2: 382 tests / 58 files and all four
  coverage thresholds at 100%; lint, typecheck, format, privacy, and build pass.
  Focused Anthropic adapter suite: 25/25. Mobile: 37 tests / 4 suites, with
  lint, typecheck, and format passing. Deep secret scan reports zero findings in
  Git history and the working tree after using a low-entropy synthetic fixture.
- Official Anthropic API/versioning/streaming/error/legal references are recorded
  in `docs/references.md`. No live provider request, real API key, APK build, or
  device test was performed. This work does not resolve S36: run #13 remains
  owner-reported evidence of two `KILO_UNKNOWN` failures; cause is unknown.
- Next: wait for owner merge authorization before starting S37c on its own
  branch/PR. S37c disclosure/selection and S37d device verification remain
  separate planned steps.

## Owner-owned open items (do not decide)

- License undecided despite GPL-3.0 LICENSE file.
- Backups plaintext; backup encryption undecided.
- The original native preview reused the web demo reducer through Metro
  `watchFolders`; S35 replaces that native state path with core + `expo-sqlite`.
  The browser preview continues using its own reducer.

## S38 diagnosis checkpoint — device chat failure root-caused and fixed (2026-11-08)

- Branch `fix/s38-langchain-crypto-and-provider-flow`. Root cause of the
  owner-supplied diagnostics (the unresolved S36 `KILO_UNKNOWN`): LangChain
  `@langchain/core@1.3.4` mints a UUID v7 run id via the global
  `crypto.getRandomValues` before any provider HTTP call; Hermes has no Web Crypto
  global, so `BaseChatModel.invoke` threw and every question failed at
  `provider_call` with `langchain_error` and no HTTP events. Node/jest provide
  `crypto`, so tests passed while the device failed. The S35 fix covered ledger
  `randomUUID` only, not the global `getRandomValues`.
- Fix: `apps/mobile/src/assistant/web_crypto.ts` installs a global
  `getRandomValues` from the existing `expo-crypto`, imported first in
  `apps/mobile/index.ts`. No new dependency; `packages/agent` unchanged.
  Regression test reproduces the failure without the polyfill (provider_error,
  zero HTTP) and confirms an end-to-end synthetic answer with it.
- Add-provider flow redesigned (owner request): progressive disclosure, one
  "Save and use" per provider, inline validation; all security guarantees kept.
- Local verification with Node 24.22.2: mobile 57 tests / 9 suites pass; mobile
  typecheck, lint, and format pass; root privacy gate passes; deep secret scan
  reports zero findings. Root Vitest suite re-run after a Node 24 native rebuild.
- No live provider call, real key, APK build, or device run. On-device acceptance
  and the separate diagnostic-export SAF UX item remain owner-only / unplanned.
  No merge performed; awaiting owner review.

## S38 follow-up checkpoint — multi-step chat timeout fixed (2026-11-08)

- Branch `fix/s38-chat-multistep-timeout` (from main `8d11cd3`, which includes the
  merged PR #72 Web Crypto fix). New device diagnostics confirm chat now reaches
  providers, runs read-only tools, and completes many answers.
- Root cause of the remaining "mid-check" failure: the mobile chat used the QA
  loop's 30s default as a single total budget across all tool steps, while a
  single Kilo free-tier call took ~24s and the per-call provider timeout is 45s.
  Multi-step answers timed out mid-second-step. Fix: `store.tsx` now passes
  `timeoutMs: 120000` to `answerQuestion`; mobile-only, loop semantics unchanged.
- The 401 (invalid/expired saved key) and 402 (BYOK billing/credits) failures are
  owner-side credential/billing issues, not code bugs; documented in DECISIONS.md.
- Local verification with Node 24.22.2: mobile 58 tests / 9 suites pass; mobile
  typecheck/lint/format pass; privacy gate passes; deep secret scan zero findings.
- No merge performed; awaiting owner review. On-device retest remains owner-only.

## S37c checkpoint — provider disclosure and selection checks (2026-11-08)

- Branch `feat/s37c-provider-disclosure-checks` from main `8d11cd3`. Added a
  dedicated shell audit suite (S37c) verifying, for Kilo / OpenAI-compatible /
  Anthropic: the selected route label is visible in chat; the provider-specific
  "leaves this device" disclosure is shown; removing a provider key keeps the
  selection (Anthropic gap filled; Kilo/OpenAI-compatible already covered); and a
  provider failure shows safe static copy with zero transactions/proposals created.
- The provider-failure test surfaced an incomplete test mock (mobile_qa mocked
  without mobile_qa_failure_message); the mock now uses the real failure-copy
  function while keeping the agent mocked. No application code change was needed —
  the disclosure/selection guarantees already held; S37c locks them with tests.
- Local verification with Node 24.22.2: mobile 62 tests / 9 suites pass; mobile
  typecheck/lint/format pass; privacy gate passes; deep secret scan zero findings.
- Also performed owner-requested remote cleanup: deleted 70 confirmed-merged
  branches (ancestors of main or squash/rebase-merged PR heads with matching tips).
  Kept main, the open PR #73 branch, and feat/privacy-sensitive-filter (PR #9 merged
  but the branch has newer unmerged commits). Backup SHAs retained for recovery.
- No merge performed; awaiting owner review. S37d device verification owner-only.

## Chat Markdown rendering checkpoint (2026-11-09)

- Merged PR #73 (multi-step chat timeout) and PR #74 (S37c disclosure checks) into
  main with owner authorization. #74 was rebased onto main after #73 (shared
  test/doc anchors) and its CI re-run green before merge. Remote now: main plus
  feat/privacy-sensitive-filter (kept; unmerged commits) and this feature branch.
- Owner device screenshots showed assistant Markdown rendered as literal `**`/`-`
  text. Added a dependency-free `Markdown` renderer (nested RN `<Text>`) and wired
  it into ChatScreen for assistant messages only; user bubbles stay plain.
- Branch `feat/chat-markdown-rendering` from main `dd9d974`. 15 Markdown unit tests
  - 1 chat integration test. Local verification with Node 24.22.2: mobile 79 tests
    / 10 suites pass; typecheck/lint/format pass; Android Metro export succeeds;
    privacy gate passes; deep secret scan zero findings.
- No merge performed for this branch; awaiting owner review. On-device retest of
  the rendered chat remains owner-only (S37d).

## S38a checkpoint — chat correctness and visible progress (2026-11-09)

- Branch `feat/s38-chat-correctness-and-progress` from main `cf16e86`. Owner device
  feedback: model used an old month, answers/tools appeared in one paint, and the
  request looked idle. Added a trusted `currentTime` option and Asia/Calcutta
  current-date/month context to the QA system prompt, plus rupee/status/date
  presentation guidance. Added bounded `onToolEvent` progress callbacks and wired
  live read-only tool cards in the mobile store; paced validated answer reveal so
  React paints progressive updates. Provider calls use Expo's streaming-capable
  fetch. No raw provider deltas or ledger mutation changes.
- Local verification with Node 24.22.2: root lint/format/typecheck pass; Vitest
  395 tests / 58 files pass with 100% coverage gate; mobile 80 tests / 10 suites
  pass; mobile typecheck/lint/format pass; Android and web Metro exports succeed;
  privacy gate passes; deep secret scan zero findings.
- Owner authorization: merge green fixes and continue S38 without confirmation.

## S38b checkpoint — local chat history and recent context (2026-11-09)

- Branch `feat/s38b-local-chat-history` on top of S38a. Added a local-only
  `expo-sqlite/kv-store` chat history adapter that validates rows through core
  `parseConversationMessage`, drops sensitive/invalid messages, bounds storage to
  50 messages, and resumes the latest conversation on app start. The mobile chat
  action now sends a bounded 6-turn recent history window to the QA loop, which
  still applies its privacy filters/redaction before any provider request.
- Local verification with Node 24.22.2: mobile 84 tests / 11 suites pass; mobile
  typecheck/lint/format pass; root lint/format pass. No ledger schema or mutation
  change; no automatic long-term memory.

## S38c checkpoint — multi-key provider manager and model discovery (2026-11-09)

- Branch `feat/s38c-multi-key-model-manager` from main after S38b. Added a
  SecureStore-only multi-profile key registry with custom labels, explicit active
  selection, legacy single-key migration, show/hide, sensitive clipboard copy,
  paste, edit and remove. Added a "Keys and models" screen reachable from Model
  settings, plus provider model discovery (`/models`) for OpenAI-compatible,
  Kilo and Anthropic with manual model fallback. Activating a profile writes the
  existing legacy active-provider/key values so the chat path keeps its current
  no-silent-fallback behavior.
- Added `expo-clipboard@~58.0.4` for explicit user-initiated copy/paste; Android
  copies are marked sensitive. Keys are never stored in the profile registry.
- Local verification with Node 24.22.2: mobile 88 tests / 13 suites pass; mobile
  typecheck/lint/format pass; root lint/format/typecheck pass; Android and web
  Metro exports succeed; privacy gate passes; deep secret scan zero findings.

## S38d checkpoint — diagnostics APK build blocked by upstream Gradle outage (2026-11-09)

- Merged S38a (#76), S38b (#77), S38c (#78), and CI retry hardening (#79) into
  main (`ce707bc`). Triggered the diagnostics test APK workflow on main four
  times: runs 42569531478, 42569746812, 42570078004, and 42570555517.
- All four failed before app compilation because the Gradle wrapper could not
  download `gradle-9.4.1-bin.zip` from services.gradle.org (timeout / HTTP 504).
  The last run used the new 3-attempt retry and still failed at the wrapper
  download stage. This is an upstream artifact-download blocker, not an app code
  or test failure.
- No APK was delivered. S38d/S37d owner device verification remains pending until
  the Gradle distribution endpoint recovers or a trusted mirror/cache is used.

## S38d update — diagnostics test APK delivered (2026-11-09)

- After the upstream Gradle distribution endpoint recovered, workflow run
  42571222498 on main `8d107b2` completed successfully and produced artifact
  `vittaz-diagnostics-test-apk` (artifact id 13652898888).
- APK: `vittaz-diagnostics-test.apk`, 47 MB, SHA-256
  `42bf7ea04a60d15819cf1ab2cf22a63355084aeb2bd51eb2b6da3a88dc0e8de7`.
- This is agent build evidence only. Owner device verification with synthetic
  prompts (S37d/S38d owner evidence) remains pending and must be recorded
  separately.

## Assistant workspace proposal

- Owner requested a persistent + entry on main screens, a conversation list,
  custom instructions and a connectors entry. Plan section 17 and DECISIONS.md
  record the requested follow-up and its privacy boundaries.
- No S39 implementation, tests, CI, APK or device verification has been run yet.
  Next: complete the verified-implementation research and written approach,
  then implement and test conversation migration and request isolation first.

## S39a storage groundwork (in progress)

- Added a separate versioned local conversation storage adapter with validated,
  filtered messages, legacy migration, serialized updates, explicit selection
  and deletion, bounded per-conversation history, and fail-closed corrupt data.
  The legacy copy is removed only after a successful migration write; failed
  writes leave it intact. It is not connected to the app yet.
- Local checks: 94 mobile tests including 6 adapter tests, mobile lint/typecheck/
  format, root lint/format/typecheck, 395 root coverage tests, privacy gate and
  secret scan passed. No APK or device test performed.
- Next: integrate conversation selection with the app state and chat requests;
  prevent in-flight response contamination and add end-to-end UI tests before
  marking S39a done. S39b–S39e remain pending.

## S39a conversation UI integration

- Connected the local conversation index to chat, with a history view, new and
  reopen actions, and confirmed deletion. Switching/deleting is disabled while
  a reply is in flight; recent context is taken only from the active chat.
  Storage failures surface to the user. Existing legacy history is migrated.
- Mobile integration tests cover new/reopen, in-flight blocking and context
  isolation. No owner device verification has been performed.
