import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Alert, BackHandler } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { ModelsScreen } from "./ModelsScreen";
import { KeysScreen } from "./KeysScreen";
import {
  add_key_profile,
  reset_key_registry,
  read_key_registry,
  read_key_secret_state,
} from "../assistant/provider_keys";

const mock_dispatch = jest.fn();
jest.mock("../store", () => ({
  useApp: () => ({ state: { model: "auto" }, dispatch: mock_dispatch }),
}));

const read_secure_item = jest
  .mocked(SecureStore.getItemAsync)
  .getMockImplementation()!;

beforeEach(async () => {
  jest.mocked(SecureStore.getItemAsync).mockImplementation(read_secure_item);
  jest.clearAllMocks();
  globalThis.fetch = jest.fn(
    async () => new Response(JSON.stringify({ data: [] })),
  ) as typeof fetch;
  // Clears the registry, the legacy key slots and the plain-storage mirror, so
  // one test's profiles cannot leak into the next one's recovery.
  await reset_key_registry(SecureStore);
  mock_dispatch.mockClear();
});

async function open_editor() {
  await fireEvent.press(screen.getByRole("button", { name: "Add provider" }));
  await fireEvent.press(screen.getByRole("button", { name: "Preset Custom" }));
}
async function actions(label: string) {
  await fireEvent.press(
    screen.getByRole("button", { name: `Actions for ${label}` }),
  );
}
async function add_key(label: string, key: string, model: string) {
  await open_editor();
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

  await actions("Work");
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

  await open_editor();
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

  await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  await actions("Personal");
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await fireEvent.press(
    screen.getByRole("button", { name: "Remove key for Personal" }),
  );
  expect(screen.getByText("Personal")).toBeTruthy();
  await act(async () => {
    await alert.mock.calls
      .at(-1)?.[2]
      ?.find((button) => button.text === "Remove")
      ?.onPress?.();
  });
  await waitFor(() => expect(screen.queryByText("Personal")).toBeNull());
});

/**
 * Regression: picking a preset called a setter that does not exist, so choosing
 * a preset on the untouched form threw a ReferenceError in the running app. The
 * label field is empty at that moment, which is exactly the path that crashed.
 */
it("applies a preset on a blank form without crashing", async () => {
  await render(<KeysScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Add provider" }));
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
    async () =>
      new Response(JSON.stringify({ data: [{ id: "custom-model" }] })),
  ) as typeof fetch;
  globalThis.fetch = mock_fetch;
  try {
    await render(<KeysScreen />);
    await open_editor();
    await fireEvent.changeText(
      screen.getByLabelText("Label"),
      "Custom Untrusted",
    );
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
    await actions("Custom Untrusted");
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

it("opens a focused editor from a provider list and cancels without saving", async () => {
  await render(<KeysScreen />);
  expect(screen.getByRole("header", { name: "Providers" })).toBeTruthy();
  expect(screen.queryByLabelText("API key")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Add provider" }));
  await fireEvent.press(screen.getByRole("button", { name: "Preset Custom" }));
  expect(screen.getByText("Profile name")).toBeTruthy();
  expect(screen.getByText("API key")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByLabelText("API key")).toBeNull();
});

it("shows field errors without leaving an incomplete editor", async () => {
  await render(<KeysScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Add provider" }));
  await fireEvent.press(screen.getByRole("button", { name: "Preset Custom" }));
  await fireEvent.press(screen.getByRole("button", { name: "Save and use" }));
  expect(screen.getByText("Enter a profile name.")).toBeTruthy();
  expect(screen.getByText("Enter an API key.")).toBeTruthy();
  expect(screen.getByText("Enter a valid model name.")).toBeTruthy();
});

it("edits a profile without replacing a blank key and cancels without saving", async () => {
  await render(<KeysScreen />);
  await add_key("Original", "synthetic-keep-key", "first-model");
  const registry = await read_key_registry(SecureStore);
  await fireEvent.press(
    screen.getByRole("button", { name: "Edit key for Original" }),
  );
  expect(screen.getByLabelText("API key").props.value).toBe("");
  expect(screen.getByText("Leave blank to keep the saved key.")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Label"), "Updated");
  await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.getByText("Updated")).toBeTruthy());
  expect(
    await read_key_secret_state(SecureStore, registry.profiles[0].id),
  ).toEqual({ state: "ok", value: "synthetic-keep-key" });
  await fireEvent.press(
    screen.getByRole("button", { name: "Edit key for Updated" }),
  );
  await fireEvent.changeText(screen.getByLabelText("Label"), "Discarded");
  await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect((await read_key_registry(SecureStore)).profiles[0].label).toBe(
    "Updated",
  );
});

it("keeps the draft on save failure", async () => {
  await render(<KeysScreen />);
  await open_editor();
  await fireEvent.changeText(screen.getByLabelText("Label"), "Retry me");
  await fireEvent.changeText(
    screen.getByLabelText("API key"),
    "synthetic-retry-key",
  );
  await fireEvent.changeText(screen.getByLabelText("Model"), "test-model");
  jest
    .mocked(SecureStore.setItemAsync)
    .mockRejectedValueOnce(new Error("unavailable"));
  await fireEvent.press(screen.getByRole("button", { name: "Save and use" }));
  await waitFor(() =>
    expect(
      screen.getByText(
        "Could not save this provider. Your changes are still here; try again.",
      ),
    ).toBeTruthy(),
  );
  expect(screen.getByDisplayValue("Retry me")).toBeTruthy();
});

it("locks the draft during model discovery and filters models in place", async () => {
  await render(<KeysScreen />);
  await open_editor();
  await fireEvent.changeText(
    screen.getByLabelText("API key"),
    "synthetic-list-key",
  );
  let respond!: (value: Response) => void;
  globalThis.fetch = jest.fn(
    () =>
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
  ) as typeof fetch;
  await fireEvent.press(screen.getByRole("button", { name: "Fetch models" }));
  expect(screen.getByLabelText("API key").props.editable).toBe(false);
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByLabelText("API key")).toBeTruthy();
  respond(
    new Response(
      JSON.stringify({ data: [{ id: "alpha-model" }, { id: "beta-model" }] }),
    ),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Search models")).toBeTruthy(),
  );
  await fireEvent.changeText(screen.getByLabelText("Search models"), "beta");
  expect(screen.queryByRole("button", { name: "alpha-model" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "beta-model" }));
  expect(screen.getByLabelText("Model").props.value).toBe("beta-model");
});

it("removes no profile when removal is cancelled", async () => {
  await render(<KeysScreen />);
  await add_key("Keep this", "synthetic-keep", "test-model");
  await actions("Keep this");
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await fireEvent.press(
    screen.getByRole("button", { name: "Remove key for Keep this" }),
  );
  expect(alert.mock.calls.at(-1)?.[0]).toBe("Remove Keep this?");
  await alert.mock.calls
    .at(-1)?.[2]
    ?.find((button) => button.text === "Cancel")
    ?.onPress?.();
  expect((await read_key_registry(SecureStore)).profiles).toHaveLength(1);
});

it("handles Android Back inside the focused editor", async () => {
  const subscriptions = jest.spyOn(BackHandler, "addEventListener");
  await render(<KeysScreen />);
  await open_editor();
  const back = subscriptions.mock.calls.at(-1)?.[1];
  expect(back).toBeDefined();
  await act(async () => {
    expect(back?.({} as never)).toBe(true);
  });
  expect(screen.getByRole("header", { name: "Providers" })).toBeTruthy();
});

it("does not reveal a key after its actions have been closed", async () => {
  await render(<KeysScreen />);
  await add_key("Private", "synthetic-delayed-secret", "test-model");
  const registry = await read_key_registry(SecureStore);
  let release!: (value: string) => void;
  jest.mocked(SecureStore.getItemAsync).mockImplementation((name) =>
    name === `assistant_key_${registry.profiles[0].id}`
      ? new Promise<string>((resolve) => {
          release = resolve;
        })
      : read_secure_item(name),
  );
  await actions("Private");
  await fireEvent.press(
    screen.getByRole("button", { name: "Show key for Private" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Close provider actions" }),
  );
  await act(async () => {
    release("synthetic-delayed-secret");
  });
  expect(screen.queryByText("synthetic-delayed-secret")).toBeNull();
});

it("handles Android Back inside legacy route configuration", async () => {
  const subscriptions = jest.spyOn(BackHandler, "addEventListener");
  await render(<ModelsScreen />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Configure provider" }),
  );
  const back = subscriptions.mock.calls.at(-1)?.[1];
  expect(back).toBeDefined();
  await act(async () => {
    expect(back?.({} as never)).toBe(true);
  });
  expect(screen.getByRole("header", { name: "Choose model" })).toBeTruthy();
});

afterEach(() => {
  jest.restoreAllMocks();
});
