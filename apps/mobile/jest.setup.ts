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

// Expo's streaming-capable fetch is used for provider SSE. In unit tests route
// it to the environment fetch so explicit fetch doubles still control traffic.
jest.mock("expo/fetch", () => ({
  fetch: jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
    globalThis.fetch(input, init),
  ),
}));

// Local chat history uses Expo SQLite's AsyncStorage-compatible KV store.
jest.mock("expo-sqlite/kv-store", () => {
  const values = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
      setItemAsync: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      removeItemAsync: jest.fn(async (key: string) => {
        values.delete(key);
      }),
    },
  };
});

// Explicit user-initiated clipboard actions only; keys are marked sensitive on Android.
jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => true),
  getStringAsync: jest.fn(async () => ""),
}));

// Shared SecureStore double for screens that manage keys outside the app shell suite.
jest.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
});
