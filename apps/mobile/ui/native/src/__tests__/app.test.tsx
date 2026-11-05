import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import App from "../../App";

/**
 * These flows mirror the browser preview's Playwright spec, so the React Native
 * rebuild is held to the same behaviour, not just the same pixels.
 */
async function open() {
  await render(<App />);
}

async function tab(name: string) {
  await fireEvent.press(screen.getByRole("tab", { name }));
}

describe("Vittaz native shell", () => {
  it("opens on Home with the mock's summary and bottom navigation", async () => {
    await open();
    expect(screen.getByRole("header", { name: "Vittaz" })).toBeTruthy();
    expect(screen.getByText("Net spend this month")).toBeTruthy();
    expect(screen.getByText("₹8,750")).toBeTruthy();
    expect(screen.getByText("Pending review")).toBeTruthy();
    for (const name of ["Home", "Inbox", "Ledger", "People", "Settings"])
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Add or ask by message" }),
    ).toBeTruthy();
  });

  it("keeps the message entry flow: Home → Add or ask → Analyze → chat approval", async () => {
    await open();
    await fireEvent.press(
      screen.getByRole("button", { name: "Add or ask by message" }),
    );
    expect(screen.getByRole("header", { name: "Add or ask" })).toBeTruthy();
    await fireEvent.changeText(
      screen.getByLabelText("Transaction text"),
      "I spent 299 on Zomato",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Analyze" }));
    expect(
      screen.getByText(
        "I drafted this entry. Nothing is saved until you approve it.",
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(screen.getByText(/Approved\. The preview ledger/)).toBeTruthy(),
    );
  });

  it("answers a question with no amount instead of demanding one", async () => {
    await open();
    await fireEvent.press(
      screen.getByRole("button", { name: "Add or ask by message" }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("Transaction text"),
      "Who owes me?",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Analyze" }));
    await waitFor(
      () => expect(screen.getByText(/Owed to you: Aman ₹2,500/)).toBeTruthy(),
      { timeout: 3000 },
    );
    expect(screen.queryByText(/Include an amount/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("answers monthly spend from the same totals as Home", async () => {
    await open();
    await fireEvent.press(
      screen.getByRole("button", { name: "Add or ask by message" }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("Transaction text"),
      "monthly spend",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Analyze" }));
    await waitFor(
      () =>
        expect(screen.getByText(/This month you spent ₹8,750/)).toBeTruthy(),
      { timeout: 3000 },
    );
  });

  it("runs the chat suggestion chips as questions", async () => {
    await open();
    await fireEvent.press(
      screen.getByRole("button", { name: "Add or ask by message" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Analyze" }));
    // Empty text is the only thing that produces a toast on this screen.
    expect(screen.getByText(/Type a message or a question/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await fireEvent.press(
      screen.getByRole("button", { name: "Add or ask by message" }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("Transaction text"),
      "Who owes me?",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Analyze" }));
    await waitFor(() => expect(screen.getByText(/Owed to you/)).toBeTruthy(), {
      timeout: 3000,
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Pending review" }),
    );
    await waitFor(
      () => expect(screen.getByText(/entries need review/)).toBeTruthy(),
      { timeout: 3000 },
    );
  });

  it("filters and searches the ledger", async () => {
    await open();
    await tab("Ledger");
    expect(screen.getByRole("header", { name: "Ledger" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Cash" }));
    expect(screen.getByText("Tea stall")).toBeTruthy();
    expect(screen.queryByText("Reliance BP")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Search" }));
    await fireEvent.changeText(screen.getByLabelText("Search ledger"), "tea");
    expect(screen.getByText("Tea stall")).toBeTruthy();
    await fireEvent.changeText(
      screen.getByLabelText("Search ledger"),
      "Reliance",
    );
    expect(screen.getByText("No entries")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("Reliance BP")).toBeTruthy();
  });

  it("reviews a pending entry from the inbox", async () => {
    await open();
    await tab("Inbox");
    expect(screen.getByRole("header", { name: "Pending inbox" })).toBeTruthy();
    const select = screen.getAllByRole("button", { name: /^Select / })[0];
    await fireEvent.press(select);
    await fireEvent.press(
      screen.getByRole("button", { name: /^Review selected \(/ }),
    );
    expect(
      screen.getByRole("header", { name: "Review transaction" }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(
        screen.getByText("Approved in this synthetic preview."),
      ).toBeTruthy(),
    );
    expect(screen.getByRole("header", { name: "Pending inbox" })).toBeTruthy();
  });

  it("saves a manual entry as verified", async () => {
    await open();
    await tab("Ledger");
    await fireEvent.press(
      screen.getByRole("button", { name: "Add transaction" }),
    );
    await fireEvent.changeText(screen.getByLabelText("Amount"), "250");
    await fireEvent.press(
      screen.getByRole("button", { name: "Save transaction" }),
    );
    await waitFor(() => expect(screen.getByText("₹250")).toBeTruthy());
  });

  it("toggles safety settings and picks a model", async () => {
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
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("header", { name: "Pick how the AI runs" }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Finish setup" }));
    expect(screen.getByRole("header", { name: "Vittaz" })).toBeTruthy();
  });

  it("shows the People balances and the not-connected toasts", async () => {
    await open();
    await tab("People");
    expect(screen.getByText("Aman")).toBeTruthy();
    expect(screen.getByText("₹2,500")).toBeTruthy();
    expect(screen.getAllByText("Settled").length).toBeGreaterThan(0);
    await tab("Settings");
    await fireEvent.press(screen.getByRole("button", { name: "Telegram bot" }));
    expect(
      screen.getByText("Telegram pairing is not connected in this UI preview."),
    ).toBeTruthy();
  });
});
