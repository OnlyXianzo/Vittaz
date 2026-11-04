// @vittaz/core — deterministic finance logic, schema, privacy guards
// no UI, no AI frameworks

export const VERSION = "0.0.1" as const;

export {
  MoneyValidationError,
  assertIntegerPaise,
  assertNonNegativePaise,
  assertPositivePaise,
  formatPaiseToRupees,
  normalizeIndicDigits,
  parseRupeesToPaise,
  sumPaise,
} from "./ledger/money.js";

export type {
  TransactionDirection,
  TransactionEventType,
  TransactionStatus,
  ProposalStatus,
  ProposalRow,
  TransactionRow,
  AuditLogRow,
  WalletRow,
  ReadRepository,
  WriteRepository,
  ReadLedgerRepositories,
  LedgerRepositories,
  LedgerStore,
} from "./ledger/repositories.js";
export {
  LedgerError,
  InvalidStatusTransitionError,
  defaultLedgerRuntime,
  createManualTransaction,
  insertAutoCapturedTransaction,
  getTransaction,
  transitionTransactionStatus,
} from "./ledger/ledger.js";
export type {
  LedgerRuntime,
  CreateManualTransactionInput,
  AutoCapturedTransactionInput,
  TransactionWriteResult,
} from "./ledger/ledger.js";
export {
  createProposal,
  getProposal,
  approveProposal,
  batchApproveProposals,
  rejectProposal,
} from "./ledger/approval.js";
export type {
  CreateProposalInput,
  ApproveProposalResult,
} from "./ledger/approval.js";
export { updateTransaction, undoAuditEntry } from "./ledger/audit.js";
export type { UpdateTransactionPatch } from "./ledger/audit.js";
export {
  createWallet,
  setWalletOpeningBalance,
  getWalletSummary,
} from "./ledger/wallet.js";
export type { WalletSummary } from "./ledger/wallet.js";
export { calculateDailyAllowance, getDaysInMonth } from "./ledger/allowance.js";
export type {
  DailyAllowanceInput,
  DailyAllowanceResult,
} from "./ledger/allowance.js";
export {
  checkSensitiveMessage,
  withNonSensitiveMessage,
} from "./privacy/sensitiveFilter.js";
export type {
  SensitiveReason,
  SensitiveCheckResult,
} from "./privacy/sensitiveFilter.js";
export { PrivacyRedactor } from "./privacy/redactor.js";
export type { NameMapping } from "./privacy/redactor.js";
export { scrubOutboundText } from "./privacy/scrubber.js";
export {
  SecretSanitizer,
  SafeLogger,
  CrashReporter,
} from "./privacy/safeTelemetry.js";
export type { LogEntry, CrashReport } from "./privacy/safeTelemetry.js";
