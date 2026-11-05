import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const workflow_path = ".github/workflows/s33-android-proof.yml";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("android_proof_workflow_is_manual_minimal_and_pinned", () => {
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

test("android_proof_workflow_builds_blank_expo_debug_apk_with_jdk17_node24", () => {
  const workflow = read(workflow_path);
  expect(workflow).toContain('java-version: "17"');
  expect(workflow).toContain('node-version: "24.22.2"');
  expect(workflow).toContain("create-expo-app");
  expect(workflow).toContain("--template blank-typescript");
  expect(workflow).toContain("expo install expo-dev-client");
  expect(workflow).toContain("expo prebuild --platform android --clean");
  expect(workflow).toContain("assembleDebug");
  expect(workflow).toContain("retention-days: 7");
  expect(workflow).toContain("if-no-files-found: error");
  expect(workflow).toContain("app-debug.apk");
});

test("android_proof_docs_record_runner_image_and_owner_install_steps", () => {
  const references = read("docs/references.md");
  expect(references).toContain("Ubuntu 24.04 runner image");
  expect(references).toContain("Android SDK Platform 36");
  expect(references).toContain("JDK 17");
  expect(references).toContain("Node 24.22.2");
  const guide = read("docs/android_environment.md");
  expect(guide).toContain("workflow_dispatch");
  expect(guide).toContain("s33-android-proof");
  expect(guide).toContain("unknown sources");
  expect(guide).toContain("app-debug.apk");
  expect(guide).toContain("Do not claim device behavior");
  expect(guide).toContain("Mark S33 done only after");
});

test("android_proof_first_ci_build_is_recorded_but_owner_open_still_pending", () => {
  const guide = read("docs/android_environment.md");
  expect(guide).toContain("42031551861");
  expect(guide).toContain("s33-android-proof-apk");
  expect(guide).toContain(
    "bdbb2f62082fb38402cd9ef9e2988f68ebeed8a0fb462e8987ca471565121b8e",
  );
  expect(guide).toContain("pending owner install/open report");
  const state = read("STATE.md");
  expect(state).toContain("42031551861");
  expect(state).toContain("owner APK install/open report");
});
