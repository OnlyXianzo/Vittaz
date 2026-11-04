/**
 * Deterministic mock assistant for the chat preview.
 *
 * No model, network call or Telegram request happens here. The module decides
 * which tool calls the assistant would make, then produces a fixed answer from
 * the synthetic ledger so the preview is reproducible in tests.
 */

import { formatPaise } from "./money";

export type AssistantIntent =
  "entry" | "summary" | "balances" | "unverified" | "telegram" | "help";

export interface ToolPlan {
  tool: string;
  label: string;
  args: string;
}

export interface AssistantContext {
  spentPaise: number;
  receivedPaise: number;
  foodPaise: number;
  pendingCount: number;
  owesYouName: string | null;
  owesYouPaise: number;
  entryTitle: string | null;
  entryAmountPaise: number | null;
  removedLabels: string[];
}

export const TELEGRAM_MOCK_TARGET = "@vittaz_demo_bot";

const QUESTION = /\?|how much|what|show|list|total|summar|spent|spend/i;
const TELEGRAM = /telegram|bot\b|send.*(summary|report|digest)|notify|share/i;
const BALANCES = /owe|owes|lend|lent|borrow|who owes|balance|receivable/i;
const UNVERIFIED = /unverified|pending|inbox|review|approve/i;
const ENTRY =
  /\b(?:spent|spend|paid|pay|bought|buy|received|got|credited|debited|lent|gave|rs\.?|inr|₹)\b|\d/i;

export function detectIntent(text: string): AssistantIntent {
  const value = text.trim();
  if (!value) return "help";
  if (TELEGRAM.test(value)) return "telegram";
  const hasAmount = /(?:₹\s*)?\d+(?:\.\d{1,2})?/.test(value);
  const payment =
    /\b(?:spent|spend|paid|pay|bought|received|got|credited|debited|lent|gave)\b/i.test(
      value,
    );
  if (hasAmount && payment) return "entry";
  if (BALANCES.test(value)) return "balances";
  if (UNVERIFIED.test(value) && !hasAmount) return "unverified";
  if (QUESTION.test(value)) return "summary";
  if (hasAmount && ENTRY.test(value)) return "entry";
  return "help";
}

/** The privacy guard always runs first, on the device, before any other tool. */
export function privacyToolPlan(): ToolPlan {
  return {
    tool: "privacy_scan",
    label: "Checked for sensitive details",
    args: 'mode="on-device" fields="account,card,ifsc,upi,phone,email,otp"',
  };
}

export function planToolCalls(intent: AssistantIntent): ToolPlan[] {
  const plan: ToolPlan[] = [privacyToolPlan()];
  switch (intent) {
    case "entry":
      plan.push(
        {
          tool: "parse_entry",
          label: "Read the message",
          args: 'source="chat" parser="demo"',
        },
        {
          tool: "propose_transaction",
          label: "Drafted an entry",
          args: 'status="unverified" save="needs-approval"',
        },
      );
      break;
    case "summary":
      plan.push(
        {
          tool: "query_transactions",
          label: "Searched the ledger",
          args: 'range="this month" status="user_confirmed"',
        },
        {
          tool: "sum_by_category",
          label: "Added the amounts up",
          args: 'group="category" currency="INR"',
        },
      );
      break;
    case "balances":
      plan.push({
        tool: "people_balances",
        label: "Looked up who owes what",
        args: 'include="receivables,payables"',
      });
      break;
    case "unverified":
      plan.push({
        tool: "check_unverified",
        label: "Counted entries waiting for review",
        args: 'status="unverified"',
      });
      break;
    case "telegram":
      plan.push(
        {
          tool: "build_summary",
          label: "Built a shareable summary",
          args: 'redact="true" amounts="rounded"',
        },
        {
          tool: "telegram_send_message",
          label: `Sent to Telegram (mock)`,
          args: `chat="${TELEGRAM_MOCK_TARGET}" transport="mock"`,
        },
      );
      break;
    default:
      plan.push({
        tool: "app_help",
        label: "Looked up what this preview can do",
        args: 'topic="chat"',
      });
  }
  return plan;
}

export function toolResult(tool: string, ctx: AssistantContext): string {
  switch (tool) {
    case "privacy_scan":
      return ctx.removedLabels.length
        ? `Removed ${ctx.removedLabels.join(", ")} before the assistant saw the text`
        : "No account numbers or secrets found";
    case "parse_entry":
      return ctx.entryTitle
        ? `${ctx.entryTitle} · ${formatPaise(ctx.entryAmountPaise ?? 0)}`
        : "Demo parser";
    case "propose_transaction":
      return "Waiting for your approval";
    case "query_transactions":
      return `${ctx.pendingCount} still unverified`;
    case "sum_by_category":
      return `Food ${formatPaise(ctx.foodPaise)}`;
    case "people_balances":
      return ctx.owesYouName
        ? `${ctx.owesYouName} owes ${formatPaise(ctx.owesYouPaise)}`
        : "Nobody owes you in this preview";
    case "check_unverified":
      return `${ctx.pendingCount} pending`;
    case "build_summary":
      return `Spent ${formatPaise(ctx.spentPaise)}`;
    case "telegram_send_message":
      return `Delivered to ${TELEGRAM_MOCK_TARGET} (mock, nothing was sent)`;
    default:
      return "Done";
  }
}

export function telegramPreview(ctx: AssistantContext): string {
  const lines = [
    "Vittaz daily summary (mock)",
    `Spent: ${formatPaise(ctx.spentPaise)}`,
    `Received: ${formatPaise(ctx.receivedPaise)}`,
    `Waiting for review: ${ctx.pendingCount}`,
  ];
  if (ctx.owesYouName)
    lines.push(`${ctx.owesYouName} owes you ${formatPaise(ctx.owesYouPaise)}`);
  lines.push("No account numbers, names of banks or contact details included.");
  return lines.join("\n");
}

export function assistantReply(
  intent: AssistantIntent,
  ctx: AssistantContext,
): string {
  const guard = ctx.removedLabels.length
    ? ` I stripped ${ctx.removedLabels.join(", ")} on this device first.`
    : "";
  switch (intent) {
    case "entry":
      return `I drafted this entry. Nothing is saved until you approve it.${guard}`;
    case "summary":
      return `In this synthetic preview, confirmed spending is ${formatPaise(ctx.spentPaise)} and food is ${formatPaise(ctx.foodPaise)}. ${ctx.pendingCount} entries still need review.${guard}`;
    case "balances":
      return ctx.owesYouName
        ? `${ctx.owesYouName} owes you ${formatPaise(ctx.owesYouPaise)} in this synthetic preview.${guard}`
        : `Nobody owes you money in this synthetic preview.${guard}`;
    case "unverified":
      return `${ctx.pendingCount} entries are waiting for your review. Open the inbox to approve or reject them.${guard}`;
    case "telegram":
      return `I sent the summary to ${TELEGRAM_MOCK_TARGET} using the mock Telegram tool. No real message left this preview.${guard}`;
    default:
      return `Tell me about a payment ("I spent 299 on Zomato"), ask about your money, or ask me to send a summary to Telegram. Paste anything and I will check it for account numbers before reading it.${guard}`;
  }
}
