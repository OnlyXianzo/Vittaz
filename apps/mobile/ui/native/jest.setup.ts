import type { ReactNode } from "react";

// The official mock ships insets but no provider; pass children straight
// through so the whole app tree renders in tests.
jest.mock("react-native-safe-area-context", () => {
  const mock = jest.requireActual("react-native-safe-area-context/jest/mock");
  const passthrough = ({ children }: { children: ReactNode }) => children;
  return {
    ...mock,
    SafeAreaProvider: passthrough,
    SafeAreaView: passthrough,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// Deterministic tests: the onboarding blobs check Reduce Motion before drifting.
jest.mock(
  "react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo",
  () => {
    const actual = jest.requireActual(
      "react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo",
    );
    return {
      ...actual,
      default: {
        ...actual.default,
        isReduceMotionEnabled: () => Promise.resolve(true),
        addEventListener: () => ({ remove: () => {} }),
      },
    };
  },
);
