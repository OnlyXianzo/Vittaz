import { describe, expect, it } from "vitest";
import {
  answerQuestion,
  categoryIn,
  detectPeriod,
  detectQuestion,
  questionSteps,
} from "./answers";
import type { LedgerFacts } from "./answers";

const facts: LedgerFacts = {
  spentPaise: 875000,
  receivedPaise: 200000,
  cashPaise: 120000,
  pendingCount: 3,
  pendingTitles: ["Swiggy", "Metro card", "Aman"],
  categories: [
    { name: "Food", paise: 240000 },
    { name: "Travel", paise: 110000 },
  ],
  owedToYou: [{ name: "Aman", paise: 250000 }],
  youOwe: [{ name: "Mom", paise: 100000 }],
  period: {
    label: "today",
    spentPaise: 34900,
    receivedPaise: 0,
    count: 2,
    categories: [{ name: "Food", paise: 34900 }],
  },
};

describe("question detection", () => {
  it("recognises questions that carry no amount", () => {
    expect(detectQuestion("Who owes me?")).toBe("balances");
    expect(detectQuestion("monthly spend")).toBe("spend");
    expect(detectQuestion("What did I spend this month?")).toBe("spend");
    expect(detectQuestion("How much on food?")).toBe("category");
    expect(detectQuestion("what is pending")).toBe("pending");
    expect(detectQuestion("how much cash do I have")).toBe("cash");
    expect(detectQuestion("how much have I received")).toBe("received");
    expect(detectQuestion("what did I spend in the last 2 days")).toBe("spend");
  });

  it("still treats payment messages as drafts, not questions", () => {
    expect(detectQuestion("I spent 299 on Zomato")).toBeNull();
    expect(detectQuestion("Paid ₹1,200 to Aman")).toBeNull();
    expect(detectQuestion("received 500 for mobile recharge")).toBeNull();
    expect(
      detectQuestion("Your a/c XX1234 debited Rs. 299.00 for ZOMATO"),
    ).toBeNull();
    expect(detectQuestion("299")).toBeNull();
    expect(detectQuestion("")).toBeNull();
  });

  it("maps category words and periods", () => {
    expect(categoryIn("how much on petrol")).toBe("Fuel");
    expect(categoryIn("anything on flights")).toBe("Travel");
    expect(categoryIn("who owes me")).toBeNull();
    expect(detectPeriod("today's spend")).toBe("today");
    expect(detectPeriod("yesterday")).toBe("yesterday");
    expect(detectPeriod("last 7 days")).toBe("recent");
    expect(detectPeriod("monthly spend")).toBe("month");
  });
});

describe("ledger answers", () => {
  it("answers who owes what without asking for an amount", () => {
    const answer = answerQuestion("Who owes me?", facts);
    expect(answer).toContain("Aman ₹2,500");
    expect(answer).toContain("Mom ₹1,000");
    expect(answer).toContain("you should receive ₹1,500");
    expect(answer).not.toMatch(/include an amount/i);
  });

  it("reports month totals and the biggest categories", () => {
    const answer = answerQuestion("What did I spend this month?", facts);
    expect(answer).toContain("spent ₹8,750");
    expect(answer).toContain("received ₹2,000");
    expect(answer).toContain("Food ₹2,400");
    expect(answer).toContain("3 entries still need review");
  });

  it("answers a day window from the preview rows", () => {
    const answer = answerQuestion("what did I spend today?", facts);
    expect(answer).toContain("Today you have 2 confirmed entries");
    expect(answer).toContain("spent ₹349");
  });

  it("answers category, cash, received and pending questions", () => {
    expect(answerQuestion("How much on food?", facts)).toContain(
      "Food comes to ₹2,400 this month",
    );
    expect(answerQuestion("how much on rent?", facts)).toContain(
      "No confirmed rent entries",
    );
    expect(answerQuestion("how much cash is left", facts)).toContain(
      "Cash in hand is ₹1,200",
    );
    expect(answerQuestion("how much have I received", facts)).toContain(
      "received ₹2,000",
    );
    expect(answerQuestion("what is pending", facts)).toContain(
      "3 entries need review: Swiggy, Metro card, Aman",
    );
  });

  it("handles empty balances and empty pending lists", () => {
    const empty: LedgerFacts = {
      ...facts,
      pendingCount: 0,
      pendingTitles: [],
      owedToYou: [],
      youOwe: [],
    };
    expect(answerQuestion("who owes me", empty)).toMatch(/Nobody owes you/);
    expect(answerQuestion("what is pending", empty)).toMatch(
      /Nothing is waiting/,
    );
  });

  it("falls back to guidance instead of an amount error", () => {
    expect(answerQuestion("hello", facts)).toMatch(/No amount is needed/);
  });
});

describe("question steps", () => {
  it("uses question-specific steps that never wait for approval", () => {
    for (const kind of [
      "balances",
      "pending",
      "cash",
      "received",
      "category",
      "spend",
      "help",
    ] as const) {
      const steps = questionSteps(kind);
      expect(steps.length).toBeGreaterThan(1);
      expect(steps[0].detail).toBe("No amount needed");
      expect(steps.some((s) => s.state === "waiting")).toBe(false);
    }
    expect(questionSteps("balances")[1].tool).toBe("people_balances");
    expect(questionSteps("spend")[2].tool).toBe("sum_by_category");
  });
});
