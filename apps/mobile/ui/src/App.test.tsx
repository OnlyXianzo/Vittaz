import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

afterEach(cleanup);

function renderApp() {
  render(<App />);
  const main = within(screen.getByRole("main"));
  const nav = within(screen.getByRole("navigation", { name: "Primary" }));
  const jump = (id: string) =>
    userEvent.setup().selectOptions(screen.getByLabelText("Screen"), id);
  return { main, nav, jump };
}

describe("App preview", () => {
  it("renders the home screen and navigates with bottom nav", async () => {
    const user = userEvent.setup();
    const { main, nav } = renderApp();
    expect(main.getByText("Vittaz")).toBeInTheDocument();
    expect(main.getByText("Pending review")).toBeInTheDocument();
    await user.click(nav.getByRole("button", { name: "Ledger" }));
    expect(main.getByText("This month")).toBeInTheDocument();
    await user.click(nav.getByRole("button", { name: "People" }));
    expect(
      main.getByText("Receivables and payables in this synthetic preview."),
    ).toBeInTheDocument();
  });

  it("approves a pending entry from the inbox", async () => {
    const user = userEvent.setup();
    const { main, nav } = renderApp();
    await user.click(nav.getByRole("button", { name: /Inbox/ }));
    await user.click(main.getAllByRole("button", { name: "Review" })[0]);
    expect(main.getByText("Review transaction")).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Approve" }));
    expect(main.getByText("Pending inbox")).toBeInTheDocument();
    expect(main.getByText("All 2")).toBeInTheDocument();
  });

  it("rejects a pending entry from review", async () => {
    const user = userEvent.setup();
    const { main, jump } = renderApp();
    await jump("review");
    await user.click(main.getByRole("button", { name: "Reject" }));
    expect(main.getByText("Pending inbox")).toBeInTheDocument();
    expect(main.getByText("All 2")).toBeInTheDocument();
  });

  it("adds a manual transaction and shows it in the ledger", async () => {
    const user = userEvent.setup();
    const { main, nav } = renderApp();
    await user.click(nav.getByRole("button", { name: "Ledger" }));
    await user.click(main.getByRole("button", { name: "Add transaction" }));
    const amount = main.getByLabelText("Amount");
    await user.clear(amount);
    await user.type(amount, "123.45");
    await user.click(main.getByRole("button", { name: "Save transaction" }));
    expect(main.getByText("This month")).toBeInTheDocument();
    expect(main.getByText("₹123.45")).toBeInTheDocument();
  });

  it("improves and keeps a note", async () => {
    const user = userEvent.setup();
    const { main, jump } = renderApp();
    await jump("add");
    await user.click(main.getByRole("button", { name: /Improve note/ }));
    expect(main.getByText("Improved note")).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Use this" }));
    expect((main.getByLabelText("Note") as HTMLTextAreaElement).value).toMatch(
      /They owe me/,
    );
  });

  it("runs quick ingestion into a chat approval", async () => {
    const user = userEvent.setup();
    const { main } = renderApp();
    await user.click(
      main.getByRole("button", { name: /Add or ask by message/ }),
    );
    await user.type(
      main.getByLabelText("Transaction text"),
      "I spent 299 on Zomato",
    );
    await user.click(main.getByRole("button", { name: "Analyze" }));
    expect(main.getByText("Assistant")).toBeInTheDocument();
    expect(
      main.getByText(
        "I drafted this entry. Nothing is saved until you approve it.",
      ),
    ).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Approve" }));
    expect(main.getByText(/Approved\. The preview ledger/)).toBeInTheDocument();
  });

  it("runs a chat question through deterministic demo steps", async () => {
    const user = userEvent.setup();
    const { main, jump } = renderApp();
    await jump("chat");
    await user.type(
      main.getByLabelText("Message"),
      "How much did I spend on food?",
    );
    await user.click(main.getByRole("button", { name: "Send" }));
    expect(
      main.getByText("Demo steps only. No cloud model is called."),
    ).toBeInTheDocument();
    expect(await main.findByText(/Food comes to/)).toBeInTheDocument();
  });

  it("filters and searches the ledger", async () => {
    const user = userEvent.setup();
    const { main, nav } = renderApp();
    await user.click(nav.getByRole("button", { name: "Ledger" }));
    await user.click(main.getByRole("button", { name: "Cash" }));
    expect(main.getByText("Tea stall")).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Search" }));
    await user.type(main.getByLabelText("Search ledger"), "amazon");
    expect(main.getByText("No entries")).toBeInTheDocument();
  });

  it("keeps ask-before-saving enabled and toggles other settings", async () => {
    const user = userEvent.setup();
    const { main, nav } = renderApp();
    await user.click(nav.getByRole("button", { name: "Settings" }));
    const toggle = main.getByRole("switch", { name: "Ask before saving" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(main.getByText(/always requires approval/)).toBeInTheDocument();
    const notes = main.getByRole("switch", { name: "Send notes to cloud" });
    await user.click(notes);
    expect(notes).toHaveAttribute("aria-checked", "true");
  });

  it("selects a model preference", async () => {
    const user = userEvent.setup();
    const { main, jump } = renderApp();
    await jump("models");
    await user.click(main.getByRole("button", { name: /Claude/ }));
    expect(
      main.getByText(/Model preference set to claude/),
    ).toBeInTheDocument();
  });

  it("walks through onboarding", async () => {
    const user = userEvent.setup();
    const { main, jump } = renderApp();
    await jump("onboarding-welcome");
    expect(main.getByText(/welcome to Vittaz/)).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Get started" }));
    expect(main.getByText("How entries get in")).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Continue" }));
    expect(main.getByText("Pick how the AI runs")).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Finish setup" }));
    expect(main.getByText("Pending review")).toBeInTheDocument();
  });

  it("renders every preview screen without crashing", async () => {
    const user = userEvent.setup();
    render(<App />);
    const select = screen.getByLabelText("Screen");
    const options = Array.from(select.querySelectorAll("option")).map(
      (o) => o.value,
    );
    for (const option of options) {
      await user.selectOptions(select, option);
      expect(screen.getByRole("main").querySelector(".device")).toBeTruthy();
    }
  });
});

describe("preview accessibility", () => {
  it("exposes a level-one heading for the current screen", async () => {
    const user = userEvent.setup();
    const { main, nav } = renderApp();
    expect(
      main.getByRole("heading", { name: "Vittaz", level: 1 }),
    ).toBeInTheDocument();
    await user.click(nav.getByRole("button", { name: "Ledger" }));
    expect(
      main.getByRole("heading", { name: "Ledger", level: 1 }),
    ).toBeInTheDocument();
  });

  it("moves focus to the screen heading after navigation", async () => {
    const user = userEvent.setup();
    const { main, nav } = renderApp();
    await user.click(nav.getByRole("button", { name: "Ledger" }));
    expect(
      main.getByRole("heading", { name: "Ledger", level: 1 }),
    ).toHaveFocus();
  });

  it("returns to the previous screen with Escape", async () => {
    const user = userEvent.setup();
    const { main, nav } = renderApp();
    await user.click(nav.getByRole("button", { name: "Ledger" }));
    await user.keyboard("{Escape}");
    expect(
      main.getByRole("heading", { name: "Vittaz", level: 1 }),
    ).toBeInTheDocument();
  });
});

describe("preview accessibility edge cases", () => {
  it("does not navigate away when Escape is pressed inside a form field", async () => {
    const user = userEvent.setup();
    const { main, nav } = renderApp();
    await user.click(nav.getByRole("button", { name: "Ledger" }));
    await user.click(main.getByRole("button", { name: "Add transaction" }));
    const amount = main.getByLabelText(/Amount/);
    await user.click(amount);
    await user.keyboard("{Escape}");
    expect(
      main.getByRole("heading", { name: "Add transaction", level: 1 }),
    ).toBeInTheDocument();
    expect(amount).toHaveFocus();
  });
});
