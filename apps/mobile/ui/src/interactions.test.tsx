import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

afterEach(cleanup);

function setup() {
  render(<App />);
  return {
    user: userEvent.setup(),
    main: within(screen.getByRole("main")),
    mainQuery: () => within(screen.getByRole("main")),
    nav: within(screen.getByRole("navigation", { name: "Primary" })),
    sheet: () => within(screen.getByRole("dialog")),
    jump: (id: string) =>
      userEvent.setup().selectOptions(screen.getByLabelText("Screen"), id),
  };
}

describe("preview interactions", () => {
  it("overview panel header and cards navigate", async () => {
    const { user, jump, sheet } = setup();
    await jump("home");
    await user.click(sheet().getAllByRole("button", { name: "Settings" })[0]);
    expect(sheet().getByText("AI")).toBeInTheDocument();
    await user.click(sheet().getByRole("button", { name: "Back" }));
    await jump("home");
    await user.click(sheet().getByRole("button", { name: "Notifications" }));
    expect(sheet().getByText("Pending inbox")).toBeInTheDocument();
    await user.click(sheet().getByRole("button", { name: "Back" }));
    await jump("home");
    await user.click(sheet().getByRole("button", { name: /Pending review/ }));
    expect(sheet().getByText("Pending inbox")).toBeInTheDocument();
    await user.click(sheet().getByRole("button", { name: "Back" }));
    await jump("home");
    await user.click(sheet().getByText("See all"));
    expect(sheet().getByText("This month")).toBeInTheDocument();
  });

  it("inbox filters and selection work", async () => {
    const { user, jump, sheet } = setup();
    await jump("inbox");
    await user.click(sheet().getByRole("button", { name: /UPI 2/ }));
    expect(sheet().queryByText("HDFC Bank")).not.toBeInTheDocument();
    await user.click(sheet().getByRole("button", { name: /SMS 1/ }));
    expect(sheet().getByText("HDFC Bank")).toBeInTheDocument();
    await user.click(sheet().getByRole("button", { name: "Filter" }));
    expect(sheet().getByText("Zomato")).toBeInTheDocument();
    await user.click(sheet().getByRole("button", { name: "Select Zomato" }));
    await user.click(sheet().getByRole("button", { name: /Review selected/ }));
    expect(sheet().getByText("Review transaction")).toBeInTheDocument();
  });

  it("add panel chips and fields update the draft", async () => {
    const { user, jump, sheet } = setup();
    await jump("add");
    await user.click(sheet().getByRole("button", { name: "Received" }));
    await user.click(sheet().getByRole("button", { name: "Travel" }));
    const person = sheet().getByLabelText("Person");
    await user.clear(person);
    await user.type(person, "Priya");
    expect(person).toHaveValue("Priya");
    await user.selectOptions(sheet().getByLabelText("Mode"), "Cash");
    await user.click(sheet().getByRole("button", { name: /Improve note/ }));
    await user.click(sheet().getByRole("button", { name: "Keep mine" }));
    expect(sheet().queryByText("Improved note")).not.toBeInTheDocument();
  });

  it("chat model pill, voice button and suggestions respond", async () => {
    const { user, main, sheet } = setup();
    await user.click(main.getByRole("button", { name: /Auto, Qwen/ }));
    expect(sheet().getByText("Choose model")).toBeInTheDocument();
    await user.click(sheet().getByRole("button", { name: "Back" }));
    await user.click(main.getByRole("button", { name: "Voice input" }));
    expect(main.getByText(/Voice input is not connected/)).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Who owes me?" }));
    expect(await main.findByText(/owes you/)).toBeInTheDocument();
  });

  it("chat approval edit and reject work", async () => {
    const { user, main, jump, sheet } = setup();
    await jump("chat-approval");
    await user.click(main.getByRole("button", { name: "Edit" }));
    expect(sheet().getByText("Review transaction")).toBeInTheDocument();
    await user.click(sheet().getByRole("button", { name: "Back" }));
    await user.click(main.getByRole("button", { name: "Reject" }));
    expect(main.getAllByText(/Rejected/).length).toBeGreaterThan(0);
  });

  it("models panel buttons respond", async () => {
    const { user, jump, sheet, mainQuery: main } = setup();
    await jump("models");
    await user.click(sheet().getByRole("button", { name: /^Auto/ }));
    await user.click(sheet().getByRole("button", { name: /Qwen 1.5B/ }));
    await user.click(sheet().getByRole("button", { name: /Free tier models/ }));
    await user.click(sheet().getByRole("button", { name: "Download" }));
    expect(
      main().getByText(/Model downloads are not connected/),
    ).toBeInTheDocument();
    await user.click(sheet().getByRole("button", { name: /Add API key/ }));
    expect(
      main().getByText(/Key storage is not connected/),
    ).toBeInTheDocument();
  });

  it("settings rows respond", async () => {
    const { user, jump, sheet, mainQuery: main } = setup();
    await jump("settings");
    await user.click(sheet().getByRole("button", { name: /Model and keys/ }));
    expect(sheet().getByText("Choose model")).toBeInTheDocument();
    await user.click(sheet().getByRole("button", { name: "Back" }));
    await jump("settings");
    await user.click(sheet().getByRole("button", { name: /Telegram bot/ }));
    expect(
      main().getByText(/Telegram pairing is not connected/),
    ).toBeInTheDocument();
    await user.click(sheet().getByRole("button", { name: /Review digest/ }));
    expect(sheet().getByText("Once a day")).toBeInTheDocument();
    await user.click(
      sheet().getByRole("button", { name: /Backups and restore/ }),
    );
    expect(
      main().getByText(/Backup and restore are backend features/),
    ).toBeInTheDocument();
    await user.click(
      sheet().getByRole("button", { name: /Export data and logs/ }),
    );
    expect(main().getByText(/Export is not connected/)).toBeInTheDocument();
    await user.click(sheet().getByRole("switch", { name: "Replace names" }));
    expect(
      sheet().getByRole("switch", { name: "Replace names" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("onboarding skip and demo buttons respond", async () => {
    const { user, main, jump, sheet, mainQuery: mainLive } = setup();
    await jump("onboarding-welcome");
    await user.click(
      sheet().getByRole("button", { name: /Already have a backup/ }),
    );
    expect(
      mainLive().getByText(/Restore is not connected/),
    ).toBeInTheDocument();
    await user.click(sheet().getByRole("button", { name: "Get started" }));
    await user.click(sheet().getByRole("button", { name: "Skip" }));
    expect(
      main.getByRole("heading", { name: "Vittaz AI", level: 1 }),
    ).toBeInTheDocument();
    await jump("onboarding-ai");
    await user.click(sheet().getByRole("button", { name: /Download model/ }));
    expect(
      mainLive().getByText(/Model downloads are not connected/),
    ).toBeInTheDocument();
    await user.click(sheet().getByRole("button", { name: /Skip for now/ }));
    expect(
      main.getByRole("heading", { name: "Vittaz AI", level: 1 }),
    ).toBeInTheDocument();
  });

  it("paste panel sends the message to the assistant", async () => {
    const { user, main, jump, sheet } = setup();
    await jump("quick");
    await user.type(
      sheet().getByLabelText("Message text"),
      "I spent 299 on Zomato",
    );
    await user.click(
      sheet().getByRole("button", { name: "Send to assistant" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      await main.findByText(/Nothing is saved until you approve it/),
    ).toBeInTheDocument();
  });

  it("paste panel see all opens the inbox", async () => {
    const { user, jump, sheet } = setup();
    await jump("quick");
    await user.click(sheet().getByText("See all"));
    expect(sheet().getByText("Pending inbox")).toBeInTheDocument();
  });

  it("review empty state is reachable after handling all entries", async () => {
    const { user, jump, sheet } = setup();
    for (let i = 0; i < 3; i += 1) {
      await jump("review");
      await user.click(sheet().getByRole("button", { name: "Approve" }));
    }
    await jump("review");
    expect(sheet().getByText("Nothing to review")).toBeInTheDocument();
  });

  it("toast can be dismissed", async () => {
    const { user, main, jump, sheet } = setup();
    await jump("settings");
    await user.click(sheet().getByRole("button", { name: /Telegram bot/ }));
    await user.click(main.getByRole("button", { name: "Dismiss" }));
    expect(main.queryByRole("status")).not.toBeInTheDocument();
  });
});
