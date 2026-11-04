/**
 * Question answering for the demo assistant.
 *
 * The chat used to demand an amount, so "who owes me?" or "monthly spend"
 * failed. Questions are now recognised first and answered from the synthetic
 * ledger; only payment-shaped messages become draft entries.
 */

import { formatPaise } from "./money";
import type { ChatStep } from "./types";

export type QuestionKind =
  "balances" | "pending" | "cash" | "received" | "category" | "spend" | "help";

/** Preview rows carry a day label, not a timestamp. */
export type PeriodKey = "today" | "yesterday" | "recent" | "month";

export interface PeriodFacts {
  label: string;
  spentPaise: number;
  receivedPaise: number;
  count: number;
  categories: Array<{ name: string; paise: number }>;
}

export interface LedgerFacts {
  spentPaise: number;
  receivedPaise: number;
  cashPaise: number;
  pendingCount: number;
  pendingTitles: string[];
  categories: Array<{ name: string; paise: number }>;
  owedToYou: Array<{ name: string; paise: number }>;
  youOwe: Array<{ name: string; paise: number }>;
  period?: PeriodFacts;
}

const ASKS =
  /\?|^\s*(who|what|what's|whats|how|when|why|which|show|list|tell|give|summary|summarise|summarize|total|any|do|did|does)\b/i;
const PAYMENT =
  /\b(spent|spend|paid|pay|bought|buy|received|got|lent|gave|debited|credited)\b/i;
const BALANCES =
  /owe|owes|owing|owed|lend|lent|borrow|receivable|payable|settle|balance/;
const PENDING = /unverified|pending|inbox|review|approve|waiting/;
const CASH = /cash in hand|cash balance|how much cash|cash left/;
const RECEIVED = /received|income|earned|got paid|credit|inflow/;
const SPEND = /spend|spent|expense|expenses|outflow|month|monthly|total/;
const HAS_AMOUNT = /(?:₹|rs\.?|inr)\s*\d|\b\d+(?:[.,]\d+)*\b/;

const CATEGORY_WORDS: Record<string, RegExp> = {
  Food: /food|lunch|dinner|breakfast|zomato|swiggy|tea|coffee|restaurant/,
  Fuel: /fuel|petrol|diesel/,
  Travel: /travel|cab|uber|ola|metro|bus|train|flight/,
  Shopping: /shopping|amazon|flipkart|clothes/,
  Rent: /rent/,
  Recharge: /recharge|mobile|phone bill|data pack/,
  Transfer: /transfer|sent to|neft|imps/,
};

/** Which window the question asks about; defaults to the month view. */
export function detectPeriod(text: string): PeriodKey {
  const value = text.toLowerCase();
  if (/\btoday\b/.test(value)) return "today";
  if (/\byesterday\b/.test(value)) return "yesterday";
  if (/\bweek\b|\b(?:last|past)\s+\d+\s*days?\b|\b\d+\s*days?\b/.test(value))
    return "recent";
  return "month";
}

export function categoryIn(text: string): string | null {
  const value = text.toLowerCase();
  for (const [name, pattern] of Object.entries(CATEGORY_WORDS))
    if (pattern.test(value)) return name;
  return null;
}

/** Returns null when the message is a payment to draft, not a question. */
export function detectQuestion(text: string): QuestionKind | null {
  const value = text.trim().toLowerCase();
  if (!value) return null;
  const hasAmount = HAS_AMOUNT.test(value);
  const asks = ASKS.test(value);
  if (hasAmount && PAYMENT.test(value) && !asks) return null;

  if (BALANCES.test(value)) return "balances";
  if (PENDING.test(value)) return "pending";
  if (CASH.test(value)) return "cash";
  if (RECEIVED.test(value)) return "received";
  if (categoryIn(value)) return "category";
  if (SPEND.test(value) || asks) return "spend";
  if (!hasAmount) return "help";
  return null;
}

function money(paise: number): string {
  return formatPaise(paise);
}

function periodWindow(text: string, facts: LedgerFacts): PeriodFacts | null {
  if (detectPeriod(text) === "month" || !facts.period) return null;
  return facts.period;
}

function listTotals(rows: Array<{ name: string; paise: number }>): string {
  return rows.map((r) => `${r.name} ${money(r.paise)}`).join(", ");
}

export function answerQuestion(text: string, facts: LedgerFacts): string {
  const kind = detectQuestion(text) ?? "help";
  const tail =
    facts.pendingCount > 0
      ? ` ${facts.pendingCount} entries still need review.`
      : "";
  switch (kind) {
    case "balances": {
      if (facts.owedToYou.length === 0 && facts.youOwe.length === 0)
        return "Nobody owes you and you owe nobody in this synthetic preview.";
      const parts: string[] = [];
      if (facts.owedToYou.length)
        parts.push(`Owed to you: ${listTotals(facts.owedToYou)}`);
      if (facts.youOwe.length)
        parts.push(`You owe: ${listTotals(facts.youOwe)}`);
      const net =
        facts.owedToYou.reduce((s, r) => s + r.paise, 0) -
        facts.youOwe.reduce((s, r) => s + r.paise, 0);
      parts.push(
        net >= 0
          ? `Net, you should receive ${money(net)}.`
          : `Net, you should pay ${money(-net)}.`,
      );
      return `${parts.join(". ")}`;
    }
    case "pending":
      return facts.pendingCount === 0
        ? "Nothing is waiting for review in this preview."
        : `${facts.pendingCount} entries need review: ${facts.pendingTitles.join(", ")}. Open Inbox to approve or reject them.`;
    case "cash":
      return `Cash in hand is ${money(facts.cashPaise)} in this synthetic preview.`;
    case "received":
      return `You have received ${money(facts.receivedPaise)} this month in this synthetic preview.${tail}`;
    case "category": {
      const name = categoryIn(text);
      const window = periodWindow(text, facts);
      const rows = window ? window.categories : facts.categories;
      const row = rows.find((c) => c.name === name);
      const where = window ? window.label : "this month";
      if (!row)
        return `No confirmed ${name?.toLowerCase()} entries ${where} in this preview.${tail}`;
      return `${row.name} comes to ${money(row.paise)} ${where}, across confirmed entries in this preview.${tail}`;
    }
    case "spend": {
      const window = periodWindow(text, facts);
      if (window) {
        const top = window.categories.slice(0, 3);
        const breakdown = top.length
          ? ` Biggest categories: ${listTotals(top)}.`
          : "";
        return `${window.label[0].toUpperCase()}${window.label.slice(1)} you have ${window.count} confirmed entries: spent ${money(window.spentPaise)}, received ${money(window.receivedPaise)}.${breakdown} This counts the preview ledger only.${tail}`;
      }
      const top = facts.categories.slice(0, 3);
      const breakdown = top.length
        ? ` Biggest categories in the preview rows: ${listTotals(top)}.`
        : "";
      return `This month you spent ${money(facts.spentPaise)} and received ${money(facts.receivedPaise)}.${breakdown}${tail}`;
    }
    default:
      return 'Ask me about your money — "who owes me?", "what did I spend this month?", "how much on food?", "what is pending?" — or add an entry like "I spent 299 on Zomato". No amount is needed for questions.';
  }
}

export function questionSteps(kind: QuestionKind): ChatStep[] {
  const steps: ChatStep[] = [
    {
      label: "Understood the question",
      tool: "read_question",
      detail: "No amount needed",
      state: "done",
    },
  ];
  if (kind === "balances")
    steps.push({
      label: "Looked up who owes what",
      tool: "people_balances",
      detail: "Synthetic people",
      state: "done",
    });
  else if (kind === "pending")
    steps.push({
      label: "Checked entries waiting for review",
      tool: "check_unverified",
      detail: "Running",
      state: "running",
    });
  else if (kind === "category" || kind === "spend" || kind === "received")
    steps.push(
      {
        label: "Searched the preview ledger",
        tool: "query_transactions",
        detail: "Synthetic rows",
        state: "done",
      },
      {
        label: "Added them up",
        tool: "sum_by_category",
        detail: "Running",
        state: "running",
      },
    );
  else if (kind === "cash")
    steps.push({
      label: "Totalled the cash entries",
      tool: "cash_balance",
      detail: "Running",
      state: "running",
    });
  else
    steps.push({
      label: "Listed what you can ask",
      tool: "app_help",
      detail: "Running",
      state: "running",
    });
  return steps;
}
