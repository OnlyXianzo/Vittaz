import {
  CATEGORY_COLORS,
  SYNTHETIC_PEOPLE,
  SYNTHETIC_TRANSACTIONS,
} from "./data";
import { formatPaise, parseAmountToPaise } from "./money";
import { scanAndRedact, sensitiveLabels } from "./privacy";
import {
  assistantReply,
  detectIntent,
  planToolCalls,
  telegramPreview,
  toolResult,
} from "./assistant";
import type { AssistantContext, AssistantIntent } from "./assistant";
import type {
  Action,
  AppState,
  ChatMessage,
  ChatStep,
  Screen,
  Transaction,
} from "./types";

/** Sample messages used by the composer's "add" menu. Deliberately seeded with
 *  an account number and a phone number so the privacy guard is visible. */
export const MOCK_ATTACHMENTS: Record<"sms" | "screenshot", string> = {
  sms: "HDFC Bank: Rs 2,500.00 debited from a/c 50100234567890 on 27-10-2025. Not you? Call 9876543210.",
  screenshot:
    "Screenshot text: Paid Rs 299 to Zomato from aman@okhdfcbank. Receipt sent to aman.k@example.com. Card 4111 1111 1111 1111.",
};

const ONBOARDING_SCREENS: Record<0 | 1 | 2, Screen> = {
  0: "onboarding-welcome",
  1: "onboarding-how",
  2: "onboarding-ai",
};

export function createInitialState(): AppState {
  const pending = SYNTHETIC_TRANSACTIONS.filter(
    (t) => t.status === "unverified",
  ).map((t) => t.id);
  return {
    screen: "chat",
    previousScreen: "chat",
    transactions: SYNTHETIC_TRANSACTIONS,
    people: SYNTHETIC_PEOPLE,
    ledgerFilter: "all",
    inboxFilter: "all",
    ledgerSearch: "",
    searchOpen: false,
    reviewId: null,
    selectedInboxIds: pending,
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
    chatIntent: null,
    chatRemoved: [],
    chatTelegramPreview: null,
    quickInput: "",
    quickRecentIds: ["txn_zomato", "txn_hdfc"],
    addDraft: {
      amount: "450",
      direction: "spent",
      category: "Food",
      person: "Aman",
      mode: "UPI",
      note: "lunch, he owes half, didnt pay yet",
    },
    improvedNote: null,
    toast: null,
    onboardingStep: 0,
    sequence: 100,
  };
}

function navigate(state: AppState, screen: Screen): AppState {
  if (state.screen === screen) return state;
  return { ...state, previousScreen: state.screen, screen };
}

function makeProposal(
  state: AppState,
  input: string,
  idPrefix: string,
): Transaction | null {
  // Prefer an explicit currency amount so Indian grouping ("Rs 2,500.00") and
  // dates in bank alerts are not mistaken for the value.
  const amountMatch =
    input.match(
      /(?:₹|rs\.?|inr)\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i,
    ) ?? input.match(/(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/);
  const amountPaise = amountMatch
    ? parseAmountToPaise(amountMatch[1].replace(/,/g, ""))
    : null;
  if (!amountPaise) return null;
  const merchantMatch = input.match(
    /\b(?:on|to|at)\s+([A-Za-z][A-Za-z .&'-]*)/i,
  );
  const senderMatch = input.match(/^\s*([A-Za-z][A-Za-z .&'-]{2,28}):/);
  const title = (merchantMatch?.[1] ?? senderMatch?.[1] ?? "Draft entry")
    .trim()
    .slice(0, 40);
  const lower = input.toLowerCase();
  const category = /lunch|food|zomato|tea|dinner/.test(lower)
    ? "Food"
    : /recharge|mobile/.test(lower)
      ? "Recharge"
      : /fuel|petrol/.test(lower)
        ? "Fuel"
        : "General";
  return {
    id: `${idPrefix}_${state.sequence}`,
    title,
    amountPaise,
    direction: /received|got|credit/.test(lower) ? "received" : "spent",
    category,
    mode: "UPI",
    note: input,
    status: "unverified",
    day: "Today",
    time: "Just now",
    source: "assistant",
    color: CATEGORY_COLORS[category] ?? CATEGORY_COLORS.General,
  };
}

function approve(state: AppState, id: string): AppState {
  const target = state.transactions.find((t) => t.id === id);
  if (!target || target.status === "user_confirmed") return state;
  const transactions = state.transactions.map((t) =>
    t.id === id ? { ...t, status: "user_confirmed" as const } : t,
  );
  const next: AppState = {
    ...state,
    transactions,
    selectedInboxIds: state.selectedInboxIds.filter((x) => x !== id),
    toast: "Approved in this synthetic preview.",
  };
  if (state.reviewId === id) {
    next.reviewId = null;
    next.screen = "chat";
  }
  if (state.chatProposalId === id) {
    next.chatProposalId = null;
    next.chatMode = "idle";
    next.chatMessages = [
      ...state.chatMessages,
      {
        id: `msg_${state.sequence}`,
        role: "assistant",
        text: "Approved. The preview ledger now shows this entry as confirmed.",
      },
    ];
    next.sequence = state.sequence + 1;
  }
  return next;
}

function reject(state: AppState, id: string): AppState {
  const target = state.transactions.find((t) => t.id === id);
  if (!target || target.status === "user_confirmed") return state;
  const next: AppState = {
    ...state,
    transactions: state.transactions.filter((t) => t.id !== id),
    selectedInboxIds: state.selectedInboxIds.filter((x) => x !== id),
    toast: "Rejected. No confirmed transaction was created.",
  };
  if (state.reviewId === id) {
    next.reviewId = null;
    next.screen = "chat";
  }
  if (state.chatProposalId === id) {
    next.chatProposalId = null;
    next.chatMode = "idle";
    next.chatMessages = [
      ...state.chatMessages,
      {
        id: `msg_${state.sequence}`,
        role: "assistant",
        text: "Rejected. Nothing was saved.",
      },
    ];
    next.sequence = state.sequence + 1;
  }
  return next;
}

function addTransaction(state: AppState): AppState {
  const amountPaise = parseAmountToPaise(state.addDraft.amount);
  if (!amountPaise)
    return { ...state, toast: "Enter a valid amount greater than zero." };
  const draft = state.addDraft;
  const title = draft.person.trim() || draft.category;
  const transaction: Transaction = {
    id: `manual_${state.sequence}`,
    title,
    amountPaise,
    direction: draft.direction,
    category: draft.category,
    mode: draft.mode,
    person: draft.person.trim() || undefined,
    note: draft.note.trim(),
    status: "user_confirmed",
    day: "Today",
    time: "Just now",
    color: CATEGORY_COLORS[draft.category] ?? CATEGORY_COLORS.General,
  };
  return {
    ...state,
    transactions: [transaction, ...state.transactions],
    sequence: state.sequence + 1,
    screen: "ledger",
    previousScreen: "add",
    toast: "Saved as verified in this synthetic preview.",
  };
}

function chatContext(state: AppState): AssistantContext {
  const confirmed = state.transactions.filter(
    (t) => t.status === "user_confirmed",
  );
  const sum = (rows: Transaction[]) =>
    rows.reduce((total, t) => total + t.amountPaise, 0);
  const owesYou = [...state.people]
    .filter((p) => p.balancePaise > 0)
    .sort((a, b) => b.balancePaise - a.balancePaise)[0];
  const proposal = state.transactions.find(
    (t) => t.id === state.chatProposalId,
  );
  return {
    spentPaise: sum(confirmed.filter((t) => t.direction === "spent")),
    receivedPaise: sum(confirmed.filter((t) => t.direction === "received")),
    foodPaise: sum(
      confirmed.filter((t) => t.direction === "spent" && t.category === "Food"),
    ),
    pendingCount: state.transactions.filter(
      (t) => t.status !== "user_confirmed",
    ).length,
    owesYouName: owesYou?.name ?? null,
    owesYouPaise: owesYou?.balancePaise ?? 0,
    entryTitle: proposal?.title ?? null,
    entryAmountPaise: proposal?.amountPaise ?? null,
    removedLabels: state.chatRemoved,
  };
}

/**
 * Every message, paste and attachment goes through the same path: the privacy
 * guard runs first, then the mock assistant plans tool calls.
 */
function startChat(state: AppState, rawText: string): AppState {
  const text = rawText.trim();
  if (!text) return { ...state, toast: "Type or paste a message first." };

  const scan = scanAndRedact(text);
  const removed = sensitiveLabels(scan);
  let intent: AssistantIntent = detectIntent(scan.safeText);
  const proposal =
    intent === "entry" ? makeProposal(state, scan.safeText, "chat") : null;
  if (intent === "entry" && !proposal) intent = "help";

  const plan = planToolCalls(intent);
  const baseState: AppState = {
    ...state,
    chatRemoved: removed,
    chatIntent: intent,
    chatProposalId: proposal?.id ?? null,
  };
  const ctx = chatContext(baseState);
  const steps: ChatStep[] = plan.map((item, index) => ({
    id: `step_${state.sequence}_${index}`,
    tool: item.tool,
    label: item.label,
    args: item.args,
    detail: index === 0 ? "On this device" : index === 1 ? "Running" : "Queued",
    result: index === 0 ? toolResult(item.tool, ctx) : undefined,
    state: index === 0 ? "done" : index === 1 ? "running" : "queued",
  }));

  const userMessage: ChatMessage = {
    id: `msg_${state.sequence}`,
    role: "user",
    text: scan.safeText,
    redacted: removed,
  };

  return {
    ...baseState,
    transactions: proposal
      ? [proposal, ...state.transactions]
      : state.transactions,
    sequence: state.sequence + 1,
    screen: "chat",
    chatInput: "",
    chatMode: "thinking",
    chatTelegramPreview: null,
    chatMessages: [...state.chatMessages, userMessage],
    chatSteps: steps,
  };
}

function finalizeChat(state: AppState): AppState {
  const ctx = chatContext(state);
  const intent = state.chatIntent ?? "help";
  const steps: ChatStep[] = state.chatSteps.map((step) =>
    step.tool === "propose_transaction"
      ? {
          ...step,
          state: "waiting",
          detail: "Waiting for your approval",
          result: toolResult(step.tool, ctx),
        }
      : step.state === "done"
        ? step
        : {
            ...step,
            state: "done",
            detail: "Done",
            result: toolResult(step.tool, ctx),
          },
  );
  return {
    ...state,
    chatMode: state.chatProposalId ? "approval" : "idle",
    chatSteps: steps,
    chatTelegramPreview: intent === "telegram" ? telegramPreview(ctx) : null,
    chatMessages: [
      ...state.chatMessages,
      {
        id: `msg_${state.sequence}`,
        role: "assistant",
        text: assistantReply(intent, ctx),
        variant: intent === "telegram" ? "telegram" : "text",
      },
    ],
    sequence: state.sequence + 1,
  };
}

/** Moves the mock tool run forward by one call so the UI can animate it. */
function advanceChat(state: AppState): AppState {
  if (state.chatMode !== "thinking") return state;
  const runningIndex = state.chatSteps.findIndex((s) => s.state === "running");
  if (runningIndex === -1) return finalizeChat(state);
  const ctx = chatContext(state);
  const steps: ChatStep[] = state.chatSteps.map((step, index) =>
    index === runningIndex
      ? {
          ...step,
          state: "done" as const,
          detail: "Done",
          result: toolResult(step.tool, ctx),
        }
      : step,
  );
  const queuedIndex = steps.findIndex((s) => s.state === "queued");
  if (queuedIndex === -1) return finalizeChat({ ...state, chatSteps: steps });
  steps[queuedIndex] = {
    ...steps[queuedIndex],
    state: "running",
    detail: "Running",
  };
  return { ...state, chatSteps: steps };
}

function finishChatThinking(state: AppState): AppState {
  let next = state;
  for (let i = 0; i < 12 && next.chatMode === "thinking"; i += 1) {
    next = advanceChat(next);
  }
  return next;
}

function analyzeQuick(state: AppState): AppState {
  const text = state.quickInput.trim();
  if (!text)
    return {
      ...state,
      toast: "Paste or type a message, for example: I spent 299 on Zomato.",
    };
  const next = startChat(state, text);
  const proposalId = next.chatProposalId;
  return {
    ...next,
    quickInput: "",
    quickRecentIds: proposalId
      ? [proposalId, ...state.quickRecentIds].slice(0, 5)
      : state.quickRecentIds,
  };
}

function improveNote(state: AppState): AppState {
  const draft = state.addDraft;
  const amount = parseAmountToPaise(draft.amount);
  const person = draft.person.trim() || "the other person";
  const half = amount ? formatPaise(Math.floor(amount / 2)) : null;
  const improved =
    /owes half|half/.test(draft.note.toLowerCase()) && half
      ? `Lunch with ${person}. They owe me ${half} and have not paid yet.`
      : draft.note
          .trim()
          .replace(/\s+/g, " ")
          .replace(/^./, (c) => c.toUpperCase()) || "Add a note.";
  return { ...state, improvedNote: improved };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "navigate":
      return navigate(state, action.screen);
    case "back":
      return { ...state, screen: "chat", previousScreen: "chat" };
    case "approve":
      return approve(state, action.id);
    case "reject":
      return reject(state, action.id);
    case "add_transaction":
      return addTransaction(state);
    case "update_draft":
      return { ...state, addDraft: { ...state.addDraft, ...action.patch } };
    case "set_ledger_filter":
      return { ...state, ledgerFilter: action.filter };
    case "set_inbox_filter":
      return { ...state, inboxFilter: action.filter };
    case "set_ledger_search":
      return { ...state, ledgerSearch: action.value };
    case "toggle_search":
      return {
        ...state,
        searchOpen: !state.searchOpen,
        ledgerSearch: state.searchOpen ? "" : state.ledgerSearch,
      };
    case "open_review":
      return {
        ...state,
        reviewId: action.id,
        previousScreen: state.screen,
        screen: "review",
      };
    case "toggle_inbox_selected":
      return {
        ...state,
        selectedInboxIds: state.selectedInboxIds.includes(action.id)
          ? state.selectedInboxIds.filter((id) => id !== action.id)
          : [...state.selectedInboxIds, action.id],
      };
    case "review_selected": {
      const first = state.selectedInboxIds.find((id) =>
        state.transactions.some(
          (t) => t.id === id && t.status !== "user_confirmed",
        ),
      );
      if (!first)
        return { ...state, toast: "Select at least one pending entry." };
      return {
        ...state,
        reviewId: first,
        previousScreen: "inbox",
        screen: "review",
      };
    }
    case "select_model":
      return {
        ...state,
        model: action.model,
        toast: `Model preference set to ${action.model} for this preview.`,
      };
    case "toggle_setting":
      if (action.key === "askBeforeSaving")
        return {
          ...state,
          toast: "Vittaz always requires approval before saving AI drafts.",
        };
      return {
        ...state,
        settings: {
          ...state.settings,
          [action.key]: !state.settings[action.key],
        },
      };
    case "set_review_digest":
      return {
        ...state,
        settings: { ...state.settings, reviewDigest: action.value },
      };
    case "set_chat_input":
      return { ...state, chatInput: action.value };
    case "send_chat":
      return startChat(state, state.chatInput);
    case "send_chat_text":
      return startChat(state, action.text);
    case "attach_mock":
      return startChat(state, MOCK_ATTACHMENTS[action.kind]);
    case "advance_chat":
      return advanceChat(state);
    case "clear_chat":
      return {
        ...state,
        chatMessages: [],
        chatSteps: [],
        chatMode: "idle",
        chatProposalId: null,
        chatIntent: null,
        chatRemoved: [],
        chatTelegramPreview: null,
      };
    case "finish_chat_thinking":
      return finishChatThinking(state);
    case "set_quick_input":
      return { ...state, quickInput: action.value };
    case "analyze_quick":
      return analyzeQuick(state);
    case "improve_note":
      return improveNote(state);
    case "use_improved_note":
      return state.improvedNote
        ? {
            ...state,
            addDraft: { ...state.addDraft, note: state.improvedNote },
            improvedNote: null,
          }
        : state;
    case "keep_note":
      return { ...state, improvedNote: null };
    case "set_onboarding_step":
      return {
        ...state,
        onboardingStep: action.step,
        screen: ONBOARDING_SCREENS[action.step],
      };
    case "finish_onboarding":
      return { ...state, screen: "chat", previousScreen: "chat" };
    case "show_toast":
      return { ...state, toast: action.message };
    case "clear_toast":
      return { ...state, toast: null };
    default:
      return state;
  }
}
