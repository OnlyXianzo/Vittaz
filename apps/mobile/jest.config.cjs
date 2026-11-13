const preset = require("jest-expo/jest-preset");

// jest-expo already knows which RN/Expo packages ship untranspiled code; extend
// its allowlist with the two extra native view packages this app uses, plus the
// AI SDK packages. `ai` and `@ai-sdk/*` are ESM-only on disk, so Jest's
// CommonJS runtime must transform them rather than require them raw.
const transformIgnorePatterns = preset.transformIgnorePatterns.map((pattern) =>
  pattern.replace(
    "standard-navigation",
    "standard-navigation|react-native-svg|react-native-safe-area-context|lucide-react-native|@ai-sdk|@workflow|ai",
  ),
);

module.exports = {
  preset: "jest-expo",
  // `./ui/src` holds the shared domain modules imported through metro.config.cjs.
  roots: ["<rootDir>/src", "<rootDir>/ui/src"],
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // The shared modules in `./ui/src` are transformed by this project's Babel, so
  // their helper imports must resolve here, not in the preview's node_modules
  // (which does not exist in this job).
  modulePaths: ["<rootDir>/node_modules"],
  // S34: resolve the domain core to source, matching metro.config.cjs.
  moduleNameMapper: {
    "^@vittaz/core$": "<rootDir>/../../packages/core/src/index.ts",
    "^zod$": "<rootDir>/node_modules/zod/index.cjs",
    // lucide-react-native resolves to its `.mjs` build under the react-native
    // condition, and jest-expo's transform does not cover `.mjs`. Point Jest at
    // the CommonJS build that ships beside it — same trick as zod above.
    "^lucide-react-native$":
      "<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
    // The AI SDK imports zod subpaths (e.g. `zod/v4/locales/en.js`) which are
    // ESM on disk. Zod ships a `.cjs` beside every one, so route them there.
    "^zod/(.*)\\.js$": "<rootDir>/node_modules/zod/$1.cjs",
    // Core uses NodeNext ".js" specifiers over ".ts" sources.
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  // The nested web preview runs its own vitest suite; never collect it here.
  modulePathIgnorePatterns: [
    "<rootDir>/ui/node_modules",
    "<rootDir>/ui/src/.*\\.test\\.tsx?$",
  ],
  transformIgnorePatterns,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
    "!src/domain.ts",
  ],
};
