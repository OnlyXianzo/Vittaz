# Scripts and Verification Utilities

## Overview

The `scripts/` directory houses mission-critical operational, environment audit, and verification utilities for the Vittaz monorepo. It implements automated quality and compliance gates across developer environments and CI pipelines:

- `android_env.ts`: Evaluates host workstation readiness for Android on-device execution (Layer 0 check). Validates the Node.js engine, Java Development Kit (JDK >= 17), Android SDK configuration (`ANDROID_HOME` or `ANDROID_SDK_ROOT`), ADB availability, and connected device authorization.
- `privacy_check.ts`: Executes Layer 2 privacy verification suites as a non-negotiable blocker gate. Runs Vitest in an isolated runner targeting all mandatory privacy test suites (`sensitiveFilter`, `redactor`, `scrubber`, `safeTelemetry`, `adversarial_names`, and `privacy_boundary`), ensuring no PII, bank messages, or unredacted secrets traverse system boundaries.

## Interface

### Android Environment Auditor (`scripts/android_env.ts`)

- `interface CommandResult`: Process execution result with `status: number | null`, `stdout: string`, `stderr: string`.
- `interface AndroidEnvDeps`: Dependency injection container covering `env`, `platform`, `exists`, `run`, and optional `node_version`.
- `interface AdbDevice`: Masked ADB device record `{ serial_masked: string, state: string, model: string | null, transport_id: string | null }`.
- `interface AndroidEnvReport`: Structured environment readiness report with booleans and diagnostic error codes.
- `maskSerial(serial: string): string`: Obfuscates device serial IDs, retaining at most leading and trailing two characters.
- `parseAdbDevices(output: string): AdbDevice[]`: Parses `adb devices -l` output into sanitized `AdbDevice` objects.
- `evaluateAndroidEnv(deps: AndroidEnvDeps): AndroidEnvReport`: Pure evaluation function verifying Node (`>= 24.22.2 < 25`), Java JDK (`>= 17`), Android SDK, ADB, and ready devices.
- `runAndroidEnvCli(): number`: CLI runner outputting JSON report to `stdout` and returning process exit code (0 on success, 1 on failure).

### Privacy Gate Runner (`scripts/privacy_check.ts`)

- `const privacyTestPattern: string`: Test name filter pattern `^(?!.*@live)(?=.*privacy_)` ensuring privacy tests run while rejecting live provider tests.
- `const requiredPrivacySuites: readonly string[]`: List of 6 mandatory privacy suites required for passing gate evidence.
- `hasPrivacyEvidence(value: unknown): boolean`: Validates Vitest reporter JSON payload to assert all required suites passed with > 0 tests, 0 failures, and valid privacy test name patterns.
- `runPrivacyCheck(): boolean`: Spawns Vitest under an isolated temporary directory (`tmpdir()/vittaz-privacy-*`), parses test results, validates privacy evidence, logs structured diagnostics on failure, and cleans up temporary files.

## Invariants

- **Blocking Privacy Gate**: Privacy test failures are strictly blocking; `hasPrivacyEvidence()` mandates zero test failures and full coverage across all 6 specified test suites.
- **Masked Device Serials**: All device serial numbers must pass through `maskSerial()` before inclusion in reports or CLI outputs to prevent accidental leakage of hardware identifiers.
- **Node Engine Constraint**: `nodeOk` strictly enforces Node.js major version 24, minor >= 22 (patch >= 2 for 24.22), rejecting unsupported versions with `"node_unsupported"`.
- **Java Compatibility**: Java runtime must provide JDK major version >= 17, verified via `java -version` output parsing.
- **Filesystem Isolation & Cleanup**: `runPrivacyCheck()` creates a temporary directory using `mkdtempSync` and guarantees full deletion via `rmSync` within a `finally` block, ensuring no leftover test artifacts.
- **Synthetic Data & Non-Live Invariant**: Privacy tests strictly reject live tests via negative lookahead `(?!.*@live)`. No real credentials, bank data, or production accounts may be used.
- **Pure Dependency Injection**: `evaluateAndroidEnv()` must remain a pure function parameterized by `AndroidEnvDeps` to allow deterministic mocking in unit tests.

## Side Effects

- Spawns synchronous child processes (`java`, `adb`, `vitest`) with explicit timeouts.
- Reads environment variables `ANDROID_HOME` and `ANDROID_SDK_ROOT`.
- Checks filesystem existence of `${ANDROID_HOME}/platform-tools`.
- Creates and removes temporary directories in `os.tmpdir()` (`vittaz-privacy-*`).
- Writes JSON report and diagnostics to `stdout`/`stderr` and sets process exit codes (0 or 1).

## Verification

- Run: `npm run android:env`
- Run: `npm run test:privacy`
- Run: `npm test`
