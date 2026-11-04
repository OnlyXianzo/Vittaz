import { describe, expect, it } from "vitest";
import { createInitialState, reducer } from "./state";

describe("UI preview reducer edge cases", () => {
  it("back returns to previous screen", () => {
    let state = createInitialState();
    state = reducer(state, { type: "navigate", screen: "ledger" });
    state = reducer(state, { type: "back" });
    expect(state.screen).toBe("home");
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
    expect(next.toast).toMatch(/Type a message/);
  });

  it("quick analyze with no text shows a toast", () => {
    const next = reducer(createInitialState(), { type: "analyze_quick" });
    expect(next.toast).toMatch(/Type a message or a question/);
  });

  it("quick analyze answers a question instead of demanding an amount", () => {
    let state = createInitialState();
    state = reducer(state, {
      type: "set_quick_input",
      value: "Who owes me?",
    });
    state = reducer(state, { type: "analyze_quick" });
    expect(state.toast).toBeNull();
    expect(state.screen).toBe("chat");
    expect(state.chatMode).toBe("thinking");
    expect(state.chatProposalId).toBeNull();
    expect(state.transactions).toHaveLength(
      createInitialState().transactions.length,
    );
    state = reducer(state, { type: "finish_chat_thinking" });
    const last = state.chatMessages[state.chatMessages.length - 1];
    expect(last.role).toBe("assistant");
    expect(last.text).toMatch(/Owed to you: Aman/);
  });

  it("answers monthly spend from the same totals as Home", () => {
    let state = createInitialState();
    state = reducer(state, { type: "send_chat_text", text: "monthly spend" });
    expect(state.chatMode).toBe("thinking");
    state = reducer(state, { type: "finish_chat_thinking" });
    expect(state.chatMode).toBe("idle");
    const last = state.chatMessages[state.chatMessages.length - 1];
    expect(last.text).toMatch(/This month you spent ₹8,750/);
    expect(last.text).toMatch(/received ₹3,500/);
    expect(state.chatSteps.every((s) => s.state === "done")).toBe(true);
  });

  it("keeps drafting payment messages that contain an amount", () => {
    let state = createInitialState();
    state = reducer(state, {
      type: "send_chat_text",
      text: "Paid Rs 2,500.00 to Aman",
    });
    expect(state.chatMode).toBe("approval");
    const draft = state.transactions.find((t) => t.id === state.chatProposalId);
    expect(draft?.amountPaise).toBe(250000);
    expect(draft?.status).toBe("unverified");
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
