import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";

const scanner = resolve("scripts/deep_git_scan.ts");
const repos: string[] = [];
const marker = ["synthetic_", "credential_", "for_redaction_test"].join("");
const assignment = (value: string) => `const API_KEY = '${value}';`;
function git(repo: string, ...args: string[]) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  expect(result.status, "synthetic_git_command_succeeds").toBe(0);
}
function repo() {
  const path = mkdtempSync(join(tmpdir(), "vittaz-scan-"));
  repos.push(path);
  git(path, "init", "-q");
  writeFileSync(join(path, "safe.txt"), "synthetic fixture\n");
  git(path, "add", ".");
  git(
    path,
    "-c",
    "user.name=Synthetic",
    "-c",
    "user.email=synthetic@example.invalid",
    "commit",
    "-qm",
    "fixture",
  );
  return path;
}
function scan(path: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [scanner, path, ...args], {
    encoding: "utf8",
  });
  expect(result.stdout + result.stderr).not.toContain(marker);
  if (result.status === 0 || result.status === 1) {
    expect(result.stdout).toContain("SCAN FINISHED:");
    expect(result.stderr).toBe("");
  }
  return result;
}
afterEach(() => {
  for (const path of repos.splice(0))
    rmSync(path, { recursive: true, force: true });
});

test("secret_scan_allows_only_known_review_checklist_fixture", () => {
  const path = repo();
  writeFileSync(
    join(path, "fixture.txt"),
    assignment(["sk_live_", "abc123xyz"].join("")),
  );
  expect(scan(path).status).toBe(0);
  writeFileSync(
    join(path, "fixture.txt"),
    assignment(["sk_live_", "abc123xyZ"].join("")),
  );
  expect(scan(path).status).toBe(1);
});
test("secret_scan_redacts_history_after_secret_deleted", () => {
  const path = repo();
  writeFileSync(join(path, "history.txt"), assignment(marker));
  git(path, "add", ".");
  git(
    path,
    "-c",
    "user.name=Synthetic",
    "-c",
    "user.email=synthetic@example.invalid",
    "commit",
    "-qm",
    "history fixture",
  );
  git(path, "rm", "history.txt");
  const result = scan(path, "--skip-working-tree");
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("Finding:");
});
test("secret_scan_checks_untracked_directories_and_spaced_paths", () => {
  const path = repo();
  mkdirSync(join(path, "new folder"));
  writeFileSync(
    join(path, "new folder", "secret file.txt"),
    assignment(marker),
  );
  expect(scan(path).status).toBe(1);
});
test("secret_scan_checks_staged_content_even_when_disk_is_clean", () => {
  const path = repo();
  writeFileSync(join(path, "safe.txt"), assignment(marker));
  git(path, "add", ".");
  writeFileSync(join(path, "safe.txt"), "clean\n");
  expect(scan(path).status).toBe(1);
});
test("secret_scan_fails_closed_for_invalid_repository_and_arguments", () => {
  const path = mkdtempSync(join(tmpdir(), "vittaz-invalid-"));
  repos.push(path);
  expect(scan(path).status).toBe(2);
  expect(scan(repo(), "--max-commits", "invalid").status).toBe(2);
});

test("secret_scan_checks_renamed_staged_files", () => {
  const path = repo();
  git(path, "mv", "safe.txt", "renamed file.txt");
  writeFileSync(join(path, "renamed file.txt"), assignment(marker));
  git(path, "add", ".");
  expect(scan(path).status).toBe(1);
});

test("secret_scan_preserves_all_detector_families", () => {
  const path = repo();
  const values = [
    "AKIA" + "Z".repeat(16),
    "aws_secret_access_key=" + "Z".repeat(40),
    "ghp_" + "z".repeat(36),
    "github_pat_" + "z".repeat(82),
    "xoxb-" + "z".repeat(20),
    "AIza" + "z".repeat(35),
    "sk-" + "z".repeat(32),
    "sk_live_" + "z".repeat(24),
    "-----BEGIN " + "PRIVATE KEY-----",
    assignment(marker),
  ];
  for (const value of values) {
    writeFileSync(join(path, "detector.txt"), value);
    expect(scan(path).status, "detector_family_is_preserved").toBe(1);
  }
});
