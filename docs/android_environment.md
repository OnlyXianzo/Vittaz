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

## Current S38 diagnostics test APK — synthetic data only

The manual workflow
`.github/workflows/mobile-diagnostics-test-apk.yml` builds the **actual
Vittaz app** with a diagnostics-only app identity. In GitHub, open **Actions** →
**Vittaz mobile diagnostics test APK** → **Run workflow**. Download the
`vittaz-diagnostics-test-apk` artifact and install `app-release.apk`.

This APK is named **Vittaz TEST ONLY**, displays a persistent **TEST BUILD ONLY
— SYNTHETIC DATA ONLY** banner, and uses Android package
`com.vittaz.diagnostics.test`. It can be installed beside personal Vittaz; do
not uninstall or overwrite your personal app to use it. The diagnostics screen
is in Settings. It displays the most recent safe operational events and has an
explicit **Save test log to Downloads** button. The first save asks Android for
folder permission: select Downloads (the app creates `Vittaz-Diagnostics`) or
select that existing folder. The resulting JSON is stored under
`Downloads/Vittaz-Diagnostics/` on the device. Exporting is user-triggered; do
not share the file until you have checked it.

**Use synthetic data only. Do not enter personal questions, ledger records,
provider credentials, or API keys.** Kilo requests may leave the device, even
when no key is used. Diagnostics intentionally exclude prompts, replies, ledger
values, keys/tokens, full URLs, provider bodies, and exception text; they record
only safe operational event codes, fixed reasons, stages, provider kind, status,
elapsed time, and allowlisted tool names. Use the event timestamp, provider,
HTTP category and stage to describe the failure; don't add private input to a
report.

Please report whether it installed/opened, whether Kilo returns an answer using
a synthetic question, whether the export button wrote a JSON file under the
expected Downloads folder, and the phone model/Android version. An APK build,
static bundle check, or log export **does not claim device behavior** and does
not by itself prove the cause of `KILO_UNKNOWN`.

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

- It does not promote or rewrite the owner UI. (S34 later promoted it to
  `apps/mobile` with the owner's explicit approval, via `git mv`.)
- It does not wire `packages/core` or `expo-sqlite`; that is S34–S35.
- It does not open `canvas/screens.zip` or implement UI slices.
- It does not decide license, backup encryption, or the native preview reducer
  replacement.

## CI proof workflow: `s33-android-proof`

The repository includes a manual GitHub Actions workflow at
`.github/workflows/s33-android-proof.yml`. It is triggered by `workflow_dispatch`
only. It does not use secrets and does not modify the owner UI in the checkout.

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

Status: **superseded**. This CI run proved only that the blank Expo debug APK
built and uploaded. The owner's attempt to load the preview bundle into it
crashed on `RNCSafeAreaProvider`; see the mismatch section below. S33 was
ultimately accepted against the preview standalone APK, not this artifact.

## Why the blank proof APK crashed on the preview bundle

The blank `s33-android-proof` APK and the Metro preview are **two different native
apps**. A development build contains only the native modules that were compiled
into it. The blank Expo template autolinks `expo-*` modules only; it contains no
`react-native-safe-area-context`, no `react-native-svg`, and no
`expo-linear-gradient`.

The owner preview (now at `apps/mobile`, formerly `apps/mobile/ui/native`)
declares all three, and its
`App.tsx` wraps the tree in `SafeAreaProvider`. When the blank APK loaded the
preview's JavaScript from Metro, the Fabric renderer could not find the native
view manager and threw:

```
IllegalViewOperationException: Enqueueing view tag ... RNCSafeAreaProvider
```

This is a **binary/bundle mismatch**, not a defect in the preview UI and not a
defect in the blank build. Two consequences:

- `npx expo install react-native-safe-area-context` in
  the preview cannot fix it. The preview already declares the correct
  SDK 58 version (`~5.11.1`), and installing JavaScript never adds native code to
  an APK that is already built.
- The APK must be rebuilt from a project that contains those native modules.

The blank debug APK also has a second limitation: `assembleDebug` does not embed
a JavaScript bundle (the generated Gradle config skips bundling for debuggable
variants), so it always needs a reachable Metro server.

## Historical CI preview workflow (S33 through S36; renamed for S38)

The former `.github/workflows/s33-preview-apk.yml` built the **owner preview
itself**, so the native binary and JavaScript bundle matched. Its historical
build and device records are retained below. S38 replaced that active workflow
with `.github/workflows/mobile-diagnostics-test-apk.yml`; use the current
instructions in the S38 section above rather than these old artifact instructions.

It never modifies the checkout. Since S34 it copies `apps/mobile` into the
runner temp directory; the shared domain travels with it at `ui/src`, preserving
the Metro `watchFolders` layout. All mutation happens in that copy:

1. `npm ci` from the owner's lockfile.
2. `npx expo install expo-dev-client` — **in the temp copy only**.
3. `npx expo prebuild --platform android --clean`.
4. An assertion step that fails the build unless
   `react-native-safe-area-context`, `react-native-svg`, `expo-linear-gradient`,
   and `expo-dev-client` are all autolinked. This is the check that would have
   caught the original mismatch before shipping an APK.
5. Gradle `assembleRelease assembleDebug` for `arm64-v8a,armeabi-v7a`, with R8
   minification disabled to keep the preview build conservative.
6. An assertion that the release APK really contains `assets/index.android.bundle`.
7. `git diff --exit-code` and `git status --porcelain` to prove the checkout was
   not modified.

### Which artifact to install

| Artifact                     | File              | Needs Metro? | Use                                       |
| ---------------------------- | ----------------- | ------------ | ----------------------------------------- |
| `s33-preview-standalone-apk` | `app-release.apk` | No           | **Install this one.** Bundle is embedded. |
| `s33-preview-devclient-apk`  | `app-debug.apk`   | Yes          | Live reload against your own Metro.       |

The **standalone** artifact is a release-variant build with the JavaScript bundle
embedded by Metro at build time. It **does not need Metro**, does not need your
PC, and does not need the phone and PC to share a network. `expo-dev-launcher`
compiles to a no-op in release, so the dev menu is not present.

The generated Expo Gradle config signs the release variant with the debug
keystore. That is fine for sideloaded device proof and is **not** a production
signing setup; a real keystore is a later, owner-owned decision.

The dev-client artifact is the debug variant. Use it only when you want live
reload, and only against a Metro server started from
`apps/mobile` — not against the blank proof app.

### Historical run instructions (workflow name retired)

At the time, the owner selected **Actions** → **S33 preview APK** → **Run workflow**,
then downloaded `s33-preview-standalone-apk`. These steps describe historical
builds only; the active S33 filename was replaced for S38. 4. Allow unknown-source installs for the app opening the APK
(**Settings → Apps → Special app access → Install unknown apps**). 5. Open **Vittaz**. It installs as package `com.vittaz.preview`, separate from the
blank proof app, so both can coexist.

If a previous preview APK was signed with a different key, Android will refuse
the update; uninstall the old Vittaz preview first.

### Report the result

Report phone model, Android version, the workflow run URL, whether it installed,
whether it opened, and what the first screen showed. A screenshot is ideal.

Do not claim device behavior. S33 closes only on your report that the app opened
on your phone. A green CI run and an uploaded artifact are build proof only.

### What this build still is not

The preview still runs the **web demo reducer** through Metro `watchFolders`.
It is synthetic demo data, not your real ledger. Replacing that reducer with
`packages/core` behind an `expo-sqlite` adapter is S34–S35. This APK proves the
native shell runs on your phone; it does not prove persistence or core wiring.

## Recorded preview CI build (build proof only)

- Workflow run: https://github.com/OnlyXianzo/Vittaz/actions/runs/42044273087
- Job: `preview-apk` — success, `BUILD SUCCESSFUL in 12m 4s`, 1110 Gradle tasks.
- Commit: `816df5177299bf6ed9ff201c7be52e948d0811f4`.
- Autolinking assertion: `missing: []`. RN autolinked
  `react-native-safe-area-context` and `react-native-svg`; Expo autolinked
  `expo-linear-gradient` and `expo-dev-client`.
- Gradle compiled 85 `react-native-safe-area-context` tasks and 82
  `react-native-svg` tasks. `expo-linear-gradient` ships a prebuilt Maven
  publication (`local-maven-repo`), so it is consumed as a dependency rather than
  built as a Gradle subproject; its native module is present in the APK.
- Metro bundled the release JS: `Android Bundled 30732ms index.ts (855 modules)`.
- Repository-unchanged assertion passed (`git diff --exit-code`,
  `git status --porcelain` both clean).

Artifacts, both expiring `2026-11-12T14:35Z` (7-day retention):

| Artifact                     | APK size     | ZIP size     | ZIP SHA-256                                                        |
| ---------------------------- | ------------ | ------------ | ------------------------------------------------------------------ |
| `s33-preview-standalone-apk` | 42,780,626 B | 22,465,755 B | `245c426b46fd29cea30fd2bae22f5ff2c55712a52e56fc9bbd59f2de627e3954` |
| `s33-preview-devclient-apk`  | 97,730,790 B | 44,274,104 B | not downloaded                                                     |

### Binary comparison: blank proof APK vs preview standalone APK

Both artifacts were downloaded and inspected directly. This is the objective
evidence for the crash diagnosis and its fix.

| Check                                  | Blank proof APK | Preview standalone APK                |
| -------------------------------------- | --------------- | ------------------------------------- |
| `RNCSafeAreaProvider` in DEX           | absent          | present                               |
| `SafeAreaProviderManager` in DEX       | absent          | present                               |
| `SvgViewManager` / `SvgPackage` in DEX | absent          | present                               |
| `LinearGradientModule` in DEX          | absent          | present                               |
| `libreact_codegen_safeareacontext.so`  | absent          | present                               |
| `libreact_codegen_rnsvg.so`            | absent          | present                               |
| `assets/index.android.bundle`          | absent          | present, 1,889,140 B                  |
| Bundle format                          | n/a             | Hermes bytecode (magic `c6 1f bc 03`) |

The blank APK contains none of the native code the preview JavaScript requires,
and no JavaScript at all. The preview APK contains all of it plus an embedded
Hermes bundle. That is why the blank APK crashed on `RNCSafeAreaProvider` and why
the standalone preview APK does not need Metro.

Status: **accepted by owner 2026-11-05**. The owner installed
`s33-preview-standalone-apk` from this run and reported that Vittaz opened and
rendered the Home screen on their phone. That owner report is the S33 acceptance
evidence; it is recorded in `docs/device_tests.md`. The binary facts above are
build proof, not device proof, and the agent never observed the device.

This acceptance covers the app opening only. Persistence, SQLite, Keystore,
Telegram, local model, and `packages/core` wiring remain unproven and keep their
own pending rows.

## Recorded post-promotion APK build (S34, build proof only)

After S34 promoted the app to `apps/mobile`, the APK workflow was re-run to prove
the promoted structure still produces an installable APK.

- Workflow run: https://github.com/OnlyXianzo/Vittaz/actions/runs/42204863019
- Commit: `37c6263e926a0c68f3133d27dfd7b8ea6ff0d1c1`.
- Job `preview-apk`: success, `BUILD SUCCESSFUL in 9m 55s`.
- Autolinking assertion: `missing: []`.
- Metro: `Android Bundled 22155ms index.ts (873 modules)` — up from 855 modules
  before core was wired, reflecting the `packages/core` graph.
- Repository-unchanged assertion passed.

Artifacts, both expiring `2026-11-13T10:54Z` (7-day retention):

| Artifact                     | APK size     | ZIP size     | ZIP SHA-256                                                        |
| ---------------------------- | ------------ | ------------ | ------------------------------------------------------------------ |
| `s33-preview-standalone-apk` | 42,970,454 B | 22,508,626 B | `ac10144cb25388f81fc80654c018edb816a8011f773dad1fbaa329f18a7c0081` |
| `s33-preview-devclient-apk`  | not measured | 44,274,062 B | not downloaded                                                     |

The standalone artifact was downloaded and its embedded
`assets/index.android.bundle` inspected directly: `MoneyValidationError`,
`normalizeIndicDigits` and `assertIntegerPaise` are all present. Core is therefore
genuinely shipped in the binary, not merely referenced in source.

An earlier run on `b19e181` failed because the workflow did not copy
`packages/core` into the temp tree; see `docs/references.md` for that diagnosis
and the fix.

Status: **build proof only**. This APK has not been installed or opened by the
owner. The S33 owner acceptance covers the pre-promotion APK opening; it does not
extend to this build, to core wiring, or to persistence. S35 still owes the
`expo-sqlite` adapter and replacement of the preview demo reducer.

## S35 post-wiring APK build (build proof only)

After S35 replaced the native demo reducer and added `expo-sqlite`, the manual
preview workflow was re-run on main to verify the promoted app, shared core and
storage adapter bundle together.

- Workflow run: https://github.com/OnlyXianzo/Vittaz/actions/runs/42215554135
- Commit: `a533288fe375eb21abe023c53b5e121de17366b5`.
- Job `preview-apk`: success; `BUILD SUCCESSFUL in 12m 25s`.
- Autolinking assertion: `missing: []`.
- Metro: `Android Bundled 35298ms index.ts (904 modules)`.
- Repository-unchanged assertion passed.
- Downloaded standalone artifact ZIP SHA-256:
  `115e44a0672a715132c65ecaf0617327256bb8b7d895e097a194d5d2197da62a`.
- APK size: 46,015,238 B. ZIP size: 24,268,384 B.
- Artifact expires `2026-11-13T12:23:47Z` (7-day retention).
- Static inspection found `MoneyValidationError` and
  `createManualTransaction` in the embedded Hermes bundle, and `SQLiteModule`
  strings in DEX. This proves a bundle was built, not that SQLite opened or ran
  on a device.

**Owner-reported device result (2026-11-06).** The owner installed the corrected
standalone APK from run `42228039226` (attempt 2) and confirmed that a synthetic
manual entry remained after closing and reopening Vittaz. The first attempt of
that run failed on Gradle dependency resolution and is retained as an
infrastructure failure; attempt 2 passed without source changes. This accepts
only S35 basic manual-save persistence. The owner did not provide phone model or
Android version; the agent did not run or observe the device. See
`docs/device_tests.md` for the report details and still-pending checks.

For the current Kilo investigation, use the S38 diagnostics APK instructions at
the top of this guide and the artifact `vittaz-diagnostics-test-apk`. It is a
separate app identity, explicitly marked TEST ONLY, and must be used with
synthetic questions/data only. S36's Kilo failure remains unresolved; APK
installation and an exported log are evidence to investigate, not automatic
proof of a root cause.
