import { describe, expect, it } from "@jest/globals";
import type { AppState, Transaction } from "./domain";
import { groupByDay, selectLedger, selectSummary } from "./selectors";

const blank: AppState = {
  screen: "home",
  previousScreen: "home",
  transactions: [],
  people: [],
  ledgerFilter: "all",
  inboxFilter: "all",
  ledgerSearch: "",
  searchOpen: false,
  reviewId: null,
  selectedInboxIds: [],
  model: "auto",
  settings: {
    askBeforeSaving: true,
    replaceNames: true,
    sendNotesToCloud: false,
    reviewDigest: "twice",
  },
  chatMode: "idle",
  chatInput: "",
  chatMessages: [],
  chatSteps: [],
  chatProposalId: null,
  chatQuestion: null,
  quickInput: "",
  quickRecentIds: [],
  addDraft: {
    amount: "",
    direction: "spent",
    category: "General",
    person: "",
    mode: "Cash",
    note: "",
  },
  improvedNote: null,
  toast: null,
  onboardingStep: 0,
  sequence: 1,
};

function transaction(patch: Partial<Transaction> = {}): Transaction {
  return {
    id: "synthetic_tx",
    title: "Synthetic shop",
    amountPaise: 12500,
    direction: "spent",
    category: "synthetic",
    mode: "Cash",
    note: "",
    status: "user_confirmed",
    day: "06 Nov",
    time: "12:00",
    color: "#b8f23c",
    ...patch,
  };
}

describe("native ledger selectors", () => {
  it("does not add the browser preview's demo summary offsets", () => {
    expect(selectSummary(blank)).toEqual({
      spentPaise: 0,
      receivedPaise: 0,
      cashPaise: 0,
      receivablePaise: 0,
      payablePaise: 0,
      pendingCount: 0,
    });
  });

  it("derives totals only from confirmed SQLite rows", () => {
    const state = {
      ...blank,
      transactions: [
        transaction(),
        transaction({
          id: "pending",
          amountPaise: 25000,
          status: "unverified",
        }),
        transaction({
          id: "credit",
          amountPaise: 5000,
          direction: "received",
          mode: "UPI",
        }),
        transaction({
          id: "lent",
          amountPaise: 4000,
          direction: "lent",
          splitOwedPaise: 2500,
        }),
      ],
    };
    expect(selectSummary(state)).toEqual({
      spentPaise: 16500,
      receivedPaise: 5000,
      cashPaise: -16500,
      receivablePaise: 2500,
      payablePaise: 0,
      pendingCount: 1,
    });
  });

  it("groups arbitrary real dates instead of dropping rows outside demo days", () => {
    const row = transaction({ day: "06 Nov" });
    expect(groupByDay([row])).toEqual([{ day: "06 Nov", rows: [row] }]);
    expect(selectLedger({ ...blank, transactions: [row] })).toEqual([row]);
  });
});
