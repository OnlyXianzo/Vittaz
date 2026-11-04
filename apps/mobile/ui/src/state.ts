import {
  CATEGORY_COLORS,
  SYNTHETIC_PEOPLE,
  SYNTHETIC_TRANSACTIONS,
} from "./data";
import { formatPaise, parseAmountToPaise } from "./money";
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
  const amountMatch = input.match(/(?:₹\s*)?(\d+(?:\.\d{1,2})?)/);
  const amountPaise = amountMatch ? parseAmountToPaise(amountMatch[1]) : null;
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

function sendChat(state: AppState): AppState {
  const text = state.chatInput.trim();
  if (!text) return { ...state, toast: "Type a message first." };
  const userMessage = {
    id: `msg_${state.sequence}`,
    role: "user" as const,
    text,
  };
  const proposal = makeProposal(state, text, "chat");
  if (proposal) {
    return {
      ...state,
      transactions: [proposal, ...state.transactions],
      sequence: state.sequence + 2,
      chatInput: "",
      chatMode: "approval",
      chatProposalId: proposal.id,
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
    ...state,
    sequence: state.sequence + 1,
    chatInput: "",
    chatMode: "thinking",
    chatMessages: [...state.chatMessages, userMessage],
    chatSteps: [
      {
        label: "Searched the preview ledger",
        tool: "query_transactions",
        detail: "Synthetic rows",
        state: "done",
      },
      {
        label: "Added them up",
        tool: "sum_by_category",
        detail: "Deterministic demo sum",
        state: "done",
      },
      {
        label: "Checking unverified entries",
        tool: "check_unverified",
        detail: "Running",
        state: "running",
      },
    ],
  };
}

function finishChatThinking(state: AppState): AppState {
  if (state.chatMode !== "thinking") return state;
  const foodPaise = state.transactions
    .filter(
      (t) =>
        t.status === "user_confirmed" &&
        t.direction === "spent" &&
        t.category === "Food",
    )
    .reduce((sum, t) => sum + t.amountPaise, 0);
  const pending = state.transactions.filter(
    (t) => t.status !== "user_confirmed",
  ).length;
  return {
    ...state,
    chatMode: "idle",
    chatSteps: state.chatSteps.map((s) => ({
      ...s,
      state: "done",
      detail: s.state === "running" ? `${pending} pending` : s.detail,
    })),
    chatMessages: [
      ...state.chatMessages,
      {
        id: `msg_${state.sequence}`,
        role: "assistant",
        text: `In this synthetic preview, confirmed food entries total ${formatPaise(foodPaise)}. ${pending} entries still need review.`,
      },
    ],
    sequence: state.sequence + 1,
  };
}

function analyzeQuick(state: AppState): AppState {
  const text = state.quickInput.trim();
  const proposal = makeProposal(state, text, "quick");
  if (!proposal)
    return {
      ...state,
      toast: "Include an amount, for example: I spent 299 on Zomato.",
    };
  return {
    ...state,
    transactions: [proposal, ...state.transactions],
    sequence: state.sequence + 2,
    quickInput: "",
    quickRecentIds: [proposal.id, ...state.quickRecentIds].slice(0, 5),
    screen: "chat",
    previousScreen: "quick",
    chatMode: "approval",
    chatProposalId: proposal.id,
    chatMessages: [
      { id: `msg_${state.sequence}`, role: "user", text },
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
      return sendChat(state);
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
