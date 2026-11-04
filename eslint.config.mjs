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
    ],
  },
  {
    files: ["**/*.{ts,mjs}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: { console: "readonly" } },
  },
);
