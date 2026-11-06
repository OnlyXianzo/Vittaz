import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    alias: {
      "@vittaz/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
      "@vittaz/storage": fileURLToPath(
        new URL("./packages/storage/src/index.ts", import.meta.url),
      ),
      "@vittaz/agent": fileURLToPath(
        new URL("./packages/agent/src/index.ts", import.meta.url),
      ),
    },
    include: [
      "packages/**/*.test.ts",
      "apps/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "reference/**",
      "canvas/**",
      "apps/mobile/**",
      "**/*.live.test.ts",
    ],
    testNamePattern: /^(?!.*@live)/,
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/cli/src/**/*.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
