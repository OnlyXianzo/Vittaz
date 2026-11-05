import { defineConfig } from "vitest/config";
import normal from "./vitest.config.js";
export default defineConfig({
  test: {
    alias: normal.test?.alias,
    include: ["tests/live/**/*.live.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    testNamePattern: /@live/,
    fileParallelism: false,
    retry: 0,
    testTimeout: 75000,
    coverage: { enabled: false },
  },
});
