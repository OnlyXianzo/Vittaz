import { beforeEach, expect, it, jest } from "@jest/globals";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { KeysScreen } from "./KeysScreen";
import { KEY_PROFILES_NAME } from "../assistant/provider_keys";

const mock_dispatch = jest.fn();
jest.mock("../store", () => ({
  useApp: () => ({ state: { model: "auto" }, dispatch: mock_dispatch }),
}));

beforeEach(async () => {
  jest.clearAllMocks();
  await SecureStore.deleteItemAsync(KEY_PROFILES_NAME);
  mock_dispatch.mockClear();
});

async function add_key(label: string, key: string, model: string) {
  await fireEvent.changeText(screen.getByLabelText("Label"), label);
  await fireEvent.changeText(screen.getByLabelText("API key"), key);
  await fireEvent.changeText(screen.getByLabelText("Model"), model);
  await fireEvent.press(screen.getByRole("button", { name: "Save and use" }));
  await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
}

it("manages multiple keys with show/hide, copy/paste and fetched models", async () => {
  await render(<KeysScreen />);
  await add_key("Work", "synthetic-key-one", "gpt-4o-mini");
  await add_key("Personal", "synthetic-key-two", "gpt-4.1-mini");
  expect(screen.getByText("Work")).toBeTruthy();
  expect(screen.getByText("Personal")).toBeTruthy();

  await fireEvent.press(
    screen.getByRole("button", { name: "Show key for Work" }),
  );
  expect(screen.getByText("synthetic-key-one")).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "Hide key for Work" }),
  );
  expect(screen.queryByText("synthetic-key-one")).toBeNull();

  await fireEvent.press(
    screen.getByRole("button", { name: "Copy key for Work" }),
  );
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith("synthetic-key-one", {
    android: { isSensitive: true },
  });

  jest.mocked(Clipboard.getStringAsync).mockResolvedValueOnce("pasted-key");
  await fireEvent.press(screen.getByRole("button", { name: "Paste key" }));
  expect(screen.getByDisplayValue("pasted-key")).toBeTruthy();

  const original_fetch = globalThis.fetch;
  globalThis.fetch = jest.fn(
    async () => new Response(JSON.stringify({ data: [{ id: "gpt-4.1" }] })),
  ) as typeof fetch;
  try {
    await fireEvent.press(screen.getByRole("button", { name: "Fetch models" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "gpt-4.1" })).toBeTruthy(),
    );
    await fireEvent.press(screen.getByRole("button", { name: "gpt-4.1" }));
    expect(screen.getByDisplayValue("gpt-4.1")).toBeTruthy();
  } finally {
    globalThis.fetch = original_fetch;
  }

  await fireEvent.press(
    screen.getByRole("button", { name: "Remove key for Personal" }),
  );
  await waitFor(() => expect(screen.queryByText("Personal")).toBeNull());
});

/**
 * Regression: picking a preset called a setter that does not exist, so choosing
 * a preset on the untouched form threw a ReferenceError in the running app. The
 * label field is empty at that moment, which is exactly the path that crashed.
 */
it("applies a preset on a blank form without crashing", async () => {
  await render(<KeysScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Preset Gemini" }));
  // The label is prefilled from the preset ...
  await waitFor(() =>
    expect(screen.getByDisplayValue("Google Gemini")).toBeTruthy(),
  );
  // ... and the key is still required before it can be saved.
  await fireEvent.changeText(
    screen.getByLabelText("API key"),
    "synthetic-preset-key",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Save and use" }));
  await waitFor(() => expect(screen.getByText("Google Gemini")).toBeTruthy());
});
