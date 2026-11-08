export type Screen =
  | "home"
  | "inbox"
  | "review"
  | "ledger"
  | "people"
  | "settings"
  | "add"
  | "quick"
  | "chat"
  | "models"
  | "onboarding-welcome"
  | "onboarding-how"
  | "onboarding-ai";

export type Direction = "spent" | "received" | "lent";
export type TransactionStatus = "user_confirmed" | "unverified" | "ai_checked";
export type Mode = "Cash" | "UPI" | "Card" | "SMS";
export type LedgerFilter = "all" | "cash" | "upi" | "unverified";
export type InboxFilter = "all" | "upi" | "sms";
export type ModelId =
  | "auto"
  | "openai-compatible"
  | "qwen-1.5b"
  | "qwen-3b"
  | "claude"
  | "gemini"
  | "free";
export type ChatMode = "idle" | "thinking" | "approval";

export interface Transaction {
  id: string;
  title: string;
  amountPaise: number;
  direction: Direction;
  category: string;
  mode: Mode;
  person?: string;
  splitOwedPaise?: number;
  note: string;
  status: TransactionStatus;
  day: string;
  time: string;
  source?: string;
  confidence?: number;
  color: string;
  textColor?: string;
}

export interface Person {
  id: string;
  name: string;
  relation: string;
  balancePaise: number;
  color: string;
}

export interface ChatStep {
  label: string;
  tool: string;
  detail: string;
  state: "done" | "running" | "waiting";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface Settings {
  askBeforeSaving: boolean;
  replaceNames: boolean;
  sendNotesToCloud: boolean;
  reviewDigest: "off" | "once" | "twice";
}

export interface AppState {
  screen: Screen;
  previousScreen: Screen;
  transactions: Transaction[];
  people: Person[];
  ledgerFilter: LedgerFilter;
  inboxFilter: InboxFilter;
  ledgerSearch: string;
  searchOpen: boolean;
  reviewId: string | null;
  selectedInboxIds: string[];
  model: ModelId;
  settings: Settings;
  chatMode: ChatMode;
  chatInput: string;
  chatMessages: ChatMessage[];
  chatSteps: ChatStep[];
  chatProposalId: string | null;
  chatQuestion: string | null;
  quickInput: string;
  quickRecentIds: string[];
  addDraft: AddDraft;
  improvedNote: string | null;
  toast: string | null;
  onboardingStep: 0 | 1 | 2;
  sequence: number;
}

export interface AddDraft {
  amount: string;
  direction: Direction;
  category: string;
  person: string;
  mode: Mode;
  note: string;
}

export type Action =
  | { type: "navigate"; screen: Screen }
  | { type: "back" }
  | { type: "approve"; id: string }
  | { type: "reject"; id: string }
  | { type: "add_transaction" }
  | { type: "update_draft"; patch: Partial<AddDraft> }
  | { type: "set_ledger_filter"; filter: LedgerFilter }
  | { type: "set_inbox_filter"; filter: InboxFilter }
  | { type: "set_ledger_search"; value: string }
  | { type: "toggle_search" }
  | { type: "open_review"; id: string }
  | { type: "toggle_inbox_selected"; id: string }
  | { type: "review_selected" }
  | { type: "select_model"; model: ModelId }
  | {
      type: "toggle_setting";
      key: "askBeforeSaving" | "replaceNames" | "sendNotesToCloud";
    }
  | { type: "set_review_digest"; value: Settings["reviewDigest"] }
  | { type: "set_chat_input"; value: string }
  | { type: "send_chat" }
  | { type: "send_chat_text"; text: string }
  | { type: "finish_chat_thinking" }
  | { type: "set_quick_input"; value: string }
  | { type: "analyze_quick" }
  | { type: "improve_note" }
  | { type: "use_improved_note" }
  | { type: "keep_note" }
  | { type: "set_onboarding_step"; step: 0 | 1 | 2 }
  | { type: "finish_onboarding" }
  | { type: "show_toast"; message: string }
  | { type: "clear_toast" };
