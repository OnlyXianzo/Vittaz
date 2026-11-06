import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

export const privacyTestPattern = "^(?!.*@live)(?=.*privacy_)";
export const requiredPrivacySuites = [
  "packages/core/src/privacy/sensitiveFilter.test.ts",
  "packages/core/src/privacy/redactor.test.ts",
  "packages/core/src/privacy/scrubber.test.ts",
  "packages/core/src/privacy/safeTelemetry.test.ts",
  "packages/core/src/privacy/adversarial_names.test.ts",
  "packages/agent/src/privacy_boundary.test.ts",
] as const;

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function hasPrivacyEvidence(value: unknown): boolean {
  if (
    !record(value) ||
    value.success !== true ||
    !Number.isSafeInteger(value.numPassedTests) ||
    (value.numPassedTests as number) <= 0 ||
    value.numFailedTests !== 0 ||
    !Array.isArray(value.testResults)
  )
    return false;
  const suites: unknown[] = value.testResults;
  return requiredPrivacySuites.every((file) =>
    suites.some(
      (suite) =>
        record(suite) &&
        typeof suite.name === "string" &&
        suite.name.replaceAll("\\", "/").endsWith(`/${file}`) &&
        suite.status === "passed" &&
        Array.isArray(suite.assertionResults) &&
        suite.assertionResults.length > 0 &&
        suite.assertionResults.every(
          (assertion: unknown) =>
            record(assertion) &&
            assertion.status === "passed" &&
            typeof assertion.fullName === "string" &&
            new RegExp(privacyTestPattern).test(assertion.fullName),
        ),
    ),
  );
}

function readFailedAssertionNames(reportPath: string): string[] {
  try {
    const report: unknown = JSON.parse(readFileSync(reportPath, "utf8"));
    if (!record(report) || !Array.isArray(report.testResults)) return [];
    return report.testResults.flatMap((suite: unknown) => {
      if (!record(suite) || !Array.isArray(suite.assertionResults)) return [];
      return suite.assertionResults
        .filter(
          (assertion: unknown) =>
            record(assertion) && assertion.status === "failed",
        )
        .map((assertion: Record<string, unknown>) =>
          typeof assertion.fullName === "string"
            ? assertion.fullName.slice(0, 120)
            : "unnamed_test",
        )
        .slice(0, 20);
    });
  } catch {
    return [];
  }
}

export function runPrivacyCheck(): boolean {
  const directory = mkdtempSync(join(tmpdir(), "vittaz-privacy-"));
  try {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
        ),
        "run",
        `--testNamePattern=${privacyTestPattern}`,
        "--reporter=json",
        `--outputFile=${join(directory, "report.json")}`,
      ],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        encoding: "utf8",
        timeout: 300_000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    const report_path = join(directory, "report.json");
    if (result.error || result.status !== 0) {
      const error_code =
        result.error && "code" in result.error
          ? String(result.error.code)
          : "none";
      const failed_names = readFailedAssertionNames(report_path);
      console.error(
        `privacy_child_failed status=${result.status ?? "null"} signal=${result.signal ?? "none"} error_code=${error_code} failed_tests=${failed_names.join("|") || "unavailable"}`,
      );
      return false;
    }
    let report: unknown;
    try {
      report = JSON.parse(readFileSync(join(directory, "report.json"), "utf8"));
    } catch {
      console.error("privacy_report_invalid");
      return false;
    }
    if (!hasPrivacyEvidence(report)) {
      const failed_names = readFailedAssertionNames(report_path);
      console.error(
        `privacy_evidence_missing failed_tests=${failed_names.join("|") || "none"}`,
      );
      return false;
    }
    return true;
  } catch {
    console.error("privacy_runner_error");
    return false;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const passed = runPrivacyCheck();
  console.log(
    passed ? "privacy_checks_passed" : "privacy_checks_failed_or_missing",
  );
  process.exitCode = passed ? 0 : 1;
}
