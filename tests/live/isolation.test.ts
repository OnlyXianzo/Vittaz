import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import normal from "../../vitest.config.js";
const text = (p: string) =>
  readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
test("keyless_live_requires_separate_config_opt_in_and_manual_nonblocking_workflow", () => {
  expect(normal.test?.exclude).toContain("**/*.live.test.ts");
  expect((normal.test?.testNamePattern as RegExp).test("@live synthetic")).toBe(
    false,
  );
  expect(JSON.parse(text("package.json")).scripts["test:live"]).toBe(
    "vitest run --config vitest.live.config.ts",
  );
  const config = text("vitest.live.config.ts");
  expect(config).toContain('include: ["tests/live/**/*.live.test.ts"]');
  expect(config).toContain("enabled: false");
  expect(config).toContain("/@live/");
  const workflow = text(".github/workflows/live.yml");
  expect(workflow).toContain("workflow_dispatch:");
  expect(workflow).not.toMatch(/\n {2}(push|pull_request|schedule):/);
  expect(workflow).toContain("contents: read");
  expect(workflow).toContain("continue-on-error: true");
  expect(workflow).toContain("persist-credentials: false");
  expect(workflow).toContain('VITTAZ_RUN_KEYLESS_LIVE: "1"');
  expect(workflow).not.toContain("secrets.");
  expect(workflow).not.toContain("npm run test:coverage");
  for (const line of workflow.split("\n").filter((l) => l.includes("uses:")))
    expect(line).toMatch(/@[0-9a-f]{40}/);
});
