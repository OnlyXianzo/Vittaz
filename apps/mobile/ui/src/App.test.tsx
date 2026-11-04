import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

afterEach(cleanup);

function renderApp() {
  render(<App />);
  const main = within(screen.getByRole("main"));
  const nav = within(screen.getByRole("navigation", { name: "Primary" }));
  const jump = (id: string) =>
    userEvent.setup().selectOptions(screen.getByLabelText("Screen"), id);
  const sheet = () => within(screen.getByRole("dialog"));
  return { main, nav, jump, sheet };
}

describe("chat-first preview", () => {
  it("opens straight into the assistant window with no bottom tab bar", () => {
    const { main, nav } = renderApp();
    expect(
      main.getByRole("heading", { name: "Vittaz AI", level: 1 }),
    ).toBeInTheDocument();
    expect(main.getByLabelText("Message")).toBeInTheDocument();
    expect(main.getByText("Send me anything")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    for (const label of ["Ledger", "Inbox", "People", "Settings"]) {
      expect(nav.getByRole("button", { name: new RegExp(label) })).toBeTruthy();
    }
  });

  it("sends a typed message to the assistant and shows the tool run", async () => {
    const user = userEvent.setup();
    const { main } = renderApp();
    await user.type(main.getByLabelText("Message"), "I spent 299 on Zomato");
    await user.click(main.getByRole("button", { name: "Send" }));
    expect(main.getByLabelText("Conversation")).toHaveTextContent(
      "I spent 299 on Zomato",
    );
    expect(main.getByText("privacy_scan")).toBeInTheDocument();
    expect(
      await main.findByText(/Nothing is saved until you approve it/),
    ).toBeInTheDocument();
    expect(main.getByText("propose_transaction")).toBeInTheDocument();
    expect(main.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("sends anything pasted into the composer straight to the assistant", async () => {
    const { main } = renderApp();
    const input = main.getByLabelText("Message");
    fireEvent.paste(input, {
      clipboardData: { getData: () => "I spent 450 on lunch with Aman" },
    });
    expect(main.getByLabelText("Conversation")).toHaveTextContent(
      "I spent 450 on lunch with Aman",
    );
    expect(
      await main.findByText(/Nothing is saved until you approve it/),
    ).toBeInTheDocument();
  });

  it("strips account numbers and phone numbers before the assistant reads them", async () => {
    const user = userEvent.setup();
    const { main } = renderApp();
    await user.click(main.getByRole("button", { name: "Add to chat" }));
    await user.click(main.getByRole("button", { name: "Bank SMS sample" }));
    const conversation = main.getByLabelText("Conversation");
    expect(conversation).toHaveTextContent("[account hidden]");
    expect(conversation).not.toHaveTextContent("50100234567890");
    expect(conversation).not.toHaveTextContent("18002586161");
    expect(
      main.getByText(/Hidden before sending: account number/),
    ).toBeInTheDocument();
    expect(
      await main.findByText(/Removed account number, phone number/),
    ).toBeInTheDocument();
  });

  it("opens the overview panel from the add menu", async () => {
    const user = userEvent.setup();
    const { main, sheet } = renderApp();
    await user.click(main.getByRole("button", { name: "Add to chat" }));
    await user.click(main.getByRole("button", { name: /Overview/ }));
    expect(sheet().getByText("Net spend this month")).toBeInTheDocument();
  });

  it("hides UPI IDs, emails and cards from an attached screenshot", async () => {
    const user = userEvent.setup();
    const { main } = renderApp();
    await user.click(main.getByRole("button", { name: "Add to chat" }));
    await user.click(main.getByRole("button", { name: "Screenshot sample" }));
    const conversation = main.getByLabelText("Conversation");
    expect(conversation).toHaveTextContent("[UPI ID hidden]");
    expect(conversation).toHaveTextContent("[email hidden]");
    expect(conversation).toHaveTextContent("[card hidden]");
    expect(conversation).not.toHaveTextContent("aman@okhdfcbank");
    expect(conversation).not.toHaveTextContent("4111");
  });

  it("runs a mock Telegram tool and shows the message it would send", async () => {
    const user = userEvent.setup();
    const { main } = renderApp();
    await user.click(
      main.getByRole("button", { name: "Send my summary to Telegram" }),
    );
    expect(
      await main.findByText("telegram_send_message", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(await main.findByText("Mock delivery")).toBeInTheDocument();
    expect(main.getByText(/Vittaz daily summary \(mock\)/)).toBeInTheDocument();
    expect(
      main.getByText(
        /Nothing was sent\. Pairing a real bot is a backend feature\./,
      ),
    ).toBeInTheDocument();
  });

  it("answers a ledger question from the synthetic data", async () => {
    const user = userEvent.setup();
    const { main } = renderApp();
    await user.type(
      main.getByLabelText("Message"),
      "How much did I spend on food?",
    );
    await user.click(main.getByRole("button", { name: "Send" }));
    expect(
      main.getByText(/Demo tool run\. No cloud model or Telegram request/),
    ).toBeInTheDocument();
    expect(await main.findByText(/confirmed spending is/)).toBeInTheDocument();
    expect(main.getByText("sum_by_category")).toBeInTheDocument();
  });

  it("approves a drafted entry from the chat window", async () => {
    const user = userEvent.setup();
    const { main, jump } = renderApp();
    await jump("chat-approval");
    await user.click(main.getByRole("button", { name: "Approve" }));
    expect(main.getByText(/Approved\. The preview ledger/)).toBeInTheDocument();
  });

  it("opens other screens as panels over the chat and closes them again", async () => {
    const user = userEvent.setup();
    const { main, nav, sheet } = renderApp();
    await user.click(nav.getByRole("button", { name: "Ledger" }));
    expect(
      sheet().getByRole("heading", { name: "Ledger", level: 1 }),
    ).toBeInTheDocument();
    expect(
      main.getByRole("heading", { name: "Vittaz AI", level: 1 }),
    ).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Close panel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("adds a manual transaction from a panel and shows it in the ledger", async () => {
    const user = userEvent.setup();
    const { nav, sheet } = renderApp();
    await user.click(nav.getByRole("button", { name: "Ledger" }));
    await user.click(sheet().getByRole("button", { name: "Add transaction" }));
    const amount = sheet().getByLabelText("Amount");
    await user.clear(amount);
    await user.type(amount, "123.45");
    await user.click(sheet().getByRole("button", { name: "Save transaction" }));
    expect(sheet().getByText("₹123.45")).toBeInTheDocument();
  });

  it("approves and rejects pending entries from the review panel", async () => {
    const user = userEvent.setup();
    const { jump, sheet } = renderApp();
    await jump("inbox");
    await user.click(sheet().getAllByRole("button", { name: "Review" })[0]);
    await user.click(sheet().getByRole("button", { name: "Approve" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await jump("inbox");
    expect(sheet().getByText("All 2")).toBeInTheDocument();
    await user.click(sheet().getAllByRole("button", { name: "Review" })[0]);
    await user.click(sheet().getByRole("button", { name: "Reject" }));
    await jump("inbox");
    expect(sheet().getByText("All 1")).toBeInTheDocument();
  });

  it("keeps ask-before-saving locked on", async () => {
    const user = userEvent.setup();
    const { nav, sheet } = renderApp();
    await user.click(nav.getByRole("button", { name: "Settings" }));
    const toggle = sheet().getByRole("switch", { name: "Ask before saving" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("walks through onboarding and lands back in the chat", async () => {
    const user = userEvent.setup();
    const { main, jump, sheet } = renderApp();
    await jump("onboarding-welcome");
    expect(sheet().getByText(/welcome to Vittaz/)).toBeInTheDocument();
    await user.click(sheet().getByRole("button", { name: "Get started" }));
    await user.click(sheet().getByRole("button", { name: "Continue" }));
    await user.click(sheet().getByRole("button", { name: "Finish setup" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      main.getByRole("heading", { name: "Vittaz AI", level: 1 }),
    ).toBeInTheDocument();
  });

  it("renders every preview state without crashing", async () => {
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

describe("chat accessibility", () => {
  it("moves focus to the panel heading and back to the chat heading", async () => {
    const user = userEvent.setup();
    const { main, nav, sheet } = renderApp();
    await user.click(nav.getByRole("button", { name: "Ledger" }));
    expect(sheet().getByRole("heading", { name: "Ledger" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(
      main.getByRole("heading", { name: "Vittaz AI", level: 1 }),
    ).toHaveFocus();
  });

  it("does not close the panel when Escape is pressed inside a field", async () => {
    const user = userEvent.setup();
    const { jump, sheet } = renderApp();
    await jump("add");
    const amount = sheet().getByLabelText("Amount");
    await user.click(amount);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(amount).toHaveFocus();
  });

  it("announces the conversation as a live log", () => {
    const { main } = renderApp();
    const log = main.getByLabelText("Conversation");
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(log).toHaveAttribute("role", "log");
  });
});
