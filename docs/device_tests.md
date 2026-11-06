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

| Area                  | Test                                                                                                         | Status                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| S33 environment       | Owner installs `s33-preview-standalone-apk` and opens Vittaz on phone                                        | **passed — owner report 2026-11-05** |
| S34 wiring            | `apps/mobile` imports `packages/core`; `expo-sqlite` repository adapter passes core contract tests on device | pending                              |
| S35 assistant         | Shared assistant, local tasks, conversation persistence, and approval queue work through native storage      | pending                              |
| LangChain             | Bundle size, tool calling, streaming, cold start, and reopen behavior recorded on device                     | pending                              |
| Persistence           | Ledger survives force-stop/reopen; migrations and readonly connections behave as expected                    | pending                              |
| Keystore              | Sensitive credentials stored/retrieved via Android Keystore; no plaintext secret export                      | pending                              |
| Local model           | Download, checksum, memory, latency, and failure handling recorded on target hardware                        | pending                              |
| Telegram              | Optional connector foreground/background behavior and privacy boundary observed on device                    | pending                              |
| Notification listener | Android notification access, synthetic SMS/UPI fixtures, sensitive filtering before persistence/network      | pending                              |
| Voice                 | On-device speech-to-text quality/privacy with synthetic audio                                                | pending                              |
| OCR                   | On-device OCR quality/privacy with synthetic images                                                          | pending                              |

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

## Recording results

For each executed test record: date, device model, Android version, build type,
exact command, observed result, log/artifact path, and failures. If a test is not
run, leave it pending. Never claim device behavior without running it.
