import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const workflow_path = ".github/workflows/mobile-diagnostics-test-apk.yml";

test("diagnostics_apk_workflow_is_manual_minimal_pinned_and_secretless", () => {
  const workflow = read(workflow_path);
  expect(workflow).toContain("name: Vittaz mobile diagnostics test APK");
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

test("diagnostics_workflow_copies_actual_app_and_shared_sources_to_temp_only", () => {
  const workflow = read(workflow_path);
  expect(workflow).toContain('cp -R apps/mobile "$DIAGNOSTICS_DIR/native"');
  expect(workflow).toContain(
    'cp -R packages/core "$DIAGNOSTICS_DIR/../packages/core"',
  );
  expect(workflow).toContain(
    'cp -R packages/storage "$DIAGNOSTICS_DIR/../packages/storage"',
  );
  expect(workflow).toContain(
    'cp -R packages/agent "$DIAGNOSTICS_DIR/../packages/agent"',
  );
  expect(workflow).toContain(
    "$DIAGNOSTICS_DIR/../packages/agent/src/qa_loop.ts",
  );
  expect(workflow).toContain("npm ci");
  expect(workflow).toContain("expo prebuild --platform android --clean");
  expect(workflow).not.toContain("expo install expo-dev-client");
  expect(workflow).toContain("git diff --exit-code");
  expect(workflow).toContain("git status --porcelain");
  expect(workflow).toContain("RUNNER_TEMP");
});

test("diagnostics_apk_uses_test_only_identity_and_enables_only_safe_test_logging", () => {
  const workflow = read(workflow_path);
  expect(workflow).toContain("Vittaz TEST ONLY");
  expect(workflow).toContain("vittaz-diagnostics-test");
  expect(workflow).toContain("com.vittaz.diagnostics.test");
  expect(workflow).toContain('EXPO_PUBLIC_VITTAZ_DIAGNOSTICS: "1"');
  expect(workflow).toContain("SYNTHETIC DATA ONLY");
  expect(workflow).toContain("expo-file-system");
  expect(workflow).toContain("assets/index.android.bundle");
  expect(workflow).toContain("Save test log to Downloads");

  const logger = read("apps/mobile/src/assistant/diagnostics.ts");
  expect(logger).toContain(
    'process.env.EXPO_PUBLIC_VITTAZ_DIAGNOSTICS === "1"',
  );
  expect(logger).toContain("max_entries");
  expect(logger).toContain("console.log");
  const export_service = read("apps/mobile/src/assistant/diagnostic_export.ts");
  expect(export_service).toContain("Vittaz-Diagnostics");
  expect(export_service).toContain("export_permission_denied");
  expect(export_service).toContain("export_io_error");
});

test("diagnostics_apk_build_is_standalone_jdk17_node24_and_short_lived", () => {
  const workflow = read(workflow_path);
  expect(workflow).toContain('java-version: "17"');
  expect(workflow).toContain('node-version: "24.22.2"');
  expect(workflow).toContain("assembleRelease");
  expect(workflow).toContain("app-release.apk");
  expect(workflow).toContain("retention-days: 7");
  expect(workflow).toContain("if-no-files-found: error");
  expect(workflow).toContain("vittaz-diagnostics-test-apk");
  expect(workflow).toContain("sha256sum");
  expect(workflow).toContain('["expo-file-system", expoDeps]');
  expect(workflow).not.toContain("app-debug.apk");
});

test("diagnostics_workflow_sets_runner_temp_at_step_level_and_keeps_blank_proof_separate", () => {
  const workflow = read(workflow_path);
  const job_env = workflow.split(/^\s{4}steps:/m)[0];
  expect(job_env).not.toMatch(/\$\{\{\s*runner\./);
  expect(workflow).toContain("GITHUB_ENV");
  const blank_proof = read(".github/workflows/s33-android-proof.yml");
  expect(blank_proof).toContain("name: S33 Android proof");
  expect(blank_proof).toContain("blank-expo-debug-apk");
});

test("diagnostics_docs_explain_synthetic_only_identity_export_and_not_device_proof", () => {
  const guide = read("docs/android_environment.md");
  expect(guide).toContain("mobile-diagnostics-test-apk.yml");
  expect(guide).toContain("TEST ONLY");
  expect(guide).toContain("synthetic data only");
  expect(guide).toContain("Vittaz-Diagnostics");
  expect(guide).toContain("does not claim device behavior");
  const references = read("docs/references.md");
  expect(references).toContain("mobile-diagnostics-test-apk.yml");
  expect(references).toContain("filesystem-legacy");
});

test("mobile_typecheck_and_jest_resolution_stay_pinned_for_the_temp_apk", () => {
  const config = JSON.parse(read("apps/mobile/tsconfig.json")) as {
    compilerOptions?: { paths?: Record<string, string[]> };
  };
  expect(config.compilerOptions?.paths?.["@langchain/core/*"]).toEqual([
    "node_modules/@langchain/core/dist/*",
  ]);
  expect(config.compilerOptions?.paths?.["zod"]).toEqual([
    "node_modules/zod/index.d.cts",
  ]);
  const jest_config = read("apps/mobile/jest.config.cjs").replace(/\s+/g, " ");
  expect(jest_config).toContain("@langchain/core/dist/messages/index.cjs");
  expect(jest_config).toContain("node_modules/zod/index.cjs");
});
