# Android environment (S33)

This guide is for the **owner PC** that will connect to the Android phone. The
agent sandbox cannot see your phone. No Android device behavior is verified until
you run these commands and share the actual output.

## 1. Install prerequisites

Follow the official Expo Android setup:
https://docs.expo.dev/workflow/android-studio-emulator/

Required:

- JDK 17.
- Android Studio with Android SDK Platform 36, SDK Build-Tools, and Android SDK
  Platform-Tools.
- `ANDROID_HOME` pointing at the SDK, and `platform-tools` on `PATH`.
- Node `24.22.2` and npm `11.19.1` for this repository.

## 2. Enable USB debugging and check adb

On the phone: enable Developer options and USB debugging. Connect by USB and
accept the RSA debugging prompt.

On the owner PC:

```bash
adb devices
```

Expected: at least one line ending in `device`. If it says `unauthorized`, accept
the prompt on the phone. If it says `offline`, reconnect USB or restart adb:

```bash
adb kill-server
adb start-server
adb devices
```

Optional repository checker:

```bash
npm ci
npm run android:env
```

The checker prints JSON with snake_case keys and masks serials. It is only an
environment report. A passing report still does not prove app behavior.

## 3. Build a blank Expo development build

S33 uses a blank Expo development build to prove the native toolchain before
wiring Vittaz core. Do not use Expo Go as device proof.

In a separate temporary directory on the owner PC:

```bash
npx create-expo-app@latest vittaz-s33-blank --template blank-typescript
cd vittaz-s33-blank
npx expo install expo-dev-client
npx expo run:android --device
```

If native configuration or dependencies change later, follow Expo’s guidance and
run `npx expo prebuild --clean` before rebuilding.

Record:

- date and PC OS;
- phone model and Android version;
- `adb devices` output (serials may be masked);
- Expo SDK and `expo-dev-client` versions installed by `npx expo install`;
- whether the blank development build installed and opened;
- any failure output.

## 4. What S33 does not do

- It does not promote or rewrite `apps/mobile/ui/native`.
- It does not wire `packages/core` or `expo-sqlite`; that is S34–S35.
- It does not open `canvas/screens.zip` or implement UI slices.
- It does not decide license, backup encryption, or the native preview reducer
  replacement.
