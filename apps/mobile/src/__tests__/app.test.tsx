import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { createProposal } from "@vittaz/core";
import { randomUUID } from "expo-crypto";
import App from "../../App";
import * as SecureStore from "expo-secure-store";
import {
  ASSISTANT_PROVIDER_PROFILE_NAME,
  KILO_KEY_NAME,
  OPENAI_COMPATIBLE_KEY_NAME,
} from "../assistant/secure_key";
import { create_mobile_qa_agent } from "../assistant/mobile_qa";

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

jest.mock("../assistant/mobile_qa", () => ({
  create_mobile_qa_agent: jest.fn(() => ({
    answerQuestion: jest.fn(
      async (
        _question: string,
        options: { onValidatedChunk?: (chunk: string) => void | Promise<void> },
      ) => {
        await options.onValidatedChunk?.("Synthetic safe answer.");
        return {
          answered: true,
          stopReason: "completed",
          stepsUsed: 2,
          tokensUsed: 20,
          toolsUsed: ["get_month_summary"],
          answer: "Synthetic safe answer.",
        };
      },
    ),
  })),
}));

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "11111111-1111-4111-8111-111111111111"),
}));
import {
  getMemoryRows,
  openMobileLedgerStore,
  resetMemoryLedger,
} from "./mock_mobile_storage";

// This shell suite uses an in-memory LedgerStore double. The *same* contract
// cases run against the real Expo adapter + SQLite engine in root Vitest tests.
jest.mock("../storage/open_ledger_store", () =>
  jest.requireActual("./mock_mobile_storage"),
);

async function open() {
  return render(<App />);
}

async function tab(name: string) {
  await fireEvent.press(screen.getByRole("tab", { name }));
}

async function withoutGlobalCrypto<T>(operation: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: undefined,
  });
  try {
    return await operation();
  } finally {
    if (original) Object.defineProperty(globalThis, "crypto", original);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
}

beforeEach(async () => {
  resetMemoryLedger();
  await SecureStore.deleteItemAsync(KILO_KEY_NAME);
  await SecureStore.deleteItemAsync(OPENAI_COMPATIBLE_KEY_NAME);
  await SecureStore.deleteItemAsync(ASSISTANT_PROVIDER_PROFILE_NAME);
  jest.clearAllMocks();
});

describe("Vittaz native shell backed by core", () => {
  it("opens on an empty local ledger instead of demo transactions", async () => {
    await open();
    expect(screen.getByRole("header", { name: "Vittaz" })).toBeTruthy();
    expect(screen.getByText("Net spend this month")).toBeTruthy();
    expect(screen.getAllByText("₹0").length).toBeGreaterThan(0);
    expect(screen.queryByText("Tea stall")).toBeNull();
    expect(screen.queryByText("Reliance BP")).toBeNull();
    for (const name of ["Home", "Inbox", "Ledger", "People", "Settings"])
      expect(screen.getByRole("tab", { name })).toBeTruthy();
  });

  it("creates a manual transaction through packages/core and reloads it from the store", async () => {
    await open();
    await tab("Ledger");
    await fireEvent.press(
      screen.getByRole("button", { name: "Add transaction" }),
    );
    await fireEvent.changeText(screen.getByLabelText("Amount"), "250");
    await fireEvent.changeText(
      screen.getByLabelText("Person"),
      "Synthetic Cafe",
    );
    await withoutGlobalCrypto(async () => {
      await fireEvent.press(
        screen.getByRole("button", { name: "Save transaction" }),
      );
      await waitFor(() =>
        expect(screen.getByText("Saved to this device.")).toBeTruthy(),
      );
    });
    expect(randomUUID).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await tab("Ledger");
    await waitFor(() =>
      expect(screen.getByText("Synthetic Cafe")).toBeTruthy(),
    );
    expect(screen.getAllByText("₹250").length).toBeGreaterThan(0);
    expect(screen.getByText("Synthetic Cafe")).toBeTruthy();
    expect(screen.getAllByText("₹250").length).toBeGreaterThan(0);
  });

  it("separates transaction direction from expense category on the add screen", async () => {
    await open();
    await tab("Ledger");
    await fireEvent.press(
      screen.getByRole("button", { name: "Add transaction" }),
    );

    expect(screen.getByText("Direction")).toBeTruthy();
    expect(screen.getByTestId("direction-category-separator")).toBeTruthy();
    expect(screen.getByText("Category")).toBeTruthy();
  });

  it("does not save a lent entry without a counterparty", async () => {
    await open();
    await tab("Ledger");
    await fireEvent.press(
      screen.getByRole("button", { name: "Add transaction" }),
    );
    await fireEvent.changeText(screen.getByLabelText("Amount"), "40");
    await fireEvent.press(screen.getByRole("button", { name: "Lent" }));
    await fireEvent.press(
      screen.getByRole("button", { name: "Save transaction" }),
    );
    await waitFor(() =>
      expect(screen.getByText("person_required_for_lent_entry")).toBeTruthy(),
    );
    expect(getMemoryRows("transactions")).toHaveLength(0);
  });

  it("persists a lent entry as a core split and derives receivable from it", async () => {
    await open();
    await tab("Ledger");
    await fireEvent.press(
      screen.getByRole("button", { name: "Add transaction" }),
    );
    await fireEvent.changeText(screen.getByLabelText("Amount"), "40");
    await fireEvent.changeText(screen.getByLabelText("Person"), "Person_1");
    await fireEvent.press(screen.getByRole("button", { name: "Lent" }));
    await fireEvent.press(
      screen.getByRole("button", { name: "Save transaction" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Saved to this device.")).toBeTruthy(),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await tab("Home");
    expect(screen.getByText("Receivable")).toBeTruthy();
    expect(screen.getAllByText("₹40").length).toBeGreaterThan(0);
  });

  it("loads and approves a pending core proposal through the review UI", async () => {
    const store = await openMobileLedgerStore();
    await createProposal(store, {
      amountPaise: 12500,
      direction: "debit",
      category: "Synthetic",
      counterpartyName: "Person_1",
      source: "manual_test",
      occurredAt: "2026-11-06T00:00:00.000Z",
    });
    await store.close();

    await open();
    await tab("Inbox");
    expect(screen.getByRole("header", { name: "Pending inbox" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^Select / }));
    await fireEvent.press(
      screen.getByRole("button", { name: /^Review selected/ }),
    );
    await withoutGlobalCrypto(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
      await waitFor(() =>
        expect(
          screen.getByText("Approved and saved to this device."),
        ).toBeTruthy(),
      );
    });
    expect(randomUUID).toHaveBeenCalledTimes(2);
    await tab("Ledger");
    expect(screen.getByText("Person_1")).toBeTruthy();
    expect(screen.getByText("₹125")).toBeTruthy();
  });

  it("answers a synthetic ledger question with a read-only tool and validated streamed text", async () => {
    await open();
    await fireEvent.press(
      screen.getByRole("button", { name: "Add or ask by message" }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("Question"),
      "What did I spend this month?",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Ask Assistant" }),
    );
    expect(screen.getByRole("header", { name: "Assistant" })).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText("Synthetic safe answer.")).toBeTruthy(),
    );
    expect(screen.getByText("get_month_summary")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Auto, Kilo Auto Free" }),
    ).toBeTruthy();
    expect(getMemoryRows("transactions")).toHaveLength(0);
  });

  it("stores an optional Kilo Gateway key securely while exposing keyless free access", async () => {
    await open();
    await tab("Settings");
    await fireEvent.press(
      screen.getByRole("button", { name: "Model and keys" }),
    );
    expect(screen.getByRole("radio", { name: "Kilo Auto Free" })).toBeTruthy();
    expect(screen.getByText(/no key is required/i)).toBeTruthy();
    const key_input = screen.getByLabelText("Kilo Gateway API key");
    expect(key_input.props.secureTextEntry).toBe(true);
    await fireEvent.changeText(key_input, "fake-kilo-key");
    await fireEvent.press(screen.getByRole("button", { name: "Save key" }));
    await waitFor(() =>
      expect(screen.getByText("Kilo key saved securely.")).toBeTruthy(),
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      KILO_KEY_NAME,
      "fake-kilo-key",
    );
    expect(screen.queryByText("fake-kilo-key")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Remove key" }));
    await waitFor(() =>
      expect(screen.getByText(/Kilo key removed/)).toBeTruthy(),
    );
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(KILO_KEY_NAME);
  });

  it("selects OpenAI-compatible BYOK and keeps its key in SecureStore", async () => {
    await open();
    await tab("Settings");
    await fireEvent.press(
      screen.getByRole("button", { name: "Model and keys" }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("OpenAI-compatible API base URL"),
      "https://compatible.example/api/v1",
    );
    await fireEvent.changeText(
      screen.getByLabelText("OpenAI-compatible model"),
      "synthetic-compatible-model",
    );
    await fireEvent.press(
      screen.getByRole("radio", { name: "OpenAI-compatible BYOK" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Save provider settings" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "OpenAI-compatible BYOK" }).props
          .accessibilityState.checked,
      ).toBe(true),
    );
    const key_input = screen.getByLabelText("OpenAI-compatible API key");
    expect(key_input.props.secureTextEntry).toBe(true);
    await fireEvent.changeText(key_input, "test-key");
    await fireEvent.press(
      screen.getByRole("button", { name: "Save OpenAI-compatible key" }),
    );
    await waitFor(() =>
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        OPENAI_COMPATIBLE_KEY_NAME,
        "test-key",
      ),
    );
    expect(screen.queryByText("test-key")).toBeNull();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      ASSISTANT_PROVIDER_PROFILE_NAME,
      JSON.stringify({
        selected_provider: "openai_compatible",
        base_url: "https://compatible.example/api/v1",
        model: "synthetic-compatible-model",
      }),
    );

    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await tab("Home");
    await fireEvent.press(
      screen.getByRole("button", { name: "Add or ask by message" }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("Question"),
      "Synthetic balance question",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Ask Assistant" }),
    );
    await waitFor(() =>
      expect(create_mobile_qa_agent).toHaveBeenCalledWith(expect.anything(), {
        kind: "openai_compatible",
        api_key: "test-key",
        base_url: "https://compatible.example/api/v1",
        model: "synthetic-compatible-model",
      }),
    );
    expect(
      screen.getByRole("button", { name: "OpenAI-compatible BYOK" }),
    ).toBeTruthy();
    expect(getMemoryRows("transactions")).toHaveLength(0);
  });

  it("does not silently fall back to Kilo after the selected BYOK key is removed", async () => {
    await open();
    await tab("Settings");
    await fireEvent.press(
      screen.getByRole("button", { name: "Model and keys" }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("OpenAI-compatible model"),
      "synthetic-compatible-model",
    );
    await fireEvent.press(
      screen.getByRole("radio", { name: "OpenAI-compatible BYOK" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Save provider settings" }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("OpenAI-compatible API key"),
      "test-key",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Save OpenAI-compatible key" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Remove OpenAI-compatible key" }),
    );
    await waitFor(() =>
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
        OPENAI_COMPATIBLE_KEY_NAME,
      ),
    );
    expect(
      screen.getByRole("radio", { name: "OpenAI-compatible BYOK" }).props
        .accessibilityState.checked,
    ).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await tab("Home");
    await fireEvent.press(
      screen.getByRole("button", { name: "Add or ask by message" }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("Question"),
      "Synthetic balance question",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Ask Assistant" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/No OpenAI-compatible API key is saved/i),
      ).toBeTruthy(),
    );
    expect(create_mobile_qa_agent).not.toHaveBeenCalled();
    expect(getMemoryRows("transactions")).toHaveLength(0);
  });

  it("never creates a ledger entry or proposal from an assistant reply", async () => {
    await open();
    await fireEvent.press(
      screen.getByRole("button", { name: "Add or ask by message" }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("Question"),
      "Who owes me?",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Ask Assistant" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Synthetic safe answer.")).toBeTruthy(),
    );
    expect(getMemoryRows("transactions")).toHaveLength(0);
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await tab("Inbox");
    expect(screen.getByText("Inbox is clear")).toBeTruthy();
  });

  it("states the active read-only cloud boundary and keeps model selection interactive", async () => {
    await open();
    await tab("Settings");
    expect(
      screen.getByText(/selected provider answers read-only ledger questions/i),
    ).toBeTruthy();
    expect(
      screen.queryByRole("switch", { name: "Send notes to cloud" }),
    ).toBeNull();
    expect(screen.queryByRole("switch", { name: "Replace names" })).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "Model and keys" }),
    );
    expect(screen.getByRole("header", { name: "Choose model" })).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("radio", { name: "Kilo Auto Free" }),
    );
    expect(
      screen.getByRole("radio", { name: "Kilo Auto Free" }).props
        .accessibilityState.checked,
    ).toBe(true);
  });

  it("replays onboarding and returns Home", async () => {
    await open();
    await tab("Settings");
    await fireEvent.press(
      screen.getByRole("button", { name: "Replay onboarding" }),
    );
    expect(
      screen.getByRole("header", { name: "Hey mate, welcome to Vittaz" }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Get started" }));
    expect(
      screen.getByRole("header", { name: "How entries get in" }),
    ).toBeTruthy();
  });
});
