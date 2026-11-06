import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}
function exists(path: string) {
  return existsSync(new URL(`../../${path}`, import.meta.url));
}

test("s34_native_app_is_promoted_to_apps_mobile", () => {
  // The Expo app now lives at apps/mobile, not apps/mobile/ui/native.
  expect(exists("apps/mobile/App.tsx")).toBe(true);
  expect(exists("apps/mobile/app.json")).toBe(true);
  expect(exists("apps/mobile/metro.config.cjs")).toBe(true);
  expect(exists("apps/mobile/package-lock.json")).toBe(true);
  expect(exists("apps/mobile/ui/native")).toBe(false);
  // The owner's web preview stays where it is.
  expect(exists("apps/mobile/ui/src/state.ts")).toBe(true);
  expect(exists("apps/mobile/ui/package.json")).toBe(true);
});

test("s34_promoted_app_keeps_owner_files_byte_for_byte", () => {
  const pkg = JSON.parse(read("apps/mobile/package.json"));
  expect(pkg.name).toBe("@vittaz/mobile");
  // Owner dependency set is preserved exactly.
  expect(pkg.dependencies["expo"]).toBe("~58.0.23");
  expect(pkg.dependencies["react-native"]).toBe("0.88.1");
  expect(pkg.dependencies["react-native-safe-area-context"]).toBe("~5.11.1");
  expect(pkg.dependencies["react-native-svg"]).toBe("15.16.0");
  expect(pkg.dependencies["expo-linear-gradient"]).toBe("~58.0.3");
  expect(pkg.scripts.dev).toBe("expo start --web --port 8081 --host lan");
  const app = JSON.parse(read("apps/mobile/app.json"));
  expect(app.expo.android.package).toBe("com.vittaz.preview");
});

test("s34_promoted_app_is_not_a_root_workspace_or_ts_project_reference", () => {
  // The Expo app has its own lockfile and 1151 packages. Pulling it into the
  // root workspace would drag React Native into every backend CI job.
  const root = JSON.parse(read("package.json"));
  expect(root.workspaces).toContain("packages/*");
  expect(root.workspaces).not.toContain("apps/*");
  expect(root.workspaces).toContain("apps/cli");
  const tsconfig = JSON.parse(read("tsconfig.json"));
  const paths = tsconfig.references.map((r: { path: string }) => r.path);
  expect(paths).not.toContain("apps/mobile");
  expect(paths).toContain("packages/core");
});

test("s34_root_tooling_ignores_the_promoted_app", () => {
  const check = JSON.parse(read("tsconfig.check.json"));
  expect(check.exclude).toContain("apps/mobile");
  const prettier = read(".prettierignore");
  expect(prettier).toContain("apps/mobile/");
  const eslint = read("eslint.config.mjs");
  expect(eslint).toContain("apps/mobile/**");
  const vitest = read("vitest.config.ts");
  expect(vitest).toContain("apps/mobile/**");
});

test("s34_shared_sources_and_ci_are_repointed_without_a_preview_reducer", () => {
  const domain = read("apps/mobile/src/domain.ts");
  expect(domain).toContain("../ui/src/types");
  expect(domain).not.toContain("../ui/src/state");
  expect(domain).not.toContain("../../src/state");
  expect(domain).toContain('from "./selectors"');
  const metro = read("apps/mobile/metro.config.cjs");
  expect(metro).toContain('"./ui/src"');
  const jest_config = read("apps/mobile/jest.config.cjs");
  expect(jest_config).toContain("<rootDir>/ui/src");
  const native_ci = read(".github/workflows/native.yml");
  expect(native_ci).toContain("working-directory: apps/mobile");
  expect(native_ci).not.toContain("apps/mobile/ui/native");
  const apk = read(".github/workflows/s33-preview-apk.yml");
  expect(apk).not.toContain("apps/mobile/ui/native");
  expect(apk).toContain('cp -R apps/mobile "$PREVIEW_DIR/native"');
});
test("s34_apps_mobile_imports_packages_core_through_a_resolvable_bridge", () => {
  const bridge = read("apps/mobile/src/core.ts");
  expect(bridge).toContain("@vittaz/core");
  // Metro must watch the core source and resolve the bare specifier.
  const metro = read("apps/mobile/metro.config.cjs");
  expect(metro).toContain("packages/core/src");
  expect(metro).toContain("@vittaz/core");
  // Jest and tsc need the same mapping or the app cannot be checked.
  expect(read("apps/mobile/jest.config.cjs")).toContain("@vittaz/core");
  expect(read("apps/mobile/tsconfig.json")).toContain("@vittaz/core");
  // Core is framework-free and must stay a source import, not a built dist.
  const pkg = JSON.parse(read("apps/mobile/package.json"));
  expect(pkg.dependencies["@vittaz/core"]).toBeUndefined();
});

test("s34_core_is_reachable_from_the_app_entrypoint_not_dead_code", () => {
  // A bridge nobody imports would not satisfy "apps/mobile imports
  // packages/core". domain.ts is the seam every screen already imports.
  const domain = read("apps/mobile/src/domain.ts");
  expect(domain).toContain('from "./core"');
  expect(domain).toContain("CORE_VERSION");
});

test("s34_metro_and_jest_resolve_core_nodenext_js_specifiers_to_ts_source", () => {
  // packages/core imports "./ledger/money.js" (NodeNext) but ships .ts files.
  // Without an extension remap Metro fails with "Unable to resolve". Caught by
  // an actual `expo export`, not by a string assertion.
  const metro = read("apps/mobile/metro.config.cjs");
  expect(metro).toContain("resolveRequest");
  expect(metro).toMatch(/\.js\b/);
  expect(read("apps/mobile/jest.config.cjs")).toMatch(
    /moduleNameMapper[\s\S]*\\\.js/,
  );
});

test("s34_apk_workflow_copies_core_because_metro_watches_it", () => {
  // Regression: the promoted app's metro.config.cjs watches
  // ../../packages/core/src. Copying only apps/mobile into runner temp left
  // that root missing and Gradle's createBundleReleaseJsAndAssets failed with
  // "ENOENT ... /vittaz-preview/packages/core/src". A local `expo export`
  // passed because the real repo has packages/core at that relative path.
  const apk = read(".github/workflows/s33-preview-apk.yml");
  expect(apk).toContain("packages/core");
  expect(apk).toMatch(/cp -R packages\/core/);
  const metro = read("apps/mobile/metro.config.cjs");
  expect(metro).toContain("../../packages/core/src");
});

test("s35_uses_sdk_matched_expo_sqlite_and_core_backed_native_state", () => {
  const pkg = JSON.parse(read("apps/mobile/package.json"));
  expect(pkg.dependencies["expo-sqlite"]).toBe("~58.0.15");
  const app_config = JSON.parse(read("apps/mobile/app.json"));
  expect(app_config.expo.plugins).toContain("expo-sqlite");

  const store = read("apps/mobile/src/store.tsx");
  expect(store).toContain("openMobileLedgerStore");
  expect(store).toContain("createManualTransaction");
  expect(store).toContain("approveProposal");
  expect(store).toContain("rejectProposal");
  expect(store).not.toContain("useReducer");
  expect(store).not.toContain('from "./ui/src/state"');

  const native_domain = read("apps/mobile/src/domain.ts");
  expect(native_domain).not.toContain('from "../ui/src/state"');
  expect(native_domain).not.toContain("SYNTHETIC_PEOPLE");
  const selectors = read("apps/mobile/src/selectors.ts");
  expect(selectors).not.toContain("647100");
  expect(selectors).not.toContain("73000");

  const adapter = read("apps/mobile/src/storage/expo_sqlite_store.ts");
  expect(adapter).toContain("MIGRATION_STEPS");
  expect(adapter).toContain("PRAGMA foreign_keys = ON");
  expect(adapter).toContain("withTransactionAsync");
  expect(adapter).not.toContain("withExclusiveTransactionAsync");
  expect(read("packages/core/test/ledger_store_contract.ts")).toContain(
    "ledger_store_proposal_and_audit_round_trip_contract",
  );
});

test("s35_native_ci_exports_android_and_sqlite_web_targets", () => {
  const native_ci = read(".github/workflows/native.yml");
  expect(native_ci).toContain("expo export --platform android");
  expect(native_ci).toContain("npm run export:web");
});

test("s35_expo_sqlite_web_setup_keeps_the_existing_expo_web_preview_buildable", () => {
  const metro = read("apps/mobile/metro.config.cjs");
  expect(metro).toContain('"wasm"');
  expect(metro).toContain("Cross-Origin-Embedder-Policy");
  expect(metro).toContain("Cross-Origin-Opener-Policy");
});
