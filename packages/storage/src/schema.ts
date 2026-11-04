import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type {
  WalletRow,
  TransactionRow,
  ProposalRow,
  AuditLogRow,
} from "@vittaz/core";

// Query mappings only. Versioned SQL migrations own all constraints and indexes.
export const wallets = sqliteTable("wallets", {
  id: text("id").$type<WalletRow["id"]>().notNull().primaryKey(),
  name: text("name").$type<WalletRow["name"]>().notNull(),
  kind: text("kind").$type<WalletRow["kind"]>().notNull(),
  opening_balance_paise: integer("opening_balance_paise")
    .$type<WalletRow["opening_balance_paise"]>()
    .notNull(),
  created_at: text("created_at").$type<WalletRow["created_at"]>().notNull(),
});
export const transactions = sqliteTable("transactions", {
  id: text("id").$type<TransactionRow["id"]>().notNull().primaryKey(),
  wallet_id: text("wallet_id").$type<TransactionRow["wallet_id"]>().notNull(),
  amount_paise: integer("amount_paise")
    .$type<TransactionRow["amount_paise"]>()
    .notNull(),
  direction: text("direction").$type<TransactionRow["direction"]>().notNull(),
  event_type: text("event_type")
    .$type<TransactionRow["event_type"]>()
    .notNull(),
  category: text("category").$type<TransactionRow["category"]>().notNull(),
  counterparty_name:
    text("counterparty_name").$type<TransactionRow["counterparty_name"]>(),
  account_last4: text("account_last4").$type<TransactionRow["account_last4"]>(),
  dedup_key: text("dedup_key").$type<TransactionRow["dedup_key"]>(),
  note: text("note").$type<TransactionRow["note"]>(),
  status: text("status").$type<TransactionRow["status"]>().notNull(),
  source: text("source").$type<TransactionRow["source"]>().notNull(),
  proposal_id: text("proposal_id").$type<TransactionRow["proposal_id"]>(),
  benefit: text("benefit").$type<TransactionRow["benefit"]>().notNull(),
  benefit_paise: integer("benefit_paise")
    .$type<TransactionRow["benefit_paise"]>()
    .notNull(),
  tag: text("tag").$type<TransactionRow["tag"]>(),
  tags_json: text("tags_json").$type<TransactionRow["tags_json"]>().notNull(),
  import_fingerprint:
    text("import_fingerprint").$type<TransactionRow["import_fingerprint"]>(),
  split_owed_paise: integer("split_owed_paise")
    .$type<TransactionRow["split_owed_paise"]>()
    .notNull(),
  occurred_at: text("occurred_at")
    .$type<TransactionRow["occurred_at"]>()
    .notNull(),
  created_at: text("created_at")
    .$type<TransactionRow["created_at"]>()
    .notNull(),
  updated_at: text("updated_at")
    .$type<TransactionRow["updated_at"]>()
    .notNull(),
});
export const proposals = sqliteTable("proposals", {
  id: text("id").$type<ProposalRow["id"]>().notNull().primaryKey(),
  wallet_id: text("wallet_id").$type<ProposalRow["wallet_id"]>().notNull(),
  amount_paise: integer("amount_paise")
    .$type<ProposalRow["amount_paise"]>()
    .notNull(),
  direction: text("direction").$type<ProposalRow["direction"]>().notNull(),
  event_type: text("event_type").$type<ProposalRow["event_type"]>().notNull(),
  category: text("category").$type<ProposalRow["category"]>().notNull(),
  counterparty_name:
    text("counterparty_name").$type<ProposalRow["counterparty_name"]>(),
  note: text("note").$type<ProposalRow["note"]>(),
  source: text("source").$type<ProposalRow["source"]>().notNull(),
  initial_tx_status: text("initial_tx_status")
    .$type<ProposalRow["initial_tx_status"]>()
    .notNull(),
  status: text("status").$type<ProposalRow["status"]>().notNull(),
  committed_tx_id:
    text("committed_tx_id").$type<ProposalRow["committed_tx_id"]>(),
  benefit: text("benefit").$type<ProposalRow["benefit"]>().notNull(),
  benefit_paise: integer("benefit_paise")
    .$type<ProposalRow["benefit_paise"]>()
    .notNull(),
  tag: text("tag").$type<ProposalRow["tag"]>(),
  tags_json: text("tags_json").$type<ProposalRow["tags_json"]>().notNull(),
  split_owed_paise: integer("split_owed_paise")
    .$type<ProposalRow["split_owed_paise"]>()
    .notNull(),
  occurred_at: text("occurred_at")
    .$type<ProposalRow["occurred_at"]>()
    .notNull(),
  created_at: text("created_at").$type<ProposalRow["created_at"]>().notNull(),
});
export const audit_log = sqliteTable("audit_log", {
  id: text("id").$type<AuditLogRow["id"]>().notNull().primaryKey(),
  action: text("action").$type<AuditLogRow["action"]>().notNull(),
  entity_type: text("entity_type")
    .$type<AuditLogRow["entity_type"]>()
    .notNull(),
  entity_id: text("entity_id").$type<AuditLogRow["entity_id"]>().notNull(),
  before_state: text("before_state").$type<AuditLogRow["before_state"]>(),
  after_state: text("after_state").$type<AuditLogRow["after_state"]>(),
  related_proposal_before: text("related_proposal_before").$type<
    AuditLogRow["related_proposal_before"]
  >(),
  undone: integer("undone").$type<AuditLogRow["undone"]>().notNull(),
  created_at: text("created_at").$type<AuditLogRow["created_at"]>().notNull(),
});
export const counterparties = sqliteTable("counterparties", {
  id: text("id").notNull().primaryKey(),
  name: text("name").notNull(),
  placeholder: text("placeholder").notNull(),
  created_at: text("created_at").notNull(),
});
export const app_settings = sqliteTable("app_settings", {
  key: text("key").notNull().primaryKey(),
  value_json: text("value_json").notNull(),
});
