export type TransactionDirection = "debit" | "credit";
export type TransactionEventType = "normal" | "refund" | "reversal";
export type TransactionStatus = "unverified" | "ai_checked" | "user_confirmed";
export type ProposalStatus = "pending" | "approved" | "rejected";

export interface ProposalRow {
  id: string;
  wallet_id: string;
  amount_paise: number;
  direction: TransactionDirection;
  event_type: TransactionEventType;
  category: string;
  counterparty_name: string | null;
  note: string | null;
  source: string;
  initial_tx_status: TransactionStatus;
  status: ProposalStatus;
  committed_tx_id: string | null;
  benefit: string;
  benefit_paise: number;
  tag: string | null;
  tags_json: string;
  split_owed_paise: number;
  occurred_at: string;
  created_at: string;
}

export interface TransactionRow {
  id: string;
  wallet_id: string;
  amount_paise: number;
  direction: TransactionDirection;
  event_type: TransactionEventType;
  category: string;
  counterparty_name: string | null;
  account_last4: string | null;
  dedup_key: string | null;
  note: string | null;
  status: TransactionStatus;
  source: string;
  proposal_id: string | null;
  benefit: string;
  benefit_paise: number;
  tag: string | null;
  tags_json: string;
  import_fingerprint: string | null;
  split_owed_paise: number;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_state: string | null;
  after_state: string | null;
  related_proposal_before: string | null;
  undone: 0 | 1;
  created_at: string;
}

export interface WalletRow {
  id: string;
  name: string;
  kind: "cash" | "bank" | "upi";
  opening_balance_paise: number;
  created_at: string;
}
export interface UnparsedMessageRow {
  id: string;
  app_package: string;
  sanitized_text: string;
  post_time: string;
  reason: string;
  routed_to: "local_parser" | "unparsed_list";
  created_at: string;
}
/** Persisted row ports only. Never expose these write capabilities to AI tools. */
export interface ReadRepository<Row> {
  get(id: string): Promise<Row | null>;
  list(): Promise<Row[]>;
}
export interface WriteRepository<Row> extends ReadRepository<Row> {
  insert(row: Row): Promise<void>;
  replace(row: Row): Promise<void>;
  remove(id: string): Promise<void>;
}
export interface ReadLedgerRepositories {
  wallets: ReadRepository<WalletRow>;
  transactions: ReadRepository<TransactionRow>;
  proposals: ReadRepository<ProposalRow>;
  audit: ReadRepository<AuditLogRow>;
  unparsed_messages: ReadRepository<UnparsedMessageRow>;
}
export interface LedgerRepositories {
  wallets: WriteRepository<WalletRow>;
  transactions: WriteRepository<TransactionRow>;
  proposals: WriteRepository<ProposalRow>;
  audit: WriteRepository<AuditLogRow>;
  unparsed_messages: WriteRepository<UnparsedMessageRow>;
}
/** Await all work; no network calls in a unit. Handles expire after callback. */
export interface LedgerStore {
  read<T>(work: (repos: ReadLedgerRepositories) => Promise<T>): Promise<T>;
  transaction<T>(work: (repos: LedgerRepositories) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
