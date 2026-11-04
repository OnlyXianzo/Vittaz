import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import config from "../../../vitest.config.js";
import { privacyTestPattern } from "../../../scripts/privacy_check.js";

const read = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("package.json"));

test("quality_scripts_are_available", () => {
  for (const name of ["lint", "format:check", "typecheck", "test:coverage"]) {
    expect(manifest.scripts[name], name).toBeTypeOf("string");
  }
});

test("dependencies_are_exactly_pinned", () => {
  for (const path of [
    "package.json",
    "packages/core/package.json",
    "packages/storage/package.json",
    "packages/agent/package.json",
    "apps/cli/package.json",
    "apps/mobile/package.json",
  ]) {
    const pkg = JSON.parse(read(path));
    for (const [name, version] of Object.entries({
      ...pkg.dependencies,
      ...pkg.devDependencies,
    })) {
      if (path === "packages/storage/package.json" && name === "xlsx") {
        expect(version).toBe(
          "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz",
        );
      } else expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  }
});

test("empty_test_suite_is_not_success", () => {
  expect(config.test?.passWithNoTests).not.toBe(true);
});

test("ci_runs_every_push_with_immutable_actions", () => {
  const workflow = read(".github/workflows/ci.yml");
  expect(workflow).not.toContain("branches: [main]");
  expect(workflow).toContain("contents: read");
  const actions = [...workflow.matchAll(/uses: (\S+)/g)];
  expect(actions.length).toBeGreaterThan(0);
  for (const action of actions) expect(action[1]).toMatch(/@[a-f0-9]{40}$/);
  for (const script of ["lint", "typecheck", "test:coverage"]) {
    expect(workflow).toContain(`npm run ${script}`);
  }
});

test("glob_tooling_uses_security_patched_minimatch", () => {
  const lock = JSON.parse(read("package-lock.json"));
  const matches = Object.entries(lock.packages).filter(([path]) =>
    path.endsWith("node_modules/minimatch"),
  );
  expect(matches.length).toBeGreaterThan(0);
  for (const [, value] of matches) {
    expect((value as { version: string }).version).toBe("11.0.1");
  }
});

test("test_selector_excludes_live_names", () => {
  const pattern = new RegExp(privacyTestPattern);
  expect(pattern.test("privacy_zero_trace")).toBe(true);
  expect(pattern.test("suite > privacy_zero_trace")).toBe(true);
  expect(pattern.test("privacy_zero_trace @live")).toBe(false);
  expect(pattern.test("@live suite > privacy_zero_trace")).toBe(false);
  expect(pattern.test("core_money")).toBe(false);
});

test("spreadsheet_dependency_is_official_pinned_and_integrity_locked", () => {
  const lock = JSON.parse(read("package-lock.json"));
  expect(lock.packages["node_modules/xlsx"]).toMatchObject({
    version: "0.20.3",
    resolved: "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz",
    integrity:
      "sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==",
  });
});
