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

## CI proof workflow: `s33-android-proof`

The repository includes a manual GitHub Actions workflow at
`.github/workflows/s33-android-proof.yml`. It is triggered by `workflow_dispatch`
only. It does not use secrets and does not touch `apps/mobile/ui/native`.

What it builds:

1. A blank Expo TypeScript app in a temporary runner directory.
2. Adds `expo-dev-client` with `npx expo install expo-dev-client`.
3. Runs `npx expo prebuild --platform android --clean`.
4. Builds a debug APK with Gradle `assembleDebug`.
5. Uploads `app-debug.apk` as artifact `s33-android-proof-apk` with 7-day
   retention.

### Run the workflow

1. Open the repository on GitHub.
2. Go to **Actions** → **S33 Android proof**.
3. Click **Run workflow** and select the branch containing the workflow.
4. Wait for the job to finish. If it fails, share the failed step/log; do not
   treat a failed build as device proof.

### Download and install on your phone

On the phone:

1. Open the completed workflow run in GitHub.
2. Download the artifact named `s33-android-proof-apk`.
3. Extract the downloaded ZIP and locate `app-debug.apk`.
4. If Android blocks the install, allow installs from unknown sources for the
   app you used to open the APK (for example, your browser or file manager):
   **Settings → Apps → Special app access → Install unknown apps**.
5. Tap `app-debug.apk` and install it.
6. Open the installed blank Expo development build.

Alternatively, if the phone is connected to your PC and `adb devices` shows it as
`device`, you can install the extracted APK with:

```bash
adb install -r app-debug.apk
```

### Report the result

Please report:

- phone model and Android version;
- workflow run URL;
- whether the APK installed;
- whether the app opened;
- any error message or screenshot.

Do not claim device behavior. Mark S33 done only after you report that the app
opened on your phone. A successful CI build or artifact upload alone is not S33
acceptance.

## First recorded CI build (build proof only)

- Workflow run: https://github.com/OnlyXianzo/Vittaz/actions/runs/42031551861
- Job: `blank-expo-debug-apk` — success.
- Commit: `ef030e61ec0af7da092b9d275991e80217539ce2`.
- Artifact: `s33-android-proof-apk`.
- Artifact ZIP SHA-256:
  `bdbb2f62082fb38402cd9ef9e2988f68ebeed8a0fb462e8987ca471565121b8e`.
- Artifact size: 68,974,001 bytes.
- Artifact expires: 2026-11-12T13:06:00Z (7-day retention).
- Built versions reported by the workflow: Expo `~58.0.23`,
  `expo-dev-client` `~58.0.18`, React Native `0.88.1`.
- Gradle result: `BUILD SUCCESSFUL in 7m 35s`.

Status: **pending owner install/open report**. This CI run proves the blank Expo
debug APK built and uploaded. It does not prove the APK installed or opened on a
phone. Do not claim device behavior. Mark S33 done only after the owner reports
that the app opened on their phone.
