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

beforeEach(() => {
  resetMemoryLedger();
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

  it("does not fabricate demo chat answers or pending proposals", async () => {
    await open();
    await fireEvent.press(
      screen.getByRole("button", { name: "Add or ask by message" }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("Transaction text"),
      "Who owes me?",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Analyze" }));
    expect(
      screen.getByText(/Assistant capture is not connected yet/),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await tab("Inbox");
    expect(screen.getByText("Inbox is clear")).toBeTruthy();
  });

  it("keeps local settings and model selection interactive", async () => {
    await open();
    await tab("Settings");
    const toggle = screen.getByRole("switch", { name: "Send notes to cloud" });
    expect(toggle.props.accessibilityState.checked).toBe(false);
    await fireEvent.press(toggle);
    expect(
      screen.getByRole("switch", { name: "Send notes to cloud" }).props
        .accessibilityState.checked,
    ).toBe(true);
    await fireEvent.press(
      screen.getByRole("button", { name: "Model and keys" }),
    );
    expect(screen.getByRole("header", { name: "Choose model" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Gemini" }));
    expect(
      screen.getByRole("radio", { name: "Gemini" }).props.accessibilityState
        .checked,
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
