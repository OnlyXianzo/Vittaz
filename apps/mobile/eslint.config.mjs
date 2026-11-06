import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "node_modules/**",
      // The sibling web preview keeps its own toolchain and dependencies.
      "ui/**",
      ".expo/**",
      "coverage/**",
      "dist/**",
      "expo-env.d.ts",
    ],
  },
  {
    files: ["**/*.{ts,tsx,mjs}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
