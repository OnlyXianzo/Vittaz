import { assertNonNegativePaise, assertPositivePaise } from "./money.js";
import type {
  LedgerRepositories,
  LedgerStore,
  TransactionDirection,
  TransactionEventType,
  TransactionRow,
  TransactionStatus,
} from "./repositories.js";

export class LedgerError extends Error {
  constructor(
    message: string,
    public readonly code = "LEDGER_ERROR",
  ) {
    super(message);
    this.name = "LedgerError";
  }
}
export class InvalidStatusTransitionError extends LedgerError {
  constructor(from: string, to: string) {
    super(
      `Invalid status transition from "${from}" to "${to}". Allowed: unverified -> ai_checked -> user_confirmed.`,
      "INVALID_STATUS_TRANSITION",
    );
    this.name = "InvalidStatusTransitionError";
  }
}
export interface LedgerRuntime {
  now(): string;
  makeId(prefix: string): string;
}
export const defaultLedgerRuntime: LedgerRuntime = {
  now: () => new Date().toISOString(),
  makeId: (prefix) => `${prefix}_${globalThis.crypto.randomUUID()}`,
};
export interface CreateManualTransactionInput {
  walletId?: string;
  amountPaise: number;
  direction: TransactionDirection;
  eventType?: TransactionEventType;
  category?: string;
  counterpartyName?: string | null;
  accountLast4?: string | null;
  note?: string | null;
  benefit?: string;
  tags?: string[];
  splitOwedPaise?: number;
  benefitPaise?: number;
  tag?: string | null;
  occurredAt?: string;
}
export interface AutoCapturedTransactionInput extends CreateManualTransactionInput {
  occurredAt: string;
  dedupKey?: string | null;
  source?: string;
  importFingerprint?: string | null;
}
export interface TransactionWriteResult {
  transaction: TransactionRow;
  auditId: string;
}
export async function writeTransactionAudit(
  repos: LedgerRepositories,
  runtime: LedgerRuntime,
  action: string,
  before: TransactionRow | null,
  after: TransactionRow,
): Promise<string> {
  const id = runtime.makeId("aud");
  await repos.audit.insert({
    id,
    action,
    entity_type: "transaction",
    entity_id: after.id,
    before_state: before === null ? null : JSON.stringify(before),
    after_state: JSON.stringify(after),
    related_proposal_before: null,
    undone: 0,
    created_at: after.updated_at,
  });
  return id;
}
function validateInput(input: CreateManualTransactionInput) {
  assertPositivePaise(input.amountPaise, "amountPaise");
  assertNonNegativePaise(input.splitOwedPaise ?? 0, "splitOwedPaise");
  assertNonNegativePaise(input.benefitPaise ?? 0, "benefitPaise");
  if (input.direction !== "debit" && input.direction !== "credit")
    throw new LedgerError("Invalid direction", "INVALID_DIRECTION");
  if (
    input.eventType !== undefined &&
    !["normal", "refund", "reversal"].includes(input.eventType)
  )
    throw new LedgerError("Invalid eventType", "INVALID_EVENT_TYPE");
}
async function createTransaction(
  store: LedgerStore,
  input: CreateManualTransactionInput & Partial<AutoCapturedTransactionInput>,
  captured: boolean,
  runtime: LedgerRuntime,
): Promise<TransactionWriteResult> {
  validateInput(input);
  const now = runtime.now();
  const source = captured ? (input.source ?? "notification") : "manual";
  const row: TransactionRow = {
    id: runtime.makeId("tx"),
    wallet_id: input.walletId ?? (captured ? "bank_default" : "cash"),
    amount_paise: input.amountPaise,
    direction: input.direction,
    event_type: input.eventType ?? "normal",
    category: input.category ?? "uncategorized",
    counterparty_name: input.counterpartyName ?? null,
    account_last4: input.accountLast4 ?? null,
    note: input.note ?? null,
    status: captured ? "unverified" : "user_confirmed",
    source,
    proposal_id: null,
    dedup_key: captured ? (input.dedupKey ?? null) : null,
    benefit: input.benefit ?? "self",
    tags_json: JSON.stringify(input.tags ?? []),
    split_owed_paise: captured ? 0 : (input.splitOwedPaise ?? 0),
    benefit_paise: input.benefitPaise ?? 0,
    tag: input.tag ?? null,
    import_fingerprint: captured ? (input.importFingerprint ?? null) : null,
    occurred_at: input.occurredAt ?? now,
    created_at: now,
    updated_at: now,
  };
  return store.transaction(async (repos) => {
    await repos.transactions.insert(row);
    const auditId = await writeTransactionAudit(
      repos,
      runtime,
      captured ? `capture_${source}` : "create_manual",
      null,
      row,
    );
    return { transaction: row, auditId };
  });
}
export function createManualTransaction(
  store: LedgerStore,
  input: CreateManualTransactionInput,
  runtime = defaultLedgerRuntime,
): Promise<TransactionWriteResult> {
  return createTransaction(store, input, false, runtime);
}
export function insertAutoCapturedTransaction(
  store: LedgerStore,
  input: AutoCapturedTransactionInput,
  runtime = defaultLedgerRuntime,
): Promise<TransactionWriteResult> {
  return createTransaction(store, input, true, runtime);
}
export function getTransaction(
  store: LedgerStore,
  id: string,
): Promise<TransactionRow | null> {
  return store.read((repos) => repos.transactions.get(id));
}
export async function transitionTransactionStatus(
  store: LedgerStore,
  id: string,
  nextStatus: string,
  runtime = defaultLedgerRuntime,
): Promise<TransactionWriteResult> {
  if (!["unverified", "ai_checked", "user_confirmed"].includes(nextStatus))
    throw new InvalidStatusTransitionError("unknown", nextStatus);
  return store.transaction(async (repos) => {
    const before = await repos.transactions.get(id);
    if (!before) throw new LedgerError("Transaction not found", "TX_NOT_FOUND");
    const next: Partial<Record<TransactionStatus, TransactionStatus>> = {
      unverified: "ai_checked",
      ai_checked: "user_confirmed",
    };
    if (next[before.status] !== nextStatus)
      throw new InvalidStatusTransitionError(before.status, nextStatus);
    const after: TransactionRow = {
      ...before,
      status: nextStatus as TransactionStatus,
      updated_at: runtime.now(),
    };
    await repos.transactions.replace(after);
    const auditId = await writeTransactionAudit(
      repos,
      runtime,
      "status_transition",
      before,
      after,
    );
    return { transaction: after, auditId };
  });
}
