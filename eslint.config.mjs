import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "**/dist/**",
      "coverage/**",
      "reference/**",
      "canvas/**",
      ".agents/**",
      "apps/mobile/**",
      // Isolated evaluation harness, not application code. See docs/ai_sdk_evaluation.md.
      "spikes/**",
    ],
  },
  {
    files: ["**/*.{ts,mjs}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: { console: "readonly" } },
  },
);
