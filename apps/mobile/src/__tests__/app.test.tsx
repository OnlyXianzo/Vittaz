import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { createProposal } from "@vittaz/core";
import { randomUUID } from "expo-crypto";
import App from "../../App";
import * as SecureStore from "expo-secure-store";
import Storage from "expo-sqlite/kv-store";
import { CHAT_HISTORY_KEY } from "../assistant/chat_history";
import {
  CONVERSATIONS_KEY,
  create_conversation,
  save_conversation_messages,
} from "../assistant/conversations";
import {
  ANTHROPIC_API_KEY_NAME,
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
  ...(jest.requireActual("../assistant/mobile_qa") as object),
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

afterEach(async () => {
  await cleanup();
});

beforeEach(async () => {
  resetMemoryLedger();
  await SecureStore.deleteItemAsync(KILO_KEY_NAME);
  await SecureStore.deleteItemAsync(OPENAI_COMPATIBLE_KEY_NAME);
  await SecureStore.deleteItemAsync(ASSISTANT_PROVIDER_PROFILE_NAME);
  await Storage.removeItemAsync(CHAT_HISTORY_KEY);
  await Storage.removeItemAsync(CONVERSATIONS_KEY);
  jest.clearAllMocks();
});

it("opens separate saved conversations and creates a new one", async () => {
  await create_conversation("chat_first");
  await save_conversation_messages("chat_first", [
    { id: "m1", role: "user", text: "First synthetic question" },
  ]);
  await create_conversation("chat_second");
  await save_conversation_messages("chat_second", [
    { id: "m2", role: "user", text: "Second synthetic question" },
  ]);
  await open();
  await waitFor(() =>
    expect(screen.getByText("Second synthetic question")).toBeTruthy(),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Chat history" }));
  await fireEvent.press(
    screen.getByRole("button", {
      name: "Open conversation: First synthetic question",
    }),
  );
  await waitFor(() =>
    expect(screen.getByText("First synthetic question")).toBeTruthy(),
  );
  expect(screen.queryByText("Second synthetic question")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Chat history" }));
  await fireEvent.press(
    screen.getByRole("button", { name: "New conversation" }),
  );
  await waitFor(() =>
    expect(screen.queryByText("First synthetic question")).toBeNull(),
  );
});

it("prevents switching while a reply is in flight and keeps context isolated", async () => {
  await create_conversation("chat_first");
  await save_conversation_messages("chat_first", [
    { id: "m1", role: "user", text: "First synthetic context" },
  ]);
  await create_conversation("chat_second");
  await save_conversation_messages("chat_second", [
    { id: "m2", role: "user", text: "Second synthetic context" },
  ]);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let history: unknown = null;
  jest.mocked(create_mobile_qa_agent).mockImplementationOnce(
    () =>
      ({
        answerQuestion: jest.fn(
          async (_question: string, options: { history?: unknown }) => {
            history = options.history;
            await pending;
            return {
              answered: true,
              stopReason: "completed",
              stepsUsed: 0,
              tokensUsed: 1,
              toolsUsed: [],
              answer: "Synthetic reply",
            };
          },
        ),
      }) as unknown as ReturnType<typeof create_mobile_qa_agent>,
  );
  await open();
  await waitFor(() =>
    expect(screen.getByText("Second synthetic context")).toBeTruthy(),
  );
  await fireEvent.changeText(
    screen.getByLabelText("Message"),
    "Synthetic followup",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(history).not.toBeNull());
  expect(history).toEqual([
    { role: "user", content: "Second synthetic context" },
  ]);
  await fireEvent.press(screen.getByRole("button", { name: "Chat history" }));
  expect(
    screen.getByRole("button", {
      name: "Open conversation: First synthetic context",
    }).props.accessibilityState.disabled,
  ).toBe(true);
  release();
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: "Open conversation: First synthetic context",
      }).props.accessibilityState.disabled,
    ).toBe(false),
  );
  await fireEvent.press(
    screen.getByRole("button", {
      name: "Open conversation: First synthetic context",
    }),
  );
  await waitFor(() =>
    expect(screen.getByText("First synthetic context")).toBeTruthy(),
  );
  expect(screen.queryByText("Synthetic reply")).toBeNull();
});

describe("Vittaz native shell backed by core", () => {
  it("opens on an empty local ledger instead of demo transactions", async () => {
    await open();
    expect(screen.getByRole("header", { name: "Vittaz" })).toBeTruthy();
    expect(screen.queryByText(/TEST BUILD ONLY/)).toBeNull();
    expect(screen.getByText("Net spend this month")).toBeTruthy();
    expect(screen.getAllByText("₹0").length).toBeGreaterThan(0);
    expect(screen.queryByText("Tea stall")).toBeNull();
    expect(screen.queryByText("Reliance BP")).toBeNull();
    for (const name of ["Home", "Inbox", "Ledger", "People", "Settings"])
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    await tab("Settings");
    expect(
      screen.queryByRole("button", { name: "Save test log to Downloads" }),
    ).toBeNull();
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
    await fireEvent.press(
      screen.getByRole("radio", { name: "OpenAI-compatible BYOK" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "OpenAI-compatible BYOK" }).props
          .accessibilityState.checked,
      ).toBe(true),
    );
    await fireEvent.changeText(
      screen.getByLabelText("OpenAI-compatible API base URL"),
      "https://compatible.example/api/v1",
    );
    await fireEvent.changeText(
      screen.getByLabelText("OpenAI-compatible model"),
      "synthetic-compatible-model",
    );
    const key_input = screen.getByLabelText("OpenAI-compatible API key");
    expect(key_input.props.secureTextEntry).toBe(true);
    await fireEvent.changeText(key_input, "test-key");
    await fireEvent.press(screen.getByRole("button", { name: "Save and use" }));
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

  it("selects direct Anthropic API-key BYOK, stores the key securely, and routes read-only chat", async () => {
    await open();
    await tab("Settings");
    await fireEvent.press(
      screen.getByRole("button", { name: "Model and keys" }),
    );
    await fireEvent.press(
      screen.getByRole("radio", { name: "Anthropic API-key BYOK" }),
    );
    const key_input = screen.getByLabelText("Anthropic API key");
    expect(key_input.props.secureTextEntry).toBe(true);
    await fireEvent.changeText(key_input, "fake-key");
    await fireEvent.press(screen.getByRole("button", { name: "Save and use" }));
    await waitFor(() =>
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        ANTHROPIC_API_KEY_NAME,
        "fake-key",
      ),
    );
    expect(screen.queryByText("fake-key")).toBeNull();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      ASSISTANT_PROVIDER_PROFILE_NAME,
      JSON.stringify({
        selected_provider: "anthropic",
        base_url: "https://api.openai.com/v1",
        model: "",
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
        kind: "anthropic",
        api_key: "fake-key",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Claude API-key BYOK" }),
    ).toBeTruthy();
    expect(getMemoryRows("transactions")).toHaveLength(0);
  });

  it("does not silently fall back to Kilo when the selected Anthropic key is absent", async () => {
    await SecureStore.deleteItemAsync(ANTHROPIC_API_KEY_NAME);
    await open();
    await tab("Settings");
    await fireEvent.press(
      screen.getByRole("button", { name: "Model and keys" }),
    );
    await fireEvent.press(
      screen.getByRole("radio", { name: "Anthropic API-key BYOK" }),
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
      expect(screen.getByText(/No Anthropic API key is saved/i)).toBeTruthy(),
    );
    expect(create_mobile_qa_agent).not.toHaveBeenCalled();
    expect(getMemoryRows("transactions")).toHaveLength(0);
  });

  it("does not silently fall back to Kilo after the selected BYOK key is removed", async () => {
    await open();
    await tab("Settings");
    await fireEvent.press(
      screen.getByRole("button", { name: "Model and keys" }),
    );
    await fireEvent.press(
      screen.getByRole("radio", { name: "OpenAI-compatible BYOK" }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("OpenAI-compatible model"),
      "synthetic-compatible-model",
    );
    await fireEvent.changeText(
      screen.getByLabelText("OpenAI-compatible API key"),
      "test-key",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save and use" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Remove key" })).toBeTruthy(),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Remove key" }));
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

  it("shows only the selected provider's configuration (progressive disclosure)", async () => {
    await open();
    await tab("Settings");
    await fireEvent.press(
      screen.getByRole("button", { name: "Model and keys" }),
    );
    // Kilo is selected by default; only its key field is shown.
    expect(screen.getByLabelText("Kilo Gateway API key")).toBeTruthy();
    expect(
      screen.queryByLabelText("OpenAI-compatible API base URL"),
    ).toBeNull();
    expect(screen.queryByLabelText("Anthropic API key")).toBeNull();
    await fireEvent.press(
      screen.getByRole("radio", { name: "OpenAI-compatible BYOK" }),
    );
    expect(
      screen.getByLabelText("OpenAI-compatible API base URL"),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Kilo Gateway API key")).toBeNull();
    expect(screen.queryByLabelText("Anthropic API key")).toBeNull();
    await fireEvent.press(
      screen.getByRole("radio", { name: "Anthropic API-key BYOK" }),
    );
    expect(screen.getByLabelText("Anthropic API key")).toBeTruthy();
    expect(
      screen.queryByLabelText("OpenAI-compatible API base URL"),
    ).toBeNull();
  });

  it("blocks saving an incomplete OpenAI-compatible provider with inline errors", async () => {
    await open();
    await tab("Settings");
    await fireEvent.press(
      screen.getByRole("button", { name: "Model and keys" }),
    );
    await fireEvent.press(
      screen.getByRole("radio", { name: "OpenAI-compatible BYOK" }),
    );
    // The default base URL is valid HTTPS, but model and key are empty.
    await fireEvent.press(screen.getByRole("button", { name: "Save and use" }));
    expect(screen.getByText("Enter a valid model name.")).toBeTruthy();
    expect(
      screen.getByText("Enter an API key for this endpoint."),
    ).toBeTruthy();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith(
      OPENAI_COMPATIBLE_KEY_NAME,
      expect.anything(),
    );
    expect(getMemoryRows("transactions")).toHaveLength(0);
  });

  it("gives the multi-step loop enough total time for a slow provider (no mid-step timeout)", async () => {
    await open();
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
      expect(screen.getByText("Synthetic safe answer.")).toBeTruthy(),
    );
    const mock_agent = jest.mocked(create_mobile_qa_agent).mock.results[0]
      ?.value as unknown as {
      answerQuestion: { mock: { calls: unknown[][] } };
    };
    const options = mock_agent.answerQuestion.mock.calls[0][1] as {
      timeoutMs?: number;
    };
    // The loop timeout is shared across all tool steps and must exceed the
    // 45s per-call provider timeout so a slow multi-step answer can finish.
    expect(options.timeoutMs).toBeGreaterThanOrEqual(90000);
  });

  describe("S37c — provider disclosure and selection checks", () => {
    async function ask(question: string) {
      await fireEvent.press(
        screen.getByRole("button", { name: "Add or ask by message" }),
      );
      await fireEvent.changeText(screen.getByLabelText("Question"), question);
      await fireEvent.press(
        screen.getByRole("button", { name: "Ask Assistant" }),
      );
    }
    async function select_provider(name: string) {
      await tab("Settings");
      await fireEvent.press(
        screen.getByRole("button", { name: "Model and keys" }),
      );
      await fireEvent.press(screen.getByRole("radio", { name }));
      await fireEvent.press(screen.getByRole("button", { name: "Back" }));
      await tab("Home");
    }

    it("shows the selected Kilo route and a leaves-device disclosure in chat", async () => {
      await open();
      await ask("Synthetic question");
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Auto, Kilo Auto Free" }),
        ).toBeTruthy(),
      );
      expect(
        screen.getByText(
          /Kilo Auto Free may route prompts to providers that log them/,
        ),
      ).toBeTruthy();
      expect(screen.getAllByText(/synthetic data only/).length).toBeGreaterThan(
        0,
      );
    });

    it("shows the selected OpenAI-compatible route and its disclosure", async () => {
      await open();
      await select_provider("OpenAI-compatible BYOK");
      await ask("Synthetic question");
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "OpenAI-compatible BYOK" }),
        ).toBeTruthy(),
      );
      expect(screen.getByText(/sent to your configured service/)).toBeTruthy();
    });

    it("shows the selected Anthropic route and its disclosure", async () => {
      await open();
      await select_provider("Anthropic API-key BYOK");
      await ask("Synthetic question");
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Claude API-key BYOK" }),
        ).toBeTruthy(),
      );
      expect(
        screen.getByText(/sent directly to Anthropic's Messages API/),
      ).toBeTruthy();
    });

    it("removes the Anthropic credential without switching the selected route", async () => {
      await open();
      await tab("Settings");
      await fireEvent.press(
        screen.getByRole("button", { name: "Model and keys" }),
      );
      await fireEvent.press(
        screen.getByRole("radio", { name: "Anthropic API-key BYOK" }),
      );
      await fireEvent.changeText(
        screen.getByLabelText("Anthropic API key"),
        "fake-key",
      );
      await fireEvent.press(
        screen.getByRole("button", { name: "Save and use" }),
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Remove key" })).toBeTruthy(),
      );
      await fireEvent.press(screen.getByRole("button", { name: "Remove key" }));
      await waitFor(() =>
        expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
          ANTHROPIC_API_KEY_NAME,
        ),
      );
      expect(
        screen.getByRole("radio", { name: "Anthropic API-key BYOK" }).props
          .accessibilityState.checked,
      ).toBe(true);
    });

    it("never mutates the ledger when the provider fails", async () => {
      jest.mocked(create_mobile_qa_agent).mockImplementationOnce(
        () =>
          ({
            answerQuestion: jest.fn(async () => ({
              answered: false,
              stopReason: "provider_auth_failed",
              stepsUsed: 1,
              tokensUsed: 0,
              toolsUsed: [],
              answer: null,
            })),
          }) as unknown as ReturnType<typeof create_mobile_qa_agent>,
      );
      await open();
      await ask("Synthetic question");
      await waitFor(() => expect(screen.getByText(/KILO_AUTH/)).toBeTruthy());
      expect(getMemoryRows("transactions")).toHaveLength(0);
      expect(getMemoryRows("proposals")).toHaveLength(0);
    });

    it("passes a trusted current time and shows live read-only tool progress", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const chunk_times: number[] = [];
      jest.mocked(create_mobile_qa_agent).mockImplementationOnce(
        () =>
          ({
            answerQuestion: jest.fn(
              async (
                _question: string,
                options: {
                  currentTime?: string;
                  onToolEvent?: (event: {
                    tool: string;
                    state: "running" | "done";
                  }) => void | Promise<void>;
                  onValidatedChunk?: (chunk: string) => void | Promise<void>;
                },
              ) => {
                expect(options.currentTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
                await options.onToolEvent?.({
                  tool: "get_month_summary",
                  state: "running",
                });
                await gate;
                await options.onToolEvent?.({
                  tool: "get_month_summary",
                  state: "done",
                });
                await options.onValidatedChunk?.("Synthetic ");
                chunk_times.push(Date.now());
                await options.onValidatedChunk?.("safe answer.");
                chunk_times.push(Date.now());
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
          }) as unknown as ReturnType<typeof create_mobile_qa_agent>,
      );
      await open();
      await ask("Synthetic spending this month");
      await waitFor(() =>
        expect(screen.getByText("Reading local ledger…")).toBeTruthy(),
      );
      release();
      await waitFor(() =>
        expect(screen.getByText("Synthetic safe answer.")).toBeTruthy(),
      );
      expect(chunk_times[1] - chunk_times[0]).toBeGreaterThanOrEqual(10);
      expect(screen.getByText("Checked this month's totals")).toBeTruthy();
    });

    it("restores local chat history and passes a bounded recent context window", async () => {
      await open();
      await ask("Synthetic first question");
      await waitFor(() =>
        expect(screen.getByText("Synthetic safe answer.")).toBeTruthy(),
      );
      expect(await Storage.getItemAsync(CONVERSATIONS_KEY)).toContain(
        "Synthetic first question",
      );
      await screen.unmount();
      await open();
      expect(screen.getByText("Synthetic first question")).toBeTruthy();
      expect(screen.getByText("Synthetic safe answer.")).toBeTruthy();
      let seen_history: Array<{ role: string; content: string }> = [];
      jest.mocked(create_mobile_qa_agent).mockImplementationOnce(
        () =>
          ({
            answerQuestion: jest.fn(
              async (
                _question: string,
                options: {
                  history?: Array<{
                    role: "user" | "assistant";
                    content: string;
                  }>;
                  onValidatedChunk?: (chunk: string) => void | Promise<void>;
                },
              ) => {
                seen_history = options.history ?? [];
                await options.onValidatedChunk?.("Synthetic second answer.");
                return {
                  answered: true,
                  stopReason: "completed",
                  stepsUsed: 1,
                  tokensUsed: 5,
                  toolsUsed: [],
                  answer: "Synthetic second answer.",
                };
              },
            ),
          }) as unknown as ReturnType<typeof create_mobile_qa_agent>,
      );
      await fireEvent.changeText(
        screen.getByLabelText("Message"),
        "Synthetic second question",
      );
      await fireEvent.press(screen.getByRole("button", { name: "Send" }));
      await waitFor(() =>
        expect(screen.getByText("Synthetic second answer.")).toBeTruthy(),
      );
      expect(seen_history).toEqual([
        { role: "user", content: "Synthetic first question" },
        { role: "assistant", content: "Synthetic safe answer." },
      ]);
    });

    it("renders assistant Markdown (bold + bullets) instead of literal markers", async () => {
      const md = "**Summary**\n- no outstanding debts\n- 0 unverified entries";
      jest.mocked(create_mobile_qa_agent).mockImplementationOnce(
        () =>
          ({
            answerQuestion: jest.fn(
              async (
                _question: string,
                options: {
                  onValidatedChunk?: (chunk: string) => void | Promise<void>;
                },
              ) => {
                await options.onValidatedChunk?.(md);
                return {
                  answered: true,
                  stopReason: "completed",
                  stepsUsed: 1,
                  tokensUsed: 5,
                  toolsUsed: [],
                  answer: md,
                };
              },
            ),
          }) as unknown as ReturnType<typeof create_mobile_qa_agent>,
      );
      await open();
      await ask("Who owes me?");
      await waitFor(() =>
        expect(screen.getByText("no outstanding debts")).toBeTruthy(),
      );
      expect(screen.queryAllByText(/\*\*/)).toHaveLength(0);
      expect(screen.getAllByText("Summary").length).toBeGreaterThan(0);
      expect(screen.getByText("0 unverified entries")).toBeTruthy();
    });
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
