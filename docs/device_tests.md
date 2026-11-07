# Device test checklist

Status: **S33 executed and owner-accepted 2026-11-05.** S35 SQLite basic
persistence was owner-reported passed on 2026-11-06. The user supplied S36
screenshots on 2026-11-07 showing a failed chat attempt and reporting a keyboard
composer issue; the installed build is unidentified and no successful S36 test
is established. All S36 acceptance rows remain pending. The agent never observed
the phone; do not extend the screenshot evidence beyond what is recorded below.

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

| Area                  | Test                                                                                                    | Status                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| S33 environment       | Owner installs `s33-preview-standalone-apk` and opens Vittaz on phone                                   | **passed — owner report 2026-11-05**                |
| S34 wiring            | `apps/mobile` imports `packages/core`; core symbols are in the Android bundle                           | build verified; device pending                      |
| S35 SQLite            | Corrected `expo-sqlite` APK; synthetic manual entry survives close/reopen                               | **passed — owner report 2026-11-06**                |
| Add-form clarity      | Direction/Category labels and subtle divider visible in updated standalone APK                          | **passed — owner visual report 2026-11-06**         |
| S35 assistant         | Shared assistant, local tasks, conversation persistence, and approval queue work through native storage | pending                                             |
| LangChain             | Bundle size, tool calling, safe answer display, and reopen behavior recorded on device                  | **failed attempt reported 2026-11-07; fix pending** |
| Persistence           | Ledger survives force-stop/reopen; migrations and readonly connections behave as expected               | pending                                             |
| Keystore              | Sensitive credentials stored/retrieved via Android Keystore; no plaintext secret export                 | pending                                             |
| Local model           | Download, checksum, memory, latency, and failure handling recorded on target hardware                   | pending                                             |
| Telegram              | Optional connector foreground/background behavior and privacy boundary observed on device               | pending                                             |
| Notification listener | Android notification access, synthetic SMS/UPI fixtures, sensitive filtering before persistence/network | pending                                             |
| Voice                 | On-device speech-to-text quality/privacy with synthetic audio                                           | pending                                             |
| OCR                   | On-device OCR quality/privacy with synthetic images                                                     | pending                                             |

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

**Build evidence only (2026-11-07).** Final merged-head manual workflow run
[42279488717](https://github.com/OnlyXianzo/Vittaz/actions/runs/42279488717)
(run #11) succeeded on `main` commit
`10e31794dbec8653b165959104d0bc703c1b578b`. It bundled 1,411 modules and
completed Gradle in 12m 43s with Node 24.22.2, npm 11.19.1, Temurin JDK
17.0.21 and Gradle 9.4.1. Artifact `s33-preview-standalone-apk`
(`app-release.apk`) expires `2026-11-13T19:39:41Z`; APK size is 48,634,494 bytes
and SHA-256 is
`37075cb9a7bcf3d606e171064416ab5ae659fe6bb138bf737f476cccce3c2e35`. A copy
is archived outside the repository at
`../S36-builds/s36-final-merged-standalone.apk`. Static inspection found the
embedded `assets/index.android.bundle`, Kilo Auto Free/read-only tool markers,
and SecureStore DEX class. This is build/package evidence only, not device or
runtime proof. Earlier run #9 (`42273678939`) is a pre-fix historical build and
is superseded by this merged-head artifact.

## S36 first runtime failure report (user-provided screenshots; 2026-11-07)

- Reporter: user supplied screenshots from an Android phone; the agent did not
  operate or observe the device. Device model, Android version, and exact
  installed APK/build are unknown. Do not assume these screenshots came from
  workflow run `42279488717`.
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

The user has now provided S36 failure evidence, superseding the earlier note
that testing was unavailable. Leave S36 acceptance pending until a corrected
build succeeds on-device; do not infer behavior or mark any row passed. If
retesting becomes possible, install
`../S36-builds/s36-final-merged-standalone.apk` (it has an embedded JavaScript
bundle and does not need Metro). Use synthetic data. First use Kilo Auto Free without a key; it is
keyless but may route prompts to upstream providers that log them. Do not enter
a key unless testing with the owner's own Kilo key. Any entered key should be
checked only for save/remove/reopen status; never copy the value into a report.

1. Open Settings → Model and keys; confirm Kilo Auto Free is available with no
   key. Optionally save the owner's own Kilo Gateway key and verify it is
   masked, then force-stop/reopen and verify only that a saved-key indicator is
   present. Remove it after the check if desired.
2. From Home choose “Add or ask by message”, enter a synthetic question such as
   “What did I spend this month?”, then tap Ask Assistant. The app navigates to
   Chat and sends that question. Verify the local read-only summary tool is
   called and no ledger row or proposal is written. Record whether a real Kilo
   answer arrives or the request fails.
3. The app requests SSE, but intentionally buffers provider output until the
   bounded Q&A loop validates the complete final answer; only then does the UI
   reveal safe answer chunks. This is not raw real-time token streaming. Record
   the visible progression and timing without describing it as live provider
   token streaming.
4. Force-stop and reopen Vittaz. Confirm app startup and local ledger contents;
   chat messages themselves are not claimed to persist. Report any network,
   SecureStore, tool-call, or rendering errors.

No successful S36 device result has been reported; the user-provided screenshots
record a failed chat attempt and a keyboard/composer complaint only. The sandbox
has no Android SDK, JDK 17, adb, or connected device, so the agent cannot run
these phone checks.

## Recording results

For each executed test record: date, device model, Android version, build type,
exact command, observed result, log/artifact path, and failures. If a test is not
run, leave it pending. Never claim device behavior without running it.
