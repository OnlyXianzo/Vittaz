import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

function findingCount(value: string): number {
  const result = spawnSync(
    "python3",
    [
      "-c",
      [
        "import importlib.util, sys",
        "spec = importlib.util.spec_from_file_location('scanner', '.agents/skills/secret-scan/scripts/deep_git_scan.py')",
        "scanner = importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(scanner)",
        'line = "const API_KEY = \'" + sys.argv[1] + "\';"',
        "print(len(list(scanner._find_secrets(line))))",
      ].join("\n"),
      value,
    ],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(0);
  return Number(result.stdout.trim());
}

test("secret_scan_allows_only_known_review_checklist_fixture", () => {
  expect(findingCount(["sk_live_", "abc123xyz"].join(""))).toBe(0);
});

test("secret_scan_still_flags_other_secret_assignments", () => {
  expect(
    findingCount(["synthetic_", "credential_", "for_scanner_test"].join("")),
  ).toBe(1);
  expect(findingCount(["sk_live_", "abc123xyZ"].join(""))).toBe(1);
});

test("secret_scan_never_returns_or_logs_detected_content", () => {
  const script = [
    "import importlib.util, contextlib, io, json",
    "spec = importlib.util.spec_from_file_location('scanner', '.agents/skills/secret-scan/scripts/deep_git_scan.py')",
    "scanner = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(scanner)",
    "marker = 'synthetic_' + 'credential_' + 'for_redaction_test'",
    'line = "api_key = \'" + marker + "\'"',
    "scanner._iter_added_lines = lambda *args: iter([('synthetic_commit', '', '', 'synthetic.txt', line)])",
    "output = io.StringIO()",
    "with contextlib.redirect_stdout(output):",
    "    findings = scanner.scan_repo('.')",
    "assert len(findings) == 1",
    "assert 'Finding:' in output.getvalue()",
    "assert marker not in output.getvalue()",
    "assert marker not in json.dumps(findings)",
    "assert all('snippet' not in item and 'match' not in item for item in findings)",
  ].join("\n");
  const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
  expect(result.status, "scanner_must_keep_only_operational_metadata").toBe(0);
});
