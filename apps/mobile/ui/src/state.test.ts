import { describe, expect, it } from "vitest";
import { createInitialState, reducer } from "./state";
import type { AppState } from "./types";

function pendingId(state: AppState): string {
  const pending = state.transactions.find((t) => t.status === "unverified");
  if (!pending) throw new Error("expected a pending transaction");
  return pending.id;
}

describe("UI preview reducer", () => {
  it("starts in the chat window with synthetic pending entries", () => {
    const state = createInitialState();
    expect(state.screen).toBe("chat");
    expect(
      state.transactions.filter((t) => t.status === "unverified"),
    ).toHaveLength(3);
  });

  it("approves a pending entry exactly once", () => {
    const state = createInitialState();
    const id = pendingId(state);
    const approved = reducer(state, { type: "approve", id });
    const again = reducer(approved, { type: "approve", id });
    expect(approved.transactions.find((t) => t.id === id)?.status).toBe(
      "user_confirmed",
    );
    expect(again.transactions.filter((t) => t.id === id)).toHaveLength(1);
    expect(
      again.transactions.filter((t) => t.status === "unverified"),
    ).toHaveLength(2);
  });

  it("rejects a pending entry without creating a confirmed transaction", () => {
    const state = createInitialState();
    const id = pendingId(state);
    const next = reducer(state, { type: "reject", id });
    expect(next.transactions.some((t) => t.id === id)).toBe(false);
    expect(
      next.transactions.filter((t) => t.status === "user_confirmed"),
    ).toHaveLength(
      state.transactions.filter((t) => t.status === "user_confirmed").length,
    );
  });

  it("adds a manual transaction as user_confirmed and returns to ledger", () => {
    const state = createInitialState();
    const withDraft = reducer(state, {
      type: "update_draft",
      patch: { amount: "450", person: "Aman", note: "lunch" },
    });
    const next = reducer(withDraft, { type: "add_transaction" });
    expect(next.screen).toBe("ledger");
    const added = next.transactions.find((t) => t.note === "lunch");
    expect(added?.status).toBe("user_confirmed");
    expect(added?.amountPaise).toBe(45000);
  });

  it("does not add an invalid manual amount", () => {
    const state = reducer(createInitialState(), {
      type: "update_draft",
      patch: { amount: "abc" },
    });
    const next = reducer(state, { type: "add_transaction" });
    expect(next.transactions).toHaveLength(state.transactions.length);
    expect(next.toast).toMatch(/valid amount/i);
  });

  it("filters ledger by mode and status", () => {
    const state = createInitialState();
    const cash = reducer(state, { type: "set_ledger_filter", filter: "cash" });
    expect(cash.ledgerFilter).toBe("cash");
    const unverified = reducer(state, {
      type: "set_ledger_filter",
      filter: "unverified",
    });
    expect(unverified.ledgerFilter).toBe("unverified");
  });

  it("a pasted message creates a pending proposal and a chat approval", () => {
    const state = createInitialState();
    const withInput = reducer(state, {
      type: "set_quick_input",
      value: "I spent 299 on Zomato",
    });
    const next = reducer(reducer(withInput, { type: "analyze_quick" }), {
      type: "finish_chat_thinking",
    });
    expect(next.screen).toBe("chat");
    expect(next.chatMode).toBe("approval");
    expect(next.chatProposalId).toBeTruthy();
    const proposal = next.transactions.find(
      (t) => t.id === next.chatProposalId,
    );
    expect(proposal?.status).toBe("unverified");
    expect(proposal?.amountPaise).toBe(29900);
  });

  it("chat question enters thinking then finishes with a deterministic answer", () => {
    const state = createInitialState();
    const withInput = reducer(state, {
      type: "set_chat_input",
      value: "How much did I spend on food?",
    });
    const thinking = reducer(withInput, { type: "send_chat" });
    expect(thinking.chatMode).toBe("thinking");
    const done = reducer(thinking, { type: "finish_chat_thinking" });
    expect(done.chatMode).toBe("idle");
    expect(done.chatMessages.at(-1)?.role).toBe("assistant");
  });

  it("keeps approval-before-saving on", () => {
    const state = createInitialState();
    const next = reducer(state, {
      type: "toggle_setting",
      key: "askBeforeSaving",
    });
    expect(next.settings.askBeforeSaving).toBe(true);
    expect(next.toast).toMatch(/always requires approval/i);
  });

  it("moves through onboarding and finishes in the chat window", () => {
    let state = createInitialState();
    state = reducer(state, { type: "navigate", screen: "onboarding-welcome" });
    state = reducer(state, { type: "set_onboarding_step", step: 1 });
    expect(state.screen).toBe("onboarding-how");
    state = reducer(state, { type: "set_onboarding_step", step: 2 });
    expect(state.screen).toBe("onboarding-ai");
    state = reducer(state, { type: "finish_onboarding" });
    expect(state.screen).toBe("chat");
  });
});
