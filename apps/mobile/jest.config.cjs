const preset = require("jest-expo/jest-preset");

// jest-expo already knows which RN/Expo packages ship untranspiled code; extend
// its allowlist with the two extra native view packages this app uses.
const transformIgnorePatterns = preset.transformIgnorePatterns.map((pattern) =>
  pattern.replace(
    "standard-navigation",
    "standard-navigation|react-native-svg|react-native-safe-area-context",
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
