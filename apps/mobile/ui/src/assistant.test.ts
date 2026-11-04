import { describe, expect, it } from "vitest";
import {
  assistantReply,
  detectIntent,
  planToolCalls,
  telegramPreview,
  toolResult,
  TELEGRAM_MOCK_TARGET,
} from "./assistant";
import type { AssistantContext } from "./assistant";

const ctx: AssistantContext = {
  spentPaise: 875000,
  receivedPaise: 350000,
  foodPaise: 129900,
  pendingCount: 3,
  owesYouName: "Aman",
  owesYouPaise: 45000,
  entryTitle: "Zomato",
  entryAmountPaise: 29900,
  removedLabels: ["account number"],
};

describe("mock assistant", () => {
  it("routes messages to an intent", () => {
    expect(detectIntent("I spent 299 on Zomato")).toBe("entry");
    expect(detectIntent("How much did I spend on food?")).toBe("summary");
    expect(detectIntent("Who owes me money?")).toBe("balances");
    expect(detectIntent("Show unverified entries")).toBe("unverified");
    expect(detectIntent("Send my summary to Telegram")).toBe("telegram");
    expect(detectIntent("hello")).toBe("help");
    expect(detectIntent("   ")).toBe("help");
  });

  it("always plans the privacy scan before any other tool", () => {
    for (const intent of [
      "entry",
      "summary",
      "balances",
      "unverified",
      "telegram",
      "help",
    ] as const) {
      const plan = planToolCalls(intent);
      expect(plan[0].tool).toBe("privacy_scan");
      expect(plan.length).toBeGreaterThan(1);
    }
  });

  it("plans a mock Telegram send instead of a real one", () => {
    const plan = planToolCalls("telegram");
    const send = plan.find((p) => p.tool === "telegram_send_message");
    expect(send?.args).toContain('transport="mock"');
    expect(send?.args).toContain(TELEGRAM_MOCK_TARGET);
  });

  it("never marks a draft as saved", () => {
    const plan = planToolCalls("entry");
    const draft = plan.find((p) => p.tool === "propose_transaction");
    expect(draft?.args).toContain('save="needs-approval"');
    expect(toolResult("propose_transaction", ctx)).toBe(
      "Waiting for your approval",
    );
  });

  it("reports what the privacy guard removed", () => {
    expect(toolResult("privacy_scan", ctx)).toContain("account number");
    expect(toolResult("privacy_scan", { ...ctx, removedLabels: [] })).toBe(
      "No account numbers or secrets found",
    );
  });

  it("builds a shareable summary without contact details", () => {
    const preview = telegramPreview(ctx);
    expect(preview).toContain("Spent: ₹8,750");
    expect(preview).toContain("Waiting for review: 3");
    expect(preview).toContain("Aman owes you ₹450");
    expect(preview).not.toMatch(/\d{9,}/);
  });

  it("answers each intent and mentions the guard when it removed something", () => {
    expect(assistantReply("entry", ctx)).toContain("Nothing is saved");
    expect(assistantReply("summary", ctx)).toContain("₹8,750");
    expect(assistantReply("balances", ctx)).toContain("Aman owes you ₹450");
    expect(assistantReply("unverified", ctx)).toContain("3 entries");
    expect(assistantReply("telegram", ctx)).toContain(TELEGRAM_MOCK_TARGET);
    expect(assistantReply("help", ctx)).toContain("Paste anything");
    expect(assistantReply("summary", ctx)).toContain("account number");
    expect(
      assistantReply("balances", {
        ...ctx,
        owesYouName: null,
        removedLabels: [],
      }),
    ).toBe("Nobody owes you money in this synthetic preview.");
  });

  it("covers the remaining tool results", () => {
    expect(toolResult("parse_entry", ctx)).toBe("Zomato · ₹299");
    expect(toolResult("parse_entry", { ...ctx, entryTitle: null })).toBe(
      "Demo parser",
    );
    expect(toolResult("query_transactions", ctx)).toContain("3 still");
    expect(toolResult("sum_by_category", ctx)).toBe("Food ₹1,299");
    expect(toolResult("people_balances", ctx)).toBe("Aman owes ₹450");
    expect(
      toolResult("people_balances", { ...ctx, owesYouName: null }),
    ).toContain("Nobody owes you");
    expect(toolResult("check_unverified", ctx)).toBe("3 pending");
    expect(toolResult("build_summary", ctx)).toBe("Spent ₹8,750");
    expect(toolResult("telegram_send_message", ctx)).toContain("mock");
    expect(toolResult("unknown_tool", ctx)).toBe("Done");
  });
});
