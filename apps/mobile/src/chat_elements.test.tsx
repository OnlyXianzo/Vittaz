import { beforeEach, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { MessageActions, ReasoningBlock, ThinkingDots } from "./chat_elements";
import type { ChatStep } from "./domain";

const steps: ChatStep[] = [
  {
    label: "Checked a ledger contact",
    tool: "find_person",
    detail: "Read-only contact lookup",
    state: "done",
  },
  {
    label: "Read recent transactions",
    tool: "query_transactions",
    detail: "Read-only transaction query",
    state: "done",
  },
];

beforeEach(() => {
  jest.clearAllMocks();
});

it("reasoning_block_starts_expanded_so_lookups_are_visible_and_can_collapse", async () => {
  await render(<ReasoningBlock steps={steps} running={false} />);

  // The lookups are a trust signal: visible without any interaction.
  expect(screen.getByText("2 ledger lookups")).toBeTruthy();
  expect(screen.getByText("Checked a ledger contact")).toBeTruthy();
  expect(screen.getByText("find_person")).toBeTruthy();

  await fireEvent.press(
    screen.getByRole("button", { name: "Hide 2 ledger lookups" }),
  );
  expect(screen.queryByText("Checked a ledger contact")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Show 2 ledger lookups" }),
  ).toBeTruthy();

  await fireEvent.press(
    screen.getByRole("button", { name: "Show 2 ledger lookups" }),
  );
  expect(screen.getByText("Checked a ledger contact")).toBeTruthy();
});

it("reasoning_block_says_what_is_happening_while_it_runs", async () => {
  await render(<ReasoningBlock steps={steps} running />);
  expect(screen.getByText("Reading your ledger")).toBeTruthy();
});

it("reasoning_block_uses_the_singular_summary_for_one_lookup", async () => {
  await render(<ReasoningBlock steps={[steps[0]!]} running={false} />);
  expect(screen.getByText("1 ledger lookup")).toBeTruthy();
});

it("reasoning_block_renders_nothing_without_steps", async () => {
  await render(<ReasoningBlock steps={[]} running={false} />);
  expect(screen.queryByText("0 ledger lookups")).toBeNull();
});

it("message_actions_copies_the_answer_and_says_so", async () => {
  await render(<MessageActions text="Two people owe you money." />);
  await fireEvent.press(screen.getByRole("button", { name: "Copy answer" }));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
    "Two people owe you money.",
  );
  expect(
    await screen.findByRole("button", { name: "Answer copied" }),
  ).toBeTruthy();
});

it("thinking_dots_show_the_provider_label", async () => {
  await render(<ThinkingDots label="Asking Anthropic Claude…" />);
  expect(screen.getByText("Asking Anthropic Claude…")).toBeTruthy();
});
