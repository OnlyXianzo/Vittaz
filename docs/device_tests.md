# Device test checklist

Status: **S33 executed and owner-accepted 2026-11-05.** S35 SQLite basic
persistence was owner-reported passed on 2026-11-06. The user supplied S36
screenshots on 2026-11-07 showing failed chat attempts and earlier keyboard
composer concerns, then confirmed run #12 standalone APK still failed after
clearing app data and uninstall/reinstall on Wi-Fi and mobile data with the
optional key field blank. PR #67's safe diagnostic categories are merged, and
standalone APK run #13 is available for retest. No successful S36 answer is
established; the latest captures do not retest keyboard-open behavior.
All S36 acceptance rows remain pending.
The agent never observed the phone. Do not extend the user report beyond what is
recorded below.

This file is the place to record actual device runs only after they happen. Do
not mark a row complete from emulator assumptions, Expo Go behavior, web preview,
or Node tests.

## Preconditions

- Owner signs off G3. **Done 2026-11-05.**
- S33 provides `npm run android:env` and `docs/android_environment.md`.
- Owner installs and opens the app on their phone. **Done 2026-11-05** (see the
  S33 record below). `adb devices` was optional and was not used as the evidence.
- Synthetic data only; no real accounts, messages, or provider keys.

## Checklist

| Area                  | Test                                                                                                    | Status                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| S33 environment       | Owner installs `s33-preview-standalone-apk` and opens Vittaz on phone                                   | **passed — owner report 2026-11-05**                                          |
| S34 wiring            | `apps/mobile` imports `packages/core`; core symbols are in the Android bundle                           | build verified; device pending                                                |
| S35 SQLite            | Corrected `expo-sqlite` APK; synthetic manual entry survives close/reopen                               | **passed — owner report 2026-11-06**                                          |
| Add-form clarity      | Direction/Category labels and subtle divider visible in updated standalone APK                          | **passed — owner visual report 2026-11-06**                                   |
| S35 assistant         | Shared assistant, local tasks, conversation persistence, and approval queue work through native storage | pending                                                                       |
| LangChain             | Bundle size, tool calling, safe answer display, and reopen behavior recorded on device                  | **run #12 failed; run #13 diagnostic retest pending; S36 acceptance pending** |
| Persistence           | Ledger survives force-stop/reopen; migrations and readonly connections behave as expected               | pending                                                                       |
| Keystore              | Sensitive credentials stored/retrieved via Android Keystore; no plaintext secret export                 | pending                                                                       |
| Local model           | Download, checksum, memory, latency, and failure handling recorded on target hardware                   | pending                                                                       |
| Telegram              | Optional connector foreground/background behavior and privacy boundary observed on device               | pending                                                                       |
| Notification listener | Android notification access, synthetic SMS/UPI fixtures, sensitive filtering before persistence/network | pending                                                                       |
| Voice                 | On-device speech-to-text quality/privacy with synthetic audio                                           | pending                                                                       |
| OCR                   | On-device OCR quality/privacy with synthetic images                                                     | pending                                                                       |

## S33 device record (owner-reported)

- Date: 2026-11-05.
- Reporter: owner. The agent did not run or observe the device.
- Build: `s33-preview-standalone-apk` / `app-release.apk`, release variant with
  embedded Hermes bundle, from workflow run
  https://github.com/OnlyXianzo/Vittaz/actions/runs/42044273087 on main
  `816df5177299bf6ed9ff201c7be52e948d0811f4`.
- Package: `com.vittaz.preview`. Sideloaded; no Metro server involved.
- Owner result: **installed and opened; Vittaz rendered the Home screen.**
- Phone model and Android version: not supplied by the owner; left unrecorded
  rather than guessed.
- Not established by this run: persistence across force-stop/reopen, SQLite,
  Keystore, Telegram, local model, or any `packages/core` wiring. The preview
  still runs the web demo reducer with synthetic data.
- Earlier attempt with the blank `s33-android-proof-apk` **crashed** on
  `RNCSafeAreaProvider`. That failure is retained in
  `docs/android_environment.md` with the binary comparison that explains it.

## S35 save-error report (owner-reported)

- Date: 2026-11-06.
- Reporter: owner; screenshot supplied after trying the post-S35 APK. The agent
  did not run or observe the phone.
- Build: post-S35 standalone APK from run `42215554135` (embedded JS; no Metro
  server required).
- Owner observed the Add transaction screen, then Save displayed
  `Cannot read property 'randomUUID' of undefined`.
- Diagnosis: the app reached core but relied on `globalThis.crypto.randomUUID`,
  which is absent in the target Android Hermes runtime. The error occurs before
  the transaction insert; the failed attempt was not saved. It is a runtime
  compatibility issue, not missing Metro or a blank-screen failure.
- Corrective change: PR #58 merged as `e548227`; app now injects SDK-matched
  Expo Crypto UUID generation for manual saves and proposal approval. This is
  covered by tests with `globalThis.crypto` removed. The owner later confirmed
  successful save and close/reopen on the corrected APK; see below.
- Corrected standalone build: [workflow run 42228039226](https://github.com/OnlyXianzo/Vittaz/actions/runs/42228039226), attempt 2 succeeded; download artifact `s33-preview-standalone-apk` (expires 2026-11-13 13:58 UTC). APK SHA-256: `3874cdb8ed54f5e4dec52d798bbc0f20c8a71f6a52fde0672f716c103be708b0`. Static inspection found the Expo Crypto DEX module and embedded JavaScript; this is build evidence, not phone evidence. The initial attempt failed because Gradle could not resolve the Foojay resolver plugin; the same job rerun passed without source changes.

## S35 corrected-APK persistence result (owner-reported)

- Date: 2026-11-06.
- Reporter: owner. The agent did not run or observe the phone.
- Build: corrected standalone artifact `s33-preview-standalone-apk` from run
  `42228039226` (attempt 2 succeeded; SHA-256 and expiry recorded above).
- Owner confirmed the entry used for the check was synthetic/test-only and
  remained visible after closing and reopening Vittaz. Screenshots show the
  successful save toast and ledger row; personal/financial details are not
  copied into this record.
- Phone model and Android version were not supplied.
- Result: **S35 SQLite basic manual-save persistence passed by owner report.**
  This does not establish the assistant, proposal approval, migrations, readonly
  connections, Keystore, or any other pending device test.

## Add-form grouping visual review (owner-reported)

- The owner approved the Direction/Category labels and subtle divider; PR #60
  merged the presentation-only change as `ee274c51b654ddd04d98efce25ba23442cfd570b`.
- Updated standalone build: [workflow run 42237936656](https://github.com/OnlyXianzo/Vittaz/actions/runs/42237936656), attempt 1 succeeded. Artifact `s33-preview-standalone-apk` expires `2026-11-13T15:07:16Z`.
- APK SHA-256: `9940af8fd4f31f6b1fa03a277474b74b5727a349cbc2425789a18743a808d8f3`.
- Owner confirmed that the updated layout looks right on-device on 2026-11-06. The agent did not run or observe the phone; no phone model or Android version was supplied. This visual confirmation is separate from S35 SQLite basic persistence, which passed by owner report on the earlier corrected APK.

## S36 APK owner test flow (pending)

**Superseded build evidence only (2026-11-07).** Manual workflow run
[42279488717](https://github.com/OnlyXianzo/Vittaz/actions/runs/42279488717)
(run #11) succeeded on `main` commit
`10e31794dbec8653b165959104d0bc703c1b578b`. It bundled 1,411 modules and
completed Gradle in 12m 43s with Node 24.22.2, npm 11.19.1, Temurin JDK
17.0.21 and Gradle 9.4.1. Artifact `s33-preview-standalone-apk`
(`app-release.apk`) expired `2026-11-13T19:39:41Z`; APK size was 48,634,494 bytes
and SHA-256 was
`37075cb9a7bcf3d606e171064416ab5ae659fe6bb138bf737f476cccce3c2e35`. A copy
remains outside the repository at
`../S36-builds/s36-final-merged-standalone.apk`. This APK predates provider-
diagnostics PR #64 and keyboard PR #65; do not use it to verify either change.
Earlier run #9 (`42273678939`) is a pre-fix historical build. Static inspection
of either APK does not establish device/runtime behavior.

## S36 safe-diagnostics APK build evidence — run #13 (2026-11-07; not device-tested)

PR #67 (`fix/s36-keyless-provider-diagnostics`) added fixed categories and codes
for safe provider failure reporting without exposing prompt text, credentials,
raw response bodies, or HTTP body details. It was squash-merged as
`0dbacde6eaa56d0d00b55b9d5d43e6b75cff53f6`. Required PR checks passed, as did
post-merge main CI run `42358832997` and Native app run `42358832973`.

Manual workflow run [42358981476](https://github.com/OnlyXianzo/Vittaz/actions/runs/42358981476)
(run #13) succeeded on that main commit. It used GitHub Actions runner
`2.338.2`, Ubuntu `24.04.5`, image `ubuntu-24.04` version `20261101.360.1`,
Node `24.22.2`, npm `11.19.1`, Temurin JDK `17.0.21`, and Gradle `9.4.1`.
Expo prebuild, native-module checks, Metro bundle (1,411 modules), standalone
release and dev-client-debug Gradle tasks, embedded-bundle assertion,
unchanged-checkout assertion, and uploads passed; Gradle reported
`BUILD SUCCESSFUL in 12m 45s`. The workflow was manually dispatched, has
`contents: read` permission, uses SHA-pinned actions, builds from a temporary
copy, supplies no secrets, and sets 7-day artifact retention.

- Standalone `s33-preview-standalone-apk` artifact ID: `13568469222`; expires
  `2026-11-14T09:30:02Z`. `app-release.apk`: 48,638,510 bytes; SHA-256
  `46f1319dda4a3e21f0943791ecc0bd24e5f8afdaebd275b08eb9336458f02559`.
- Archived outside the repo at
  `../S36-builds/s36-keyless-provider-diagnostics-standalone.apk`.
- Separate dev-client artifact ID: `13569191780`. Use the standalone release
  APK for owner retest; it embeds JavaScript and needs no Metro server.
- Static package inspection found the new fixed diagnostic strings. This is
  build/package evidence only: it does not prove provider connectivity or phone
  behavior. The run #13 APK has not yet been retested by the owner.

## S36 post-follow-up APK build evidence (2026-11-07; not device-tested)

Manual workflow run [42343693444](https://github.com/OnlyXianzo/Vittaz/actions/runs/42343693444)
(run #12, attempt 1) succeeded on `main` commit
`6b190cfa76cbb6b5ed6bed74b805d2fc4179ec9e`, after PR #64 provider diagnostics
and PR #65 keyboard handling. The job used GitHub Actions runner `2.338.2`,
Ubuntu `24.04.5`, image `ubuntu-24.04` version `20261101.360.1`, Node `24.22.2`,
npm `11.19.1`, Temurin JDK `17.0.21`, and Gradle `9.4.1`. Expo prebuild,
required-native-module checks, Metro bundle (1,411 modules), standalone-release
and dev-client-debug Gradle tasks, embedded-bundle assertion, unchanged-checkout
assertion, and artifact uploads all passed; Gradle reported `BUILD SUCCESSFUL in
12m 20s`. The workflow was manually dispatched, has `contents: read` permission,
uses SHA-pinned actions, builds from a temporary copy, supplies no secrets, and
sets 7-day artifact retention.

- Standalone `s33-preview-standalone-apk` artifact ID: `13563145707`; expires
  `2026-11-14T05:53:58Z`. `app-release.apk`: 48,636,434 bytes; SHA-256
  `7663ce72020163c36fb3cbf20cdff5390a92a7a62da07eec2ada80ce57e5d29f`.
- Archived outside the repo at
  `../S36-builds/s36-merged-post-chat-fixes-standalone.apk`.
- Separate dev-client artifact ID: `13563185557`; it contains
  `debug/app-debug.apk` (100,899,463 bytes). Use the standalone release APK for
  owner retest; it embeds JavaScript and needs no Metro server.
- ZIP inspection confirms `assets/index.android.bundle` (4,611,096 bytes),
  Android native libraries, and DEX files. These are package facts only. The
  agent did not install or run this APK on a device. The user later confirmed
  this run #12 standalone APK was on the phone; that identity is owner-reported,
  not independently verified by the agent.

## S36 post-fix run #12 retest (owner-reported; 2026-11-07)

- The user selected the run #12 standalone APK from the artifact/archive described
  above as the installed build. The agent did not inspect the phone's installed
  package or independently verify its hash.
- The user reports that clearing app data and uninstalling/reinstalling did not
  resolve chat failures; the optional key field is blank and the failure occurs
  on both Wi-Fi and mobile data. This reduces the likelihood of a stale saved key
  or a single-network issue but does not identify the failure stage.
- The latest screenshots show the composer with the keyboard closed. They do not
  confirm or disprove the keyboard-open fix.
- Result: **failed attempt; no successful answer, tool call, or S36 acceptance is
  established.** Do not ask the user to clear data or remove a key again. Run
  #12's `provider_error` fallback merged distinct failure classes. PR #67 has
  now merged, and run #13 provides fixed codes for connection, unavailable,
  access, HTTP, protocol, auth, rate limit, rejected request, or unknown
  failures. Run #13 owner retest remains pending. No raw response, prompt, or
  credential is requested or recorded.

## S36 first runtime failure report (user-provided screenshots; 2026-11-07)

- Reporter: user supplied screenshots from an Android phone; the agent did not
  operate or observe the device. Device model, Android version, and exact
  installed APK/build are unknown. The screenshots predate run #12; they cannot
  be attributed to either merged-head APK or a specific build.
- Chat header shows Kilo Auto Free, and multiple submitted messages are followed
  by the same generic “couldn't get a safe answer” fallback. No HTTP status,
  provider error category, or response body is present in the screenshots, so
  the precise cause is not established.
- Settings screenshots show a masked optional key and a “Kilo key saved
  securely” toast. This confirms only the UI save acknowledgement, not that the
  key was read back or accepted by Kilo. The key value is not transcribed or
  requested; never send it in chat, screenshots, logs, or reports.
- A user-provided keyboard-open screenshot visibly shows the Android keyboard
  while the message composer and send controls are absent; a separate keyboard-
  closed capture shows the composer. This directly corroborates the reported
  visibility failure. The fix still needs on-device retest.
- Outcome: **failed attempt; no successful S36 answer/tool/reopen acceptance is
  established.** The exact build and any ledger before/after comparison are not
  known.
- A single anonymous synthetic request to the Kilo endpoint/model returned HTTP
  200 SSE during agent investigation. This does not validate the optional saved
  key or the mobile app's full Q&A path. See `docs/references.md` for probe
  details.

Auto Free may route or log prompts upstream. Some screenshot text could be
personal/financial; it is intentionally not copied into this record. Do not
enter real financial data in further tests. The app cannot retract prompts that
may already have been sent; Kilo's current routing/retention for those requests
is not known.

The owner-reported run #12 failure remains unresolved: chat failed after clearing
data and uninstall/reinstall on Wi-Fi and mobile data, with the optional key
field blank. PR #67 added safe fixed failure classes and the new standalone run
#13 APK is ready for a focused retest. The app embeds JavaScript and needs no
Metro server. This is still a request for owner testing; no phone behavior or
successful answer is established by the build or static inspection. Auto Free
may route prompts to upstream providers that log them, so use synthetic data only.

1. Install/open the standalone APK from S33 run #13, not the dev-client APK.
   Do not clear data, uninstall/reinstall, or change/remove a key as a presumed
   fix; the owner has already confirmed the field is blank and tested two
   networks.
2. In Chat, open the keyboard and check that the composer and send button stay
   visible. Submit one synthetic, read-only question (for example, “What did I
   spend this month?”). No real ledger details are needed.
3. Report only whether an answer arrived, the fixed diagnostic code if it failed
   (`KILO_CONNECTION`, `KILO_UNAVAILABLE`, `KILO_ACCESS`, `KILO_HTTP`,
   `KILO_PROTOCOL`, `KILO_AUTH`, `KILO_RATE_LIMIT`, `KILO_REQUEST_REJECTED`, or
   `KILO_UNKNOWN`), and whether composer/send remained visible with the keyboard
   open. Do not send keys, prompt text, raw provider responses, or personal data.

No successful S36 device result has yet been reported. Existing screenshots
record a failed chat attempt and, in an earlier capture, the composer absent
while the keyboard was open; run #13 retest is pending. The sandbox has no
Android SDK, JDK 17, adb, or connected device, so the agent cannot run these
phone checks.

## Recording results

For each executed test record: date, device model, Android version, build type,
exact command, observed result, log/artifact path, and failures. If a test is not
run, leave it pending. Never claim device behavior without running it.
