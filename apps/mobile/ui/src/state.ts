import {
  CATEGORY_COLORS,
  SYNTHETIC_PEOPLE,
  SYNTHETIC_TRANSACTIONS,
} from "./data";
import { formatPaise, parseAmountToPaise } from "./money";
import {
  answerQuestion,
  detectPeriod,
  detectQuestion,
  questionSteps,
} from "./answers";
import type { LedgerFacts } from "./answers";
import { selectPending, selectSummary } from "./selectors";
import type { Action, AppState, Screen, Transaction } from "./types";

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
    screen: "home",
    previousScreen: "home",
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
    chatQuestion: null,
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
  // Questions ("who owes me?", "what did I spend in 2 days?") are never drafts.
  if (detectQuestion(input)) return null;
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
  const title = merchantMatch ? merchantMatch[1].trim() : "Draft entry";
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
    next.screen = "inbox";
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
    next.screen = "inbox";
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

function ledgerFacts(state: AppState): LedgerFacts {
  const summary = selectSummary(state);
  const totals = new Map<string, number>();
  for (const t of state.transactions) {
    if (t.status !== "user_confirmed" || t.direction !== "spent") continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amountPaise);
  }
  const pending = selectPending(state);
  const periodKey = detectPeriod(state.chatQuestion ?? "");
  const days =
    periodKey === "today"
      ? ["Today"]
      : periodKey === "yesterday"
        ? ["Yesterday"]
        : ["Today", "Yesterday", "27 Oct"];
  const inWindow = state.transactions.filter(
    (t) => t.status === "user_confirmed" && days.includes(t.day),
  );
  const windowTotals = new Map<string, number>();
  let windowSpent = 0;
  let windowReceived = 0;
  for (const t of inWindow) {
    if (t.direction === "received") {
      windowReceived += t.amountPaise;
      continue;
    }
    windowSpent += t.amountPaise;
    windowTotals.set(
      t.category,
      (windowTotals.get(t.category) ?? 0) + t.amountPaise,
    );
  }
  return {
    spentPaise: summary.spentPaise,
    receivedPaise: summary.receivedPaise,
    cashPaise: summary.cashPaise,
    pendingCount: pending.length,
    pendingTitles: pending.slice(0, 3).map((t) => t.title),
    categories: [...totals]
      .map(([name, paise]) => ({ name, paise }))
      .sort((a, b) => b.paise - a.paise),
    owedToYou: state.people
      .filter((p) => p.balancePaise > 0)
      .map((p) => ({ name: p.name, paise: p.balancePaise })),
    youOwe: state.people
      .filter((p) => p.balancePaise < 0)
      .map((p) => ({ name: p.name, paise: -p.balancePaise })),
    period: {
      label:
        periodKey === "today"
          ? "today"
          : periodKey === "yesterday"
            ? "yesterday"
            : "in the last few days",
      spentPaise: windowSpent,
      receivedPaise: windowReceived,
      count: inWindow.length,
      categories: [...windowTotals]
        .map(([name, paise]) => ({ name, paise }))
        .sort((a, b) => b.paise - a.paise),
    },
  };
}

/**
 * One path for chat and for the message screen: a question is answered from the
 * ledger, a payment becomes a draft. Neither requires the other's shape.
 */
function startMessage(
  state: AppState,
  rawText: string,
  from: "chat" | "quick",
): AppState {
  const text = rawText.trim();
  if (!text)
    return {
      ...state,
      toast:
        from === "quick"
          ? "Type a message or a question, for example: Who owes me?"
          : "Type a message first.",
    };

  const kind = detectQuestion(text);
  const proposal = kind
    ? null
    : makeProposal(state, text, from === "quick" ? "quick" : "chat");
  const userMessage = {
    id: `msg_${state.sequence}`,
    role: "user" as const,
    text,
  };
  const shared = {
    ...state,
    chatInput: "",
    quickInput: from === "quick" ? "" : state.quickInput,
    screen: "chat" as const,
    previousScreen:
      from === "quick" ? ("quick" as const) : state.previousScreen,
  };

  if (proposal) {
    return {
      ...shared,
      transactions: [proposal, ...state.transactions],
      sequence: state.sequence + 2,
      chatMode: "approval",
      chatProposalId: proposal.id,
      chatQuestion: null,
      chatMessages: [
        ...state.chatMessages,
        userMessage,
        {
          id: `msg_${state.sequence + 1}`,
          role: "assistant",
          text: "I drafted this entry. Nothing is saved until you approve it.",
        },
      ],
      chatSteps: [
        {
          label: "Read your message",
          tool: "parse_entry",
          detail: "Demo parser",
          state: "done",
        },
        {
          label: "Drafted an entry",
          tool: "propose_transaction",
          detail: "Waiting for your approval",
          state: "waiting",
        },
      ],
    };
  }

  return {
    ...shared,
    sequence: state.sequence + 1,
    chatMode: "thinking",
    chatProposalId: null,
    chatQuestion: text,
    chatMessages: [...state.chatMessages, userMessage],
    chatSteps: questionSteps(kind ?? "help"),
  };
}

function finishChatThinking(state: AppState): AppState {
  if (state.chatMode !== "thinking") return state;
  const facts = ledgerFacts(state);
  const question = state.chatQuestion ?? "";
  return {
    ...state,
    chatMode: "idle",
    chatSteps: state.chatSteps.map((s) => ({
      ...s,
      state: "done",
      detail:
        s.state === "running"
          ? s.tool === "check_unverified"
            ? `${facts.pendingCount} pending`
            : "Done"
          : s.detail,
    })),
    chatMessages: [
      ...state.chatMessages,
      {
        id: `msg_${state.sequence}`,
        role: "assistant",
        text: answerQuestion(question, facts),
      },
    ],
    sequence: state.sequence + 1,
  };
}

function analyzeQuick(state: AppState): AppState {
  const next = startMessage(state, state.quickInput, "quick");
  if (!next.chatProposalId) return next;
  return {
    ...next,
    quickRecentIds: [next.chatProposalId, ...state.quickRecentIds].slice(0, 5),
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
      return { ...state, screen: state.previousScreen, previousScreen: "home" };
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
      return startMessage(state, state.chatInput, "chat");
    case "send_chat_text":
      return startMessage(state, action.text, "chat");
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
      return { ...state, screen: "home", previousScreen: "onboarding-ai" };
    case "show_toast":
      return { ...state, toast: action.message };
    case "clear_toast":
      return { ...state, toast: null };
    default:
      return state;
  }
}
