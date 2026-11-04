import { describe, expect, it } from "vitest";
import { createInitialState, reducer } from "./state";

describe("UI preview reducer edge cases", () => {
  it("back closes the panel and returns to the chat window", () => {
    let state = createInitialState();
    state = reducer(state, { type: "navigate", screen: "ledger" });
    state = reducer(state, { type: "back" });
    expect(state.screen).toBe("chat");
  });

  it("toggle search opens and clears on close", () => {
    let state = createInitialState();
    state = reducer(state, { type: "toggle_search" });
    state = reducer(state, { type: "set_ledger_search", value: "tea" });
    expect(state.searchOpen).toBe(true);
    state = reducer(state, { type: "toggle_search" });
    expect(state.searchOpen).toBe(false);
    expect(state.ledgerSearch).toBe("");
  });

  it("review_selected with no selection shows a toast", () => {
    const state = { ...createInitialState(), selectedInboxIds: [] };
    const next = reducer(state, { type: "review_selected" });
    expect(next.toast).toMatch(/Select at least one/);
  });

  it("approve and reject ignore confirmed entries", () => {
    const state = createInitialState();
    const confirmed = state.transactions.find(
      (t) => t.status === "user_confirmed",
    )!;
    expect(reducer(state, { type: "approve", id: confirmed.id })).toBe(state);
    expect(reducer(state, { type: "reject", id: confirmed.id })).toBe(state);
  });

  it("chat empty input shows a toast", () => {
    const next = reducer(createInitialState(), { type: "send_chat" });
    expect(next.toast).toMatch(/Type or paste a message/);
  });

  it("quick analyze without amount shows a toast", () => {
    const next = reducer(createInitialState(), { type: "analyze_quick" });
    expect(next.toast).toMatch(/Paste or type a message/);
  });

  it("quick analyze detects received, recharge and fuel categories", () => {
    let state = createInitialState();
    state = reducer(state, {
      type: "set_quick_input",
      value: "received 500 for mobile recharge",
    });
    state = reducer(state, { type: "analyze_quick" });
    let proposal = state.transactions.find(
      (t) => t.id === state.chatProposalId,
    )!;
    expect(proposal.direction).toBe("received");
    expect(proposal.category).toBe("Recharge");
    state = reducer(state, {
      type: "set_quick_input",
      value: "spent 800 on petrol",
    });
    state = reducer(state, { type: "analyze_quick" });
    proposal = state.transactions.find((t) => t.id === state.chatProposalId)!;
    expect(proposal.category).toBe("Fuel");
  });

  it("improve note without half cleans whitespace", () => {
    let state = createInitialState();
    state = reducer(state, {
      type: "update_draft",
      patch: { note: "  coffee   with team  " },
    });
    state = reducer(state, { type: "improve_note" });
    expect(state.improvedNote).toBe("Coffee with team");
    state = reducer(state, { type: "keep_note" });
    expect(state.improvedNote).toBeNull();
  });

  it("use improved note without a suggestion is a no-op", () => {
    const state = createInitialState();
    expect(reducer(state, { type: "use_improved_note" })).toBe(state);
  });

  it("model, digest and toast actions update state", () => {
    let state = createInitialState();
    state = reducer(state, { type: "select_model", model: "claude" });
    expect(state.model).toBe("claude");
    state = reducer(state, { type: "set_review_digest", value: "once" });
    expect(state.settings.reviewDigest).toBe("once");
    state = reducer(state, { type: "show_toast", message: "hello" });
    expect(state.toast).toBe("hello");
    state = reducer(state, { type: "clear_toast" });
    expect(state.toast).toBeNull();
  });

  it("toggle replace names setting", () => {
    const state = createInitialState();
    const next = reducer(state, {
      type: "toggle_setting",
      key: "replaceNames",
    });
    expect(next.settings.replaceNames).toBe(false);
  });

  it("reads a grouped bank-alert amount instead of the first digit", () => {
    let state = reducer(createInitialState(), {
      type: "attach_mock",
      kind: "sms",
    });
    state = reducer(state, { type: "finish_chat_thinking" });
    const proposal = state.transactions.find(
      (t) => t.id === state.chatProposalId,
    );
    expect(proposal?.amountPaise).toBe(250000);
    expect(proposal?.title).toBe("HDFC Bank");
    expect(proposal?.note).not.toContain("50100234567890");
  });

  it("advance_chat is a no-op when the assistant is idle", () => {
    const state = createInitialState();
    expect(reducer(state, { type: "advance_chat" })).toBe(state);
  });

  it("walks the tool run one call at a time", () => {
    let state = reducer(createInitialState(), {
      type: "send_chat_text",
      text: "Send my summary to Telegram",
    });
    expect(state.chatSteps[0].state).toBe("done");
    expect(state.chatSteps[1].state).toBe("running");
    expect(state.chatSteps[2].state).toBe("queued");
    state = reducer(state, { type: "advance_chat" });
    expect(state.chatSteps[1].state).toBe("done");
    expect(state.chatSteps[2].state).toBe("running");
    state = reducer(state, { type: "advance_chat" });
    expect(state.chatMode).toBe("idle");
    expect(state.chatTelegramPreview).toContain("Vittaz daily summary");
    expect(state.chatMessages.at(-1)?.variant).toBe("telegram");
  });

  it("clear_chat empties the conversation without touching the ledger", () => {
    let state = reducer(createInitialState(), {
      type: "send_chat_text",
      text: "I spent 299 on Zomato",
    });
    state = reducer(state, { type: "finish_chat_thinking" });
    const count = state.transactions.length;
    state = reducer(state, { type: "clear_chat" });
    expect(state.chatMessages).toHaveLength(0);
    expect(state.chatSteps).toHaveLength(0);
    expect(state.chatMode).toBe("idle");
    expect(state.transactions).toHaveLength(count);
  });

  it("a message without an amount falls back to help instead of drafting", () => {
    const state = reducer(createInitialState(), {
      type: "send_chat_text",
      text: "I paid for lunch",
    });
    expect(state.chatIntent).toBe("help");
    expect(state.chatProposalId).toBeNull();
  });

  it("finish_chat_thinking is a no-op when not thinking", () => {
    const state = createInitialState();
    expect(reducer(state, { type: "finish_chat_thinking" })).toBe(state);
  });

  it("chat approve and reject clear the proposal", () => {
    let state = createInitialState();
    state = reducer(state, {
      type: "set_quick_input",
      value: "I spent 299 on Zomato",
    });
    state = reducer(state, { type: "analyze_quick" });
    const id = state.chatProposalId!;
    const approved = reducer(state, { type: "approve", id });
    expect(approved.chatProposalId).toBeNull();
    expect(approved.chatMode).toBe("idle");
    state = reducer(state, { type: "reject", id });
    expect(state.chatProposalId).toBeNull();
    expect(state.transactions.some((t) => t.id === id)).toBe(false);
  });
});
