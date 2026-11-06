import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "vitest";
import {
  hasPrivacyEvidence,
  requiredPrivacySuites,
} from "../../scripts/privacy_check.js";

function validReport() {
  return {
    success: true,
    numPassedTests: 5,
    numFailedTests: 0,
    testResults: requiredPrivacySuites.map((file) => ({
      name: `/synthetic/${file}`,
      status: "passed",
      assertionResults: [
        { fullName: "privacy_synthetic_check", status: "passed" },
      ],
    })),
  };
}

test("privacy_ci_requires_actual_passing_primitive_suites", () => {
  expect(requiredPrivacySuites).toContain(
    "packages/agent/src/privacy_boundary.test.ts",
  );
  expect(hasPrivacyEvidence(validReport())).toBe(true);
  for (const value of [
    null,
    {},
    [],
    { success: true },
    { ...validReport(), numPassedTests: 0 },
    { ...validReport(), success: false },
    { ...validReport(), numFailedTests: 1 },
    { ...validReport(), testResults: [] },
  ])
    expect(hasPrivacyEvidence(value)).toBe(false);
  const missing = validReport();
  missing.testResults.pop();
  expect(hasPrivacyEvidence(missing)).toBe(false);
});

test("privacy_ci_rejects_skipped_failed_live_and_metadata_only_evidence", () => {
  for (const status of ["pending", "failed"]) {
    const report = validReport();
    report.testResults[0]!.assertionResults[0]!.status = status;
    expect(hasPrivacyEvidence(report)).toBe(false);
  }
  const failedSuite = validReport();
  failedSuite.testResults[0]!.status = "failed";
  expect(hasPrivacyEvidence(failedSuite)).toBe(false);
  for (const name of [
    "privacy_check @live",
    "test_selector_excludes_live_names",
  ]) {
    const report = validReport();
    report.testResults[0]!.assertionResults[0]!.fullName = name;
    expect(hasPrivacyEvidence(report)).toBe(false);
  }
  const empty = validReport();
  empty.testResults[0]!.assertionResults = [];
  expect(hasPrivacyEvidence(empty)).toBe(false);
});

test("privacy_ci_blocks_later_jobs_and_has_no_bootstrap_escape", () => {
  const read = (file: string) =>
    readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
  const workflow = read(".github/workflows/ci.yml");
  expect(workflow).not.toMatch(/Bootstrap only|continue-on-error|if:\s*always/);
  expect(workflow).toMatch(/ {2}privacy:\n {4}needs: quality/);
  expect(workflow).toMatch(/ {2}test:\n {4}needs: privacy/);
  expect(workflow).toMatch(/ {2}security:\n {4}needs: privacy/);
  expect(workflow).toMatch(/ {2}build:\n {4}needs: \[test, security\]/);
  const command = JSON.parse(read("package.json")).scripts["test:privacy"];
  expect(command).toBe("node scripts/privacy_check.ts");
  expect(command).not.toContain("passWithNoTests");
});

test("privacy_ci_runner_fails_closed_on_child_and_report_errors_without_echoing_payloads", () => {
  const directory = mkdtempSync(join(tmpdir(), "vittaz-ci-fixture-"));
  try {
    mkdirSync(join(directory, "scripts"));
    mkdirSync(join(directory, "node_modules/vitest"), { recursive: true });
    const scratch = join(directory, "scratch");
    mkdirSync(scratch);
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({ type: "module" }),
    );
    const runner = join(directory, "scripts/privacy_check.ts");
    writeFileSync(
      runner,
      readFileSync(new URL("../../scripts/privacy_check.ts", import.meta.url)),
    );
    writeFileSync(
      join(directory, "node_modules/vitest/vitest.mjs"),
      `
      import { writeFileSync } from "node:fs";
      const mode = process.env.SYNTHETIC_REPORT_MODE;
      if (mode === "nonzero") { console.error("PRIVATE_SYNTH_TEST_PAYLOAD"); process.exit(7); }
      if (mode === "module_error") { console.error("Error [ERR_MODULE_NOT_FOUND]: synthetic_module"); process.exit(1); }
      if (mode === "missing") process.exit(0);
      const file = process.argv.find(value => value.startsWith("--outputFile=")).slice("--outputFile=".length);
      const report = ${JSON.stringify(validReport())};
      if (mode === "empty") report.numPassedTests = 0;
      if (mode === "failed") {
        report.success = false;
        report.numFailedTests = 1;
        report.testResults[0].status = "failed";
        report.testResults[0].assertionResults[0].status = "failed";
        report.testResults[0].assertionResults[0].fullName = "privacy_synthetic_failure";
      }
      writeFileSync(file, mode === "malformed" ? "not_json" : JSON.stringify(report));
    `,
    );
    for (const mode of [
      "success",
      "nonzero",
      "module_error",
      "missing",
      "malformed",
      "empty",
      "failed",
    ]) {
      const result = spawnSync(process.execPath, [runner], {
        encoding: "utf8",
        timeout: 10000,
        env: { ...process.env, TMPDIR: scratch, SYNTHETIC_REPORT_MODE: mode },
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(mode === "success" ? 0 : 1);
      expect(result.stdout).toBe(
        mode === "success"
          ? "privacy_checks_passed\n"
          : "privacy_checks_failed_or_missing\n",
      );
      expect(result.stdout + result.stderr).not.toContain(
        "PRIVATE_SYNTH_TEST_PAYLOAD",
      );
      if (mode === "nonzero") {
        expect(result.stderr).toContain("privacy_child_failed");
        expect(result.stderr).toContain("failure_class=child_exit_nonzero");
      }
      if (mode === "module_error")
        expect(result.stderr).toContain("failure_class=module_load_failed");
      if (mode === "missing" || mode === "malformed")
        expect(result.stderr).toContain("privacy_report_invalid");
      if (mode === "empty" || mode === "failed")
        expect(result.stderr).toContain("privacy_evidence_missing");
      if (mode === "failed")
        expect(result.stderr).toContain("privacy_synthetic_failure");
      expect(readdirSync(scratch)).toEqual([]);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
