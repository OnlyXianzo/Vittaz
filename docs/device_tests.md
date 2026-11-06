# Device test checklist

Status: **S33 executed and owner-accepted 2026-11-05.** All later rows remain
**not executed**. The agent never observed the phone; the only device evidence is
the owner's own report, recorded below. Do not extend that report to any other
row.

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

| Area                  | Test                                                                                                    | Status                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| S33 environment       | Owner installs `s33-preview-standalone-apk` and opens Vittaz on phone                                   | **passed — owner report 2026-11-05**                              |
| S34 wiring            | `apps/mobile` imports `packages/core`; core symbols are in the Android bundle                           | build verified; device pending                                    |
| S35 SQLite            | Corrected `expo-sqlite` APK; synthetic manual entry survives close/reopen                               | **pending owner retry — corrected APK run 42228039226 available** |
| S35 assistant         | Shared assistant, local tasks, conversation persistence, and approval queue work through native storage | pending                                                           |
| LangChain             | Bundle size, tool calling, streaming, cold start, and reopen behavior recorded on device                | pending                                                           |
| Persistence           | Ledger survives force-stop/reopen; migrations and readonly connections behave as expected               | pending                                                           |
| Keystore              | Sensitive credentials stored/retrieved via Android Keystore; no plaintext secret export                 | pending                                                           |
| Local model           | Download, checksum, memory, latency, and failure handling recorded on target hardware                   | pending                                                           |
| Telegram              | Optional connector foreground/background behavior and privacy boundary observed on device               | pending                                                           |
| Notification listener | Android notification access, synthetic SMS/UPI fixtures, sensitive filtering before persistence/network | pending                                                           |
| Voice                 | On-device speech-to-text quality/privacy with synthetic audio                                           | pending                                                           |
| OCR                   | On-device OCR quality/privacy with synthetic images                                                     | pending                                                           |

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
  covered by tests with `globalThis.crypto` removed, but device behavior remains
  **unverified**.
- Corrected standalone build: [workflow run 42228039226](https://github.com/OnlyXianzo/Vittaz/actions/runs/42228039226), attempt 2 succeeded; download artifact `s33-preview-standalone-apk` (expires 2026-11-13 13:58 UTC). APK SHA-256: `3874cdb8ed54f5e4dec52d798bbc0f20c8a71f6a52fde0672f716c103be708b0`. Static inspection found the Expo Crypto DEX module and embedded JavaScript; this is build evidence, not phone evidence. The initial attempt failed because Gradle could not resolve the Foojay resolver plugin; the same job rerun passed without source changes.
- Required retest: install the corrected APK, save synthetic data, close/reopen
  the app, and confirm the row remains. Leave this row blocked until the owner
  reports the result; do not start S36 before this blocker is cleared.

## Recording results

For each executed test record: date, device model, Android version, build type,
exact command, observed result, log/artifact path, and failures. If a test is not
run, leave it pending. Never claim device behavior without running it.
