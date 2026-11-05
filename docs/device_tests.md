# Device test checklist

Status: **not executed**. No Android device behavior has been verified by this
agent. G3 is owner-accepted; S33 is in progress. The owner must run `adb devices`
on their PC and provide the output before any device claim.

This file is the place to record actual device runs only after they happen. Do
not mark a row complete from emulator assumptions, Expo Go behavior, web preview,
or Node tests.

## Preconditions

- Owner signs off G3. **Done 2026-11-05.**
- S33 provides `npm run android:env` and `docs/android_environment.md`.
- Owner runs `adb devices` and confirms the target device is visible. **Pending.**
- Owner builds/installs a blank Expo development build. **Pending.**
- Synthetic data only; no real accounts, messages, or provider keys.

## Checklist

| Area                  | Test                                                                                                         | Status                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| S33 environment       | CI blank Expo debug APK artifact builds; owner installs and opens it on phone; `adb devices` optional proof  | pending owner install/open report |
| S34 wiring            | `apps/mobile` imports `packages/core`; `expo-sqlite` repository adapter passes core contract tests on device | pending                           |
| S35 assistant         | Shared assistant, local tasks, conversation persistence, and approval queue work through native storage      | pending                           |
| LangChain             | Bundle size, tool calling, streaming, cold start, and reopen behavior recorded on device                     | pending                           |
| Persistence           | Ledger survives force-stop/reopen; migrations and readonly connections behave as expected                    | pending                           |
| Keystore              | Sensitive credentials stored/retrieved via Android Keystore; no plaintext secret export                      | pending                           |
| Local model           | Download, checksum, memory, latency, and failure handling recorded on target hardware                        | pending                           |
| Telegram              | Optional connector foreground/background behavior and privacy boundary observed on device                    | pending                           |
| Notification listener | Android notification access, synthetic SMS/UPI fixtures, sensitive filtering before persistence/network      | pending                           |
| Voice                 | On-device speech-to-text quality/privacy with synthetic audio                                                | pending                           |
| OCR                   | On-device OCR quality/privacy with synthetic images                                                          | pending                           |

## Recording results

For each executed test record: date, device model, Android version, build type,
exact command, observed result, log/artifact path, and failures. If a test is not
run, leave it pending. Never claim device behavior without running it.
