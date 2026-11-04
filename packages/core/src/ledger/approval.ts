import {
  defaultLedgerRuntime,
  LedgerError,
  validateInput,
  writeTransactionAudit,
} from "./ledger.js";
import type { CreateManualTransactionInput, LedgerRuntime } from "./ledger.js";
import type {
  LedgerStore,
  LedgerRepositories,
  ProposalRow,
  TransactionRow,
  TransactionStatus,
} from "./repositories.js";

export interface CreateProposalInput extends CreateManualTransactionInput {
  source?: string;
  initialTxStatus?: TransactionStatus;
}
export interface ApproveProposalResult {
  alreadyApproved: boolean;
  transaction: TransactionRow;
  auditId: string | null;
}
export async function createProposal(
  store: LedgerStore,
  input: CreateProposalInput,
  runtime = defaultLedgerRuntime,
): Promise<ProposalRow> {
  validateInput(input);
  const status = input.initialTxStatus ?? "ai_checked";
  if (!["unverified", "ai_checked", "user_confirmed"].includes(status))
    throw new LedgerError("Invalid initialTxStatus", "INVALID_STATUS");
  const now = runtime.now();
  const row: ProposalRow = {
    id: runtime.makeId("prop"),
    wallet_id: input.walletId ?? "bank_default",
    amount_paise: input.amountPaise,
    direction: input.direction,
    event_type: input.eventType ?? "normal",
    category: input.category ?? "uncategorized",
    counterparty_name: input.counterpartyName ?? null,
    note: input.note ?? null,
    source: input.source ?? "ai",
    initial_tx_status: status,
    status: "pending",
    committed_tx_id: null,
    benefit: input.benefit ?? "self",
    tags_json: JSON.stringify(input.tags ?? []),
    split_owed_paise: input.splitOwedPaise ?? 0,
    benefit_paise: input.benefitPaise ?? 0,
    tag: input.tag ?? null,
    occurred_at: input.occurredAt ?? now,
    created_at: now,
  };
  await store.transaction((r) => r.proposals.insert(row));
  return row;
}
export function getProposal(
  store: LedgerStore,
  id: string,
): Promise<ProposalRow | null> {
  return store.read((r) => r.proposals.get(id));
}
async function approveWithin(
  repos: LedgerRepositories,
  id: string,
  now: string,
  runtime: LedgerRuntime,
): Promise<ApproveProposalResult> {
  const proposal = await repos.proposals.get(id);
  if (!proposal)
    throw new LedgerError("Proposal not found", "PROPOSAL_NOT_FOUND");
  if (proposal.status === "approved") {
    const transaction =
      proposal.committed_tx_id === null
        ? null
        : await repos.transactions.get(proposal.committed_tx_id);
    if (transaction === null)
      throw new LedgerError(
        "Committed transaction missing",
        "COMMITTED_TRANSACTION_MISSING",
      );
    return { alreadyApproved: true, transaction, auditId: null };
  }
  if (proposal.status === "rejected")
    throw new LedgerError(
      "Cannot approve rejected proposal",
      "PROPOSAL_REJECTED",
    );
  const transaction: TransactionRow = {
    id: runtime.makeId("tx"),
    wallet_id: proposal.wallet_id,
    amount_paise: proposal.amount_paise,
    direction: proposal.direction,
    event_type: proposal.event_type,
    category: proposal.category,
    counterparty_name: proposal.counterparty_name,
    account_last4: null,
    dedup_key: null,
    note: proposal.note,
    status: proposal.initial_tx_status,
    source: proposal.source,
    proposal_id: proposal.id,
    benefit: proposal.benefit,
    tags_json: proposal.tags_json,
    import_fingerprint: null,
    split_owed_paise: proposal.split_owed_paise,
    benefit_paise: proposal.benefit_paise,
    tag: proposal.tag,
    occurred_at: proposal.occurred_at,
    created_at: now,
    updated_at: now,
  };
  await repos.transactions.insert(transaction);
  await repos.proposals.replace({
    ...proposal,
    status: "approved",
    committed_tx_id: transaction.id,
  });
  const auditId = await writeTransactionAudit(
    repos,
    runtime,
    "approve_proposal",
    null,
    transaction,
    proposal,
  );
  return { alreadyApproved: false, transaction, auditId };
}
export function approveProposal(
  store: LedgerStore,
  id: string,
  options: { now?: string } = {},
  runtime = defaultLedgerRuntime,
): Promise<ApproveProposalResult> {
  return store.transaction((r) =>
    approveWithin(r, id, options.now ?? runtime.now(), runtime),
  );
}
export function batchApproveProposals(
  store: LedgerStore,
  ids: readonly string[],
  runtime = defaultLedgerRuntime,
): Promise<ApproveProposalResult[]> {
  return store.transaction(async (r) => {
    const results: ApproveProposalResult[] = [];
    for (const id of ids)
      results.push(await approveWithin(r, id, runtime.now(), runtime));
    return results;
  });
}
export function rejectProposal(
  store: LedgerStore,
  id: string,
): Promise<ProposalRow> {
  return store.transaction(async (r) => {
    const row = await r.proposals.get(id);
    if (!row) throw new LedgerError("Proposal not found", "PROPOSAL_NOT_FOUND");
    if (row.status === "approved")
      throw new LedgerError(
        "Cannot reject already-approved proposal",
        "PROPOSAL_ALREADY_APPROVED",
      );
    const rejected: ProposalRow = { ...row, status: "rejected" };
    await r.proposals.replace(rejected);
    return rejected;
  });
}
