import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const workflow_path = ".github/workflows/s33-preview-apk.yml";

test("preview_apk_workflow_is_manual_minimal_pinned_and_secretless", () => {
  const workflow = read(workflow_path);
  expect(workflow).toContain("workflow_dispatch:");
  expect(workflow).not.toMatch(/^\s*push:/m);
  expect(workflow).not.toMatch(/^\s*pull_request:/m);
  expect(workflow).toContain("permissions:\n  contents: read");
  expect(workflow).toContain("runs-on: ubuntu-24.04");
  expect(workflow).not.toContain("secrets.");
  const uses = [...workflow.matchAll(/uses:\s*([^\s]+)/g)].map((m) => m[1]);
  expect(uses.length).toBeGreaterThanOrEqual(4);
  for (const action of uses) {
    expect(action).toMatch(/^actions\/[a-z-]+@[0-9a-f]{40}$/);
  }
});

test("preview_apk_workflow_copies_owner_preview_without_mutating_repo", () => {
  const workflow = read(workflow_path);
  // S34 promoted the Expo app to apps/mobile; the web preview is nested at
  // apps/mobile/ui, so one copy carries both the app and its shared domain.
  expect(workflow).toContain('cp -R apps/mobile "$PREVIEW_DIR/native"');
  expect(workflow).toContain("$PREVIEW_DIR/native/ui/src/state.ts");
  expect(workflow).toContain("RUNNER_TEMP");
  expect(workflow).toContain("git diff --exit-code");
  expect(workflow).toContain("expo install expo-dev-client");
  expect(workflow).toContain("expo prebuild --platform android --clean");
});

test("preview_apk_workflow_builds_standalone_and_devclient_apks_with_jdk17_node24", () => {
  const workflow = read(workflow_path);
  expect(workflow).toContain('java-version: "17"');
  expect(workflow).toContain('node-version: "24.22.2"');
  expect(workflow).toContain("assembleDebug");
  expect(workflow).toContain("assembleRelease");
  expect(workflow).toContain("retention-days: 7");
  expect(workflow).toContain("if-no-files-found: error");
  expect(workflow).toContain("app-debug.apk");
  expect(workflow).toContain("app-release.apk");
  expect(workflow).toContain("react-native-safe-area-context");
});

test("preview_apk_docs_explain_native_js_mismatch_and_standalone_install", () => {
  const guide = read("docs/android_environment.md");
  expect(guide).toContain("s33-preview-apk");
  expect(guide).toContain("RNCSafeAreaProvider");
  expect(guide).toContain("standalone");
  expect(guide).toContain("does not need Metro");
  expect(guide).toContain("Do not claim device behavior");
  const references = read("docs/references.md");
  expect(references).toContain("s33-preview-apk");
  expect(references).toContain("react-native-safe-area-context");
});

test("preview_apk_workflow_copies_agent_and_records_runner_and_secure_store_versions", () => {
  const workflow = read(workflow_path);
  expect(workflow).toContain(
    'cp -R packages/agent "$PREVIEW_DIR/../packages/agent"',
  );
  expect(workflow).toContain("$PREVIEW_DIR/../packages/agent/src/qa_loop.ts");
  expect(workflow).toContain("uname -a");
  expect(workflow).toContain("node --version");
  expect(workflow).toContain("npm --version");
  expect(workflow).toContain("java -version");
  expect(workflow).toContain("secure_store:");
  expect(workflow).toContain('["expo-secure-store", expoDeps]');
});

test("preview_apk_workflow_does_not_use_runner_context_in_job_level_env", () => {
  const workflow = read(workflow_path);
  // GitHub only exposes the `runner` context at step level. Using it in
  // job-level `env` makes the whole workflow file fail to parse, so
  // workflow_dispatch returns 422 and the workflow can never run.
  const job_env = workflow.split(/^\s{4}steps:/m)[0];
  expect(job_env).not.toMatch(/\$\{\{\s*runner\./);
  expect(workflow).toContain("GITHUB_ENV");
});
