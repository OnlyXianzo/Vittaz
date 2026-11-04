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
    nav: within(screen.getByRole("navigation", { name: "Primary" })),
    jump: (id: string) =>
      userEvent.setup().selectOptions(screen.getByLabelText("Screen"), id),
  };
}

describe("preview interactions", () => {
  it("home header and cards navigate", async () => {
    const { user, main } = setup();
    await user.click(main.getAllByRole("button", { name: "Settings" })[0]);
    expect(main.getByText("AI")).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Home" }));
    await user.click(main.getByRole("button", { name: "Notifications" }));
    expect(main.getByText("Pending inbox")).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Back" }));
    await user.click(main.getByRole("button", { name: /Pending review/ }));
    expect(main.getByText("Pending inbox")).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Back" }));
    await user.click(main.getByText("See all"));
    expect(main.getByText("This month")).toBeInTheDocument();
  });

  it("inbox filters and selection work", async () => {
    const { user, main, jump } = setup();
    await jump("inbox");
    await user.click(main.getByRole("button", { name: /UPI 2/ }));
    expect(main.queryByText("HDFC Bank")).not.toBeInTheDocument();
    await user.click(main.getByRole("button", { name: /SMS 1/ }));
    expect(main.getByText("HDFC Bank")).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Filter" }));
    expect(main.getByText("Zomato")).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Select Zomato" }));
    await user.click(main.getByRole("button", { name: /Review selected/ }));
    expect(main.getByText("Review transaction")).toBeInTheDocument();
  });

  it("add screen chips and fields update the draft", async () => {
    const { user, main, jump } = setup();
    await jump("add");
    await user.click(main.getByRole("button", { name: "Received" }));
    await user.click(main.getByRole("button", { name: "Travel" }));
    const person = main.getByLabelText("Person");
    await user.clear(person);
    await user.type(person, "Priya");
    expect(person).toHaveValue("Priya");
    await user.selectOptions(main.getByLabelText("Mode"), "Cash");
    await user.click(main.getByRole("button", { name: /Improve note/ }));
    await user.click(main.getByRole("button", { name: "Keep mine" }));
    expect(main.queryByText("Improved note")).not.toBeInTheDocument();
  });

  it("chat header, suggestions and voice respond", async () => {
    const { user, main, jump } = setup();
    await jump("chat");
    await user.click(main.getByRole("button", { name: /Auto, Qwen/ }));
    expect(main.getByText("Choose model")).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Back" }));
    await user.click(main.getByRole("button", { name: "Voice input" }));
    expect(main.getByText(/Voice input is not connected/)).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Show unverified" }));
    expect(main.getByText("Pending inbox")).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Back" }));
    await user.click(main.getByRole("button", { name: "Who owes me?" }));
    expect(
      main.getByText("Receivables and payables in this synthetic preview."),
    ).toBeInTheDocument();
  });

  it("chat approval edit and reject work", async () => {
    const { user, main, jump } = setup();
    await jump("chat-approval");
    await user.click(main.getByRole("button", { name: "Edit" }));
    expect(main.getByText("Review transaction")).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Back" }));
    await user.click(main.getByRole("button", { name: "Reject" }));
    expect(main.getAllByText(/Rejected/).length).toBeGreaterThan(0);
  });

  it("models screen buttons respond", async () => {
    const { user, main, jump } = setup();
    await jump("models");
    await user.click(main.getByRole("button", { name: /^Auto/ }));
    await user.click(main.getByRole("button", { name: /Qwen 1.5B/ }));
    await user.click(main.getByRole("button", { name: /Free tier models/ }));
    await user.click(main.getByRole("button", { name: "Download" }));
    expect(
      main.getByText(/Model downloads are not connected/),
    ).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: /Add API key/ }));
    expect(main.getByText(/Key storage is not connected/)).toBeInTheDocument();
  });

  it("settings rows respond", async () => {
    const { user, main, jump } = setup();
    await jump("settings");
    await user.click(main.getByRole("button", { name: /Model and keys/ }));
    expect(main.getByText("Choose model")).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Back" }));
    await user.click(main.getByRole("button", { name: /Telegram bot/ }));
    expect(
      main.getByText(/Telegram pairing is not connected/),
    ).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: /Review digest/ }));
    expect(main.getByText("Once a day")).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: /Backups and restore/ }));
    expect(
      main.getByText(/Backup and restore are backend features/),
    ).toBeInTheDocument();
    await user.click(
      main.getByRole("button", { name: /Export data and logs/ }),
    );
    expect(main.getByText(/Export is not connected/)).toBeInTheDocument();
    await user.click(main.getByRole("switch", { name: "Replace names" }));
    expect(main.getByRole("switch", { name: "Replace names" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("onboarding skip and demo buttons respond", async () => {
    const { user, main, jump } = setup();
    await jump("onboarding-welcome");
    await user.click(
      main.getByRole("button", { name: /Already have a backup/ }),
    );
    expect(main.getByText(/Restore is not connected/)).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: "Get started" }));
    await user.click(main.getByRole("button", { name: "Skip" }));
    expect(main.getByText("Pending review")).toBeInTheDocument();
    await jump("onboarding-ai");
    await user.click(main.getByRole("button", { name: /Download model/ }));
    expect(
      main.getByText(/Model downloads are not connected/),
    ).toBeInTheDocument();
    await user.click(main.getByRole("button", { name: /Skip for now/ }));
    expect(main.getByText("Pending review")).toBeInTheDocument();
  });

  it("quick screen see all navigates", async () => {
    const { user, main, jump } = setup();
    await jump("quick");
    await user.click(main.getByText("See all"));
    expect(main.getByText("Pending inbox")).toBeInTheDocument();
  });

  it("review empty state is reachable after handling all entries", async () => {
    const { user, main, jump } = setup();
    for (let i = 0; i < 3; i += 1) {
      await jump("review");
      await user.click(main.getByRole("button", { name: "Approve" }));
    }
    await jump("review");
    expect(main.getByText("Nothing to review")).toBeInTheDocument();
  });

  it("toast can be dismissed", async () => {
    const { user, main, jump } = setup();
    await jump("settings");
    await user.click(main.getByRole("button", { name: /Telegram bot/ }));
    await user.click(main.getByRole("button", { name: "Dismiss" }));
    expect(main.queryByRole("status")).not.toBeInTheDocument();
  });
});
