import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("docs_s32_readme_and_device_tests_are_current", () => {
  const readme = read("README.md");
  expect(readme).toContain("S29");
  expect(readme).toContain("S30");
  expect(readme).toContain("S31");
  expect(readme).toContain("G3");
  expect(readme).not.toContain("Early planning");
  expect(readme).toContain("docs/device_tests.md");
  expect(readme).toContain("docs/mutation_checks.md");
  const device = read("docs/device_tests.md");
  expect(device).toContain("No Android device behavior has been verified");
  expect(device).toContain("adb devices");
  expect(device).toContain("Keystore");
  expect(device).toContain("expo-sqlite");
});

test("docs_s32_references_decisions_and_g3_report_preserve_owner_open_items", () => {
  const references = read("docs/references.md");
  expect(references).toContain("Commander **15.0.0**");
  expect(references).toContain("S32");
  const decisions = read("DECISIONS.md");
  expect(decisions).toContain("license is still undecided");
  expect(decisions).toContain("backup encryption is undecided");
  expect(decisions).toContain("Metro watchFolders");
  expect(decisions).toContain("S32");
  const g3 = read("docs/gates/G3_backend_report.md");
  expect(g3).toContain("report only");
  expect(g3).toContain("owner sign-off");
  expect(g3).toContain("No Android device behavior has been verified");
  expect(g3).toContain("S29");
  expect(g3).toContain("S30");
  expect(g3).toContain("S31");
});
