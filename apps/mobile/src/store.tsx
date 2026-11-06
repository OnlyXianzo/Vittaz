import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Dispatch, ReactNode } from "react";
import {
  approveProposal,
  createManualTransaction,
  parseRupeesToPaise,
  rejectProposal,
} from "@vittaz/core";
import type { LedgerStore, ProposalRow, TransactionRow } from "@vittaz/core";
import type { Action, AppState, Transaction } from "./domain";
import { mobileLedgerRuntime } from "./ledger_runtime";
import { openMobileLedgerStore } from "./storage/open_ledger_store";

interface Store {
  state: AppState;
  dispatch: Dispatch<Action>;
  ready: boolean;
  error: string | null;
}

const StoreContext = createContext<Store | null>(null);

const default_state: AppState = {
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

function map_transaction(row: TransactionRow): Transaction {
  const date = new Date(row.occurred_at);
  return {
    id: row.id,
    title: row.counterparty_name ?? row.category,
    amountPaise: row.amount_paise,
    direction:
      row.split_owed_paise > 0
        ? "lent"
        : row.direction === "credit"
          ? "received"
          : "spent",
    category: row.category,
    mode: row.wallet_id === "cash" ? "Cash" : "UPI",
    person: row.counterparty_name ?? undefined,
    splitOwedPaise: row.split_owed_paise,
    note: row.note ?? "",
    status: row.status,
    day: Number.isNaN(date.valueOf())
      ? row.occurred_at
      : date.toLocaleDateString(),
    time: Number.isNaN(date.valueOf()) ? "" : date.toLocaleTimeString(),
    source: row.source,
    color: "#b8f23c",
  };
}

function map_proposal(row: ProposalRow): Transaction {
  const date = new Date(row.occurred_at);
  return {
    id: row.id,
    title: row.counterparty_name ?? row.category,
    amountPaise: row.amount_paise,
    direction:
      row.split_owed_paise > 0
        ? "lent"
        : row.direction === "credit"
          ? "received"
          : "spent",
    category: row.category,
    mode: row.wallet_id === "cash" ? "Cash" : "UPI",
    person: row.counterparty_name ?? undefined,
    splitOwedPaise: row.split_owed_paise,
    note: row.note ?? "",
    status: "unverified",
    day: Number.isNaN(date.valueOf())
      ? row.occurred_at
      : date.toLocaleDateString(),
    time: Number.isNaN(date.valueOf()) ? "" : date.toLocaleTimeString(),
    source: row.source,
    color: "#b8f23c",
  };
}

async function read_rows(store: LedgerStore) {
  return store.read(async (repos) => {
    const [transactions, proposals] = await Promise.all([
      repos.transactions.list(),
      repos.proposals.list(),
    ]);
    return [
      ...transactions.map(map_transaction),
      ...proposals.filter((row) => row.status === "pending").map(map_proposal),
    ];
  });
}

function toast(state: AppState, message: string): AppState {
  return { ...state, toast: message };
}

/** Local presentation state only. Ledger mutations always go through core. */
function view_reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "navigate":
      return {
        ...state,
        previousScreen: state.screen,
        screen: action.screen,
      };
    case "back":
      return { ...state, screen: state.previousScreen, previousScreen: "home" };
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
          (row) => row.id === id && row.status !== "user_confirmed",
        ),
      );
      return first
        ? {
            ...state,
            reviewId: first,
            previousScreen: "inbox",
            screen: "review",
          }
        : toast(state, "Select at least one pending entry.");
    }
    case "select_model":
      return { ...state, model: action.model };
    case "toggle_setting":
      if (action.key === "askBeforeSaving")
        return toast(
          state,
          "Vittaz always requires approval before saving drafts.",
        );
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
    case "set_quick_input":
      return { ...state, quickInput: action.value };
    case "improve_note": {
      const cleaned = state.addDraft.note.trim().replace(/\s+/g, " ");
      return { ...state, improvedNote: cleaned || null };
    }
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
        screen: (
          ["onboarding-welcome", "onboarding-how", "onboarding-ai"] as const
        )[action.step],
      };
    case "finish_onboarding":
      return { ...state, screen: "home", onboardingStep: 2 };
    case "show_toast":
      return toast(state, action.message);
    case "clear_toast":
    case "finish_chat_thinking":
      return {
        ...state,
        toast: action.type === "clear_toast" ? null : state.toast,
      };
    case "send_chat":
    case "send_chat_text":
    case "analyze_quick":
      return toast(
        state,
        "Assistant capture is not connected yet. Use Add transaction to save a ledger entry.",
      );
    case "add_transaction":
    case "approve":
    case "reject":
      return state;
  }
}

function error_message(error: unknown): string {
  return error instanceof Error ? error.message : "storage_operation_failed";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(default_state);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const store_ref = useRef<LedgerStore | null>(null);
  const mounted_ref = useRef(true);
  const state_ref = useRef(state);
  useEffect(() => {
    state_ref.current = state;
  }, [state]);

  const refresh = useCallback(async (store: LedgerStore) => {
    const transactions = await read_rows(store);
    if (mounted_ref.current)
      setState((current) => ({ ...current, transactions }));
  }, []);

  useEffect(() => {
    mounted_ref.current = true;
    void openMobileLedgerStore()
      .then(async (store) => {
        if (!mounted_ref.current) {
          await store.close();
          return;
        }
        store_ref.current = store;
        await refresh(store);
        setReady(true);
      })
      .catch((reason: unknown) => {
        if (!mounted_ref.current) return;
        const message = error_message(reason);
        setError(message);
        setState((current) =>
          toast(current, `Local database error: ${message}`),
        );
        setReady(true);
      });
    return () => {
      mounted_ref.current = false;
      const store = store_ref.current;
      store_ref.current = null;
      if (store) void store.close();
    };
  }, [refresh]);

  const dispatch = useCallback<Dispatch<Action>>(
    (action) => {
      const store = store_ref.current;
      if (action.type === "add_transaction") {
        if (!store) {
          setState((current) => toast(current, "Local database is not ready."));
          return;
        }
        setState((current) => toast(current, "Saving on this device…"));
        void (async () => {
          const draft = state_ref.current.addDraft;
          const amount_paise = parseRupeesToPaise(draft.amount);
          if (draft.direction === "lent" && !draft.person.trim())
            throw new Error("person_required_for_lent_entry");
          await createManualTransaction(
            store,
            {
              amountPaise: amount_paise,
              direction: draft.direction === "received" ? "credit" : "debit",
              splitOwedPaise: draft.direction === "lent" ? amount_paise : 0,
              category: draft.category,
              counterpartyName: draft.person.trim() || null,
              note: draft.note.trim() || null,
              walletId: draft.mode === "Cash" ? "cash" : "bank_default",
            },
            mobileLedgerRuntime,
          );
          await refresh(store);
          if (mounted_ref.current) {
            setState((current) => ({
              ...current,
              addDraft: {
                ...current.addDraft,
                amount: "",
                person: "",
                note: "",
              },
              toast: "Saved to this device.",
            }));
          }
        })().catch((reason: unknown) => {
          if (mounted_ref.current)
            setState((current) => toast(current, error_message(reason)));
        });
        return;
      }
      if (action.type === "approve" || action.type === "reject") {
        if (!store) {
          setState((current) => toast(current, "Local database is not ready."));
          return;
        }
        void (async () => {
          if (action.type === "approve")
            await approveProposal(store, action.id, {}, mobileLedgerRuntime);
          else await rejectProposal(store, action.id);
          await refresh(store);
          if (mounted_ref.current) {
            setState((current) => ({
              ...current,
              reviewId:
                current.reviewId === action.id ? null : current.reviewId,
              selectedInboxIds: current.selectedInboxIds.filter(
                (id) => id !== action.id,
              ),
              screen: current.screen === "review" ? "inbox" : current.screen,
              toast:
                action.type === "approve"
                  ? "Approved and saved to this device."
                  : "Proposal rejected.",
            }));
          }
        })().catch((reason: unknown) => {
          if (mounted_ref.current)
            setState((current) => toast(current, error_message(reason)));
        });
        return;
      }
      setState((current) => view_reducer(current, action));
    },
    [refresh],
  );

  useEffect(() => {
    if (!state.toast) return;
    const timer = setTimeout(
      () => setState((current) => ({ ...current, toast: null })),
      3200,
    );
    return () => clearTimeout(timer);
  }, [state.toast]);

  return (
    <StoreContext.Provider value={{ state, dispatch, ready, error }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useApp(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useApp must be used inside <AppProvider>");
  return store;
}
