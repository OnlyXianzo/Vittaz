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
import * as SecureStore from "expo-secure-store";
import {
  create_mobile_qa_agent,
  mobile_qa_failure_message,
} from "./assistant/mobile_qa";
import type { MobileQaProviderKind, QaStopReason } from "./assistant/mobile_qa";
import { mobile_diagnostics } from "./assistant/diagnostics";
import type {
  DiagnosticFailureStage,
  DiagnosticReason,
} from "./assistant/diagnostics";
import {
  read_anthropic_api_key,
  read_assistant_provider_profile,
  read_kilo_key,
  read_openai_compatible_key,
} from "./assistant/secure_key";
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
      return state;
    case "add_transaction":
    case "approve":
    case "reject":
      return state;
  }
}

function error_message(error: unknown): string {
  return error instanceof Error ? error.message : "storage_operation_failed";
}

function diagnostic_reason_for_stop(reason: QaStopReason): DiagnosticReason {
  switch (reason) {
    case "completed":
      return "ok";
    case "message_rejected":
    case "provider_request_rejected":
      return "request_rejected";
    case "sensitive_dropped":
      return "sensitive_input_blocked";
    case "provider_auth_failed":
      return "unauthorized";
    case "provider_rate_limited":
      return "rate_limited";
    case "provider_connection_failed":
      return "connection_error";
    case "provider_unavailable":
      return "provider_unavailable";
    case "provider_access_denied":
      return "access_denied";
    case "provider_http_error":
      return "provider_http_error";
    case "provider_protocol_error":
      return "protocol_error";
    case "provider_error":
      return "provider_error";
    case "tool_rejected":
      return "tool_rejected";
    case "step_limit":
      return "step_limit";
    case "token_budget":
      return "token_budget";
    case "timeout":
      return "timeout";
    case "aborted":
      return "cancelled";
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(default_state);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const store_ref = useRef<LedgerStore | null>(null);
  const mounted_ref = useRef(true);
  const request_ref = useRef<AbortController | null>(null);
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
    mobile_diagnostics.record("app_started", "app", "completed");
    mobile_diagnostics.record(
      "provider_profile_read_started",
      "secure_store",
      "started",
    );
    void read_assistant_provider_profile(SecureStore)
      .then((profile) => {
        mobile_diagnostics.record(
          "provider_profile_read_succeeded",
          "secure_store",
          "completed",
          profile.selected_provider,
          "ok",
        );
        if (!mounted_ref.current) return;
        setState((current) => ({
          ...current,
          model:
            profile.selected_provider === "openai_compatible"
              ? "openai-compatible"
              : profile.selected_provider === "anthropic"
                ? "claude"
                : "auto",
        }));
      })
      .catch(() => {
        mobile_diagnostics.record(
          "provider_profile_read_failed",
          "secure_store",
          "failed",
          undefined,
          "secure_store_error",
        );
      });
    mobile_diagnostics.record("ledger_open_started", "ledger", "started");
    void openMobileLedgerStore()
      .then(async (store) => {
        mobile_diagnostics.record(
          "ledger_open_succeeded",
          "ledger",
          "completed",
        );
        if (!mounted_ref.current) {
          await store.close();
          return;
        }
        store_ref.current = store;
        await refresh(store);
        setReady(true);
      })
      .catch((reason: unknown) => {
        mobile_diagnostics.record(
          "ledger_open_failed",
          "ledger",
          "failed",
          undefined,
          "local_storage_error",
        );
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
      request_ref.current?.abort();
      request_ref.current = null;
      const store = store_ref.current;
      store_ref.current = null;
      if (store) void store.close();
    };
  }, [refresh]);

  const dispatch = useCallback<Dispatch<Action>>(
    (action) => {
      const store = store_ref.current;
      if (
        action.type === "send_chat" ||
        action.type === "send_chat_text" ||
        action.type === "analyze_quick"
      ) {
        if (state_ref.current.chatMode === "thinking") return;
        if (!store) {
          setState((current) => toast(current, "Local database is not ready."));
          return;
        }
        const current = state_ref.current;
        const question =
          action.type === "send_chat"
            ? current.chatInput.trim()
            : action.type === "send_chat_text"
              ? action.text.trim()
              : current.quickInput.trim();
        if (!question) {
          mobile_diagnostics.record(
            "question_rejected",
            "request_preflight",
            "rejected",
            undefined,
            "invalid_question",
          );
          setState((value) => toast(value, "Enter a question first."));
          return;
        }
        const user_id = `chat_user_${current.sequence}`;
        const assistant_id = `chat_assistant_${current.sequence + 1}`;
        const controller = new AbortController();
        request_ref.current?.abort();
        request_ref.current = controller;
        setState((value) => ({
          ...value,
          previousScreen:
            value.screen === "chat" ? value.previousScreen : value.screen,
          screen: "chat",
          chatMode: "thinking",
          chatInput: "",
          chatQuestion: question,
          chatSteps: [],
          toast: null,
          sequence: value.sequence + 2,
          chatMessages: [
            ...value.chatMessages,
            { id: user_id, role: "user", text: question },
            { id: assistant_id, role: "assistant", text: "" },
          ],
        }));
        let provider_kind: MobileQaProviderKind =
          state_ref.current.model === "openai-compatible"
            ? "openai_compatible"
            : state_ref.current.model === "claude"
              ? "anthropic"
              : "kilo";
        mobile_diagnostics.record(
          "question_accepted",
          "request_preflight",
          "completed",
          provider_kind,
          "ok",
        );
        let failure_stage: DiagnosticFailureStage = "context_build";
        void (async () => {
          let streamed_answer = "";
          mobile_diagnostics.record(
            "provider_profile_read_started",
            "secure_store",
            "started",
          );
          let profile;
          try {
            profile = await read_assistant_provider_profile(SecureStore);
          } catch (error) {
            mobile_diagnostics.record(
              "provider_profile_read_failed",
              "secure_store",
              "failed",
              provider_kind,
              "secure_store_error",
            );
            throw error;
          }
          provider_kind = profile.selected_provider;
          mobile_diagnostics.record(
            "provider_profile_read_succeeded",
            "secure_store",
            "completed",
            provider_kind,
            "ok",
          );
          mobile_diagnostics.record(
            "secure_credential_read_started",
            "secure_store",
            "started",
            provider_kind,
          );
          let provider: Parameters<typeof create_mobile_qa_agent>[1];
          try {
            provider =
              profile.selected_provider === "openai_compatible"
                ? {
                    kind: "openai_compatible" as const,
                    api_key:
                      (await read_openai_compatible_key(SecureStore)) ?? "",
                    base_url: profile.base_url,
                    model: profile.model,
                  }
                : profile.selected_provider === "anthropic"
                  ? {
                      kind: "anthropic" as const,
                      api_key: (await read_anthropic_api_key(SecureStore)) ?? "",
                    }
                  : {
                      kind: "kilo" as const,
                      api_key: await read_kilo_key(SecureStore),
                    };
          } catch (error) {
            mobile_diagnostics.record(
              "secure_credential_read_failed",
              "secure_store",
              "failed",
              provider_kind,
              "secure_store_error",
            );
            throw error;
          }
          mobile_diagnostics.record(
            "secure_credential_read_succeeded",
            "secure_store",
            "completed",
            provider_kind,
            "ok",
            undefined,
            undefined,
            undefined,
            provider.api_key ? 1 : 0,
          );
          const missing_provider_setup =
            provider.kind === "openai_compatible" && !provider.api_key
              ? "No OpenAI-compatible API key is saved. Add one in Model settings. No ledger changes were made."
              : provider.kind === "openai_compatible" &&
                  (!provider.base_url || !provider.model)
                ? "Complete the HTTPS endpoint and model in Model settings before asking. No ledger changes were made."
                : provider.kind === "anthropic" && !provider.api_key
                  ? "No Anthropic API key is saved. Add one in Model settings. No ledger changes were made."
                  : null;
          if (missing_provider_setup) {
            mobile_diagnostics.record(
              "question_rejected",
              "request_preflight",
              "rejected",
              provider_kind,
              provider.kind === "openai_compatible" && !provider.api_key
                ? "missing_credential"
                : "invalid_provider_config",
            );
            if (mounted_ref.current) {
              setState((value) => ({
                ...value,
                chatMode: "idle",
                chatMessages: value.chatMessages.map((message) =>
                  message.id === assistant_id
                    ? { ...message, text: missing_provider_setup }
                    : message,
                ),
              }));
            }
            return;
          }
          failure_stage = "agent_create";
          mobile_diagnostics.record(
            "qa_agent_create_started",
            "qa_agent",
            "started",
            provider_kind,
          );
          const agent = create_mobile_qa_agent(store, provider);
          mobile_diagnostics.record(
            "qa_agent_create_succeeded",
            "qa_agent",
            "completed",
            provider_kind,
            "ok",
          );
          failure_stage = "provider_call";
          mobile_diagnostics.record(
            "qa_started",
            "qa_agent",
            "started",
            provider_kind,
          );
          const result = await agent.answerQuestion(question, {
            signal: controller.signal,
            onValidatedChunk: (chunk: string) => {
              streamed_answer += chunk;
              if (mounted_ref.current) {
                setState((value) => ({
                  ...value,
                  chatMessages: value.chatMessages.map((message) =>
                    message.id === assistant_id
                      ? { ...message, text: streamed_answer }
                      : message,
                  ),
                }));
              }
            },
          });
          mobile_diagnostics.record(
            "qa_result_received",
            "qa_agent",
            result.answered ? "completed" : "failed",
            provider_kind,
            diagnostic_reason_for_stop(result.stopReason),
            undefined,
            undefined,
            undefined,
            result.stepsUsed,
          );
          if (!result.answered || !result.answer) {
            if (mounted_ref.current) {
              setState((value) => ({
                ...value,
                chatMode: "idle",
                chatMessages: value.chatMessages.map((message) =>
                  message.id === assistant_id
                    ? {
                        ...message,
                        text: mobile_qa_failure_message(
                          result.stopReason,
                          provider_kind,
                        ),
                      }
                    : message,
                ),
              }));
            }
            return;
          }
          const tool_copy: Record<string, { label: string; detail: string }> = {
            get_month_summary: {
              label: "Checked this month's totals",
              detail: "Read-only ledger summary",
            },
            query_transactions: {
              label: "Reviewed ledger entries",
              detail: "Read-only transaction list",
            },
            find_person: {
              label: "Checked a ledger contact",
              detail: "Read-only contact lookup",
            },
            get_balance: {
              label: "Checked a wallet balance",
              detail: "Read-only wallet summary",
            },
            check_unverified: {
              label: "Checked entries pending review",
              detail: "Read-only pending list",
            },
          };
          const steps = result.toolsUsed
            .filter((tool) =>
              Object.prototype.hasOwnProperty.call(tool_copy, tool),
            )
            .map((tool) => ({
              label: tool_copy[tool]!.label,
              detail: tool_copy[tool]!.detail,
              tool,
              state: "done" as const,
            }));
          if (mounted_ref.current) {
            setState((value) => ({
              ...value,
              chatMode: "idle",
              chatSteps: steps,
              chatMessages: value.chatMessages.map((message) =>
                message.id === assistant_id
                  ? { ...message, text: streamed_answer || result.answer! }
                  : message,
              ),
            }));
          }
        })()
          .catch(() => {
            mobile_diagnostics.record(
              "qa_stage_failed",
              failure_stage === "context_build"
                ? "secure_store"
                : failure_stage === "agent_create"
                  ? "qa_agent"
                  : "qa_loop",
              "failed",
              provider_kind,
              controller.signal.aborted
                ? "cancelled"
                : failure_stage === "context_build"
                  ? "secure_store_error"
                  : failure_stage === "agent_create"
                    ? "langchain_error"
                    : "provider_error",
              undefined,
              undefined,
              undefined,
              undefined,
              failure_stage,
            );
            if (!mounted_ref.current) return;
            setState((value) => ({
              ...value,
              chatMode: "idle",
              chatMessages: value.chatMessages.map((message) =>
                message.id === assistant_id
                  ? {
                      ...message,
                      text: mobile_qa_failure_message(
                        "provider_error",
                        provider_kind,
                      ),
                    }
                  : message,
              ),
            }));
          })
          .finally(() => {
            if (request_ref.current === controller) request_ref.current = null;
          });
        return;
      }
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
