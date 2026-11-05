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
  // `../src` holds the shared domain modules imported through metro.config.cjs.
  roots: ["<rootDir>", "<rootDir>/../src"],
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transformIgnorePatterns,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
    "!src/domain.ts",
  ],
};
