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
import {
  add_key_profile,
  reset_key_registry,
} from "../assistant/provider_keys";

const mock_dispatch = jest.fn();
jest.mock("../store", () => ({
  useApp: () => ({ state: { model: "auto" }, dispatch: mock_dispatch }),
}));

beforeEach(async () => {
  jest.clearAllMocks();
  // Clears the registry, the legacy key slots and the plain-storage mirror, so
  // one test's profiles cannot leak into the next one's recovery.
  await reset_key_registry(SecureStore);
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

/**
 * Regression: the profile list lived in the same store as the secrets, so an
 * invalidated keystore took the list with it and the screen looked like a fresh
 * install. The rows now come back from the plain-storage mirror.
 */
it("keeps the rows visible when the keystore cannot be opened, and says why", async () => {
  await add_key_profile(SecureStore, {
    provider: "openai_compatible",
    label: "Survivor",
    base_url: "https://api.example.com/v1",
    model: "gpt-4o-mini",
    api_key: "synth-key-3",
    activate: true,
  });
  // An invalidated keystore refuses every read, not just the registry one.
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async () => {
    throw new Error("keystore_locked");
  });

  await render(<KeysScreen />);
  await waitFor(() => expect(screen.getByText("Survivor")).toBeTruthy());
  expect(
    screen.getByText("Your keys cannot be opened on this device"),
  ).toBeTruthy();
  // The key itself is unusable and the row must say so rather than "No key".
  expect(screen.getAllByText("Key unreadable — re-enter").length).toBe(1);
  // What is on disk in plain text is disclosed, not left to be discovered.
  expect(
    screen.getByText(
      /stored\s+unencrypted on this device so the list survives/,
    ),
  ).toBeTruthy();
  // Never the old dead end: the list is recoverable, so "start over" is not
  // the first thing offered.
  expect(screen.queryByText("Saved keys could not be read")).toBeNull();
});

it("does not auto-test custom non-pinned endpoints on save to prevent credential exfiltration", async () => {
  const original_fetch = globalThis.fetch;
  const mock_fetch = jest.fn(
    async () => new Response(JSON.stringify({ data: [{ id: "custom-model" }] })),
  ) as typeof fetch;
  globalThis.fetch = mock_fetch;
  try {
    await render(<KeysScreen />);
    await fireEvent.changeText(screen.getByLabelText("Label"), "Custom Untrusted");
    await fireEvent.changeText(
      screen.getByLabelText("API key"),
      "secret-token-123",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Base URL"),
      "https://untrusted-exfil.com/v1",
    );
    await fireEvent.changeText(screen.getByLabelText("Model"), "custom-model");
    await fireEvent.press(screen.getByRole("button", { name: "Save and use" }));
    await waitFor(() =>
      expect(screen.getByText("Custom Untrusted")).toBeTruthy(),
    );
    // Automated check must NOT have fired for custom endpoint!
    expect(mock_fetch).not.toHaveBeenCalled();
    expect(screen.getByText("Endpoint not checked yet")).toBeTruthy();

    // Now clicking manual "Test connection" button explicitly tests it
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Test connection for Custom Untrusted",
      }),
    );
    await waitFor(() => expect(mock_fetch).toHaveBeenCalledTimes(1));
  } finally {
    globalThis.fetch = original_fetch;
  }
});
