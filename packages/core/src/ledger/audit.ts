import { assertPositivePaise, assertNonNegativePaise } from "./money.js";
import {
  defaultLedgerRuntime,
  LedgerError,
  writeTransactionAudit,
} from "./ledger.js";
import type { TransactionWriteResult } from "./ledger.js";
import type {
  LedgerStore,
  TransactionRow,
  ProposalRow,
} from "./repositories.js";

export interface UpdateTransactionPatch {
  amountPaise?: number;
  category?: string;
  counterpartyName?: string | null;
  note?: string | null;
  benefit?: string;
  tags?: string[];
  benefitPaise?: number;
  tag?: string | null;
  status?: never;
}
export function updateTransaction(
  store: LedgerStore,
  id: string,
  patch: UpdateTransactionPatch & Record<string, unknown>,
  runtime = defaultLedgerRuntime,
): Promise<TransactionWriteResult> {
  return store.transaction(async (r) => {
    const before = await r.transactions.get(id);
    if (!before) throw new LedgerError("Transaction not found", "TX_NOT_FOUND");
    if (patch.status !== undefined)
      throw new LedgerError(
        "Use transitionTransactionStatus to change status",
        "STATUS_VIA_UPDATE_FORBIDDEN",
      );
    const after: TransactionRow = {
      ...before,
      amount_paise:
        patch.amountPaise === undefined
          ? before.amount_paise
          : assertPositivePaise(patch.amountPaise),
      category:
        patch.category === undefined ? before.category : String(patch.category),
      counterparty_name:
        patch.counterpartyName === undefined
          ? before.counterparty_name
          : patch.counterpartyName,
      note: patch.note === undefined ? before.note : patch.note,
      benefit:
        patch.benefit === undefined ? before.benefit : String(patch.benefit),
      tags_json:
        patch.tags === undefined
          ? before.tags_json
          : JSON.stringify(patch.tags),
      benefit_paise:
        patch.benefitPaise === undefined
          ? before.benefit_paise
          : assertNonNegativePaise(patch.benefitPaise),
      tag: patch.tag === undefined ? before.tag : patch.tag,
      updated_at: runtime.now(),
    };
    await r.transactions.replace(after);
    const auditId = await writeTransactionAudit(
      r,
      runtime,
      "update_transaction",
      before,
      after,
    );
    return { transaction: after, auditId };
  });
}
function snapshot<Row extends { id: string }>(text: string | null): Row | null {
  if (text === null) return null;
  const value: unknown = JSON.parse(text);
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    typeof value.id !== "string"
  )
    throw new LedgerError("Corrupt audit snapshot", "CORRUPT_AUDIT");
  return value as Row;
}
function same(left: object | null, right: object | null): boolean {
  if (left === null || right === null) return left === right;
  const actual = left as Record<string, unknown>;
  const expected = right as Record<string, unknown>;
  return (
    Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => actual[key] === value)
  );
}
export function undoAuditEntry(
  store: LedgerStore,
  id: string,
): Promise<{ undoneAuditId: string; restoredState: TransactionRow | null }> {
  return store.transaction(async (r) => {
    const audit = await r.audit.get(id);
    if (!audit)
      throw new LedgerError("Audit entry not found", "AUDIT_NOT_FOUND");
    if (audit.undone === 1)
      throw new LedgerError("Audit entry already undone", "ALREADY_UNDONE");
    if (audit.entity_type !== "transaction")
      throw new LedgerError("Unsupported undo entity", "UNSUPPORTED_UNDO");
    const before = snapshot<TransactionRow>(audit.before_state);
    const after = snapshot<TransactionRow>(audit.after_state);
    if (
      (before === null && after === null) ||
      (before !== null && before.id !== audit.entity_id) ||
      (after !== null && after.id !== audit.entity_id)
    )
      throw new LedgerError("Corrupt audit identity", "CORRUPT_AUDIT");
    const current = await r.transactions.get(audit.entity_id);
    if (!same(current, after))
      throw new LedgerError("Undo would overwrite newer state", "STALE_UNDO");
    const proposalBefore = snapshot<ProposalRow>(audit.related_proposal_before);
    if (proposalBefore !== null) {
      const proposal = await r.proposals.get(proposalBefore.id);
      if (
        !same(proposal, {
          ...proposalBefore,
          status: "approved",
          committed_tx_id: audit.entity_id,
        })
      )
        throw new LedgerError("Proposal changed after approval", "STALE_UNDO");
      await r.proposals.replace(proposalBefore);
    }
    if (before === null) await r.transactions.remove(audit.entity_id);
    else if (after === null) await r.transactions.insert(before);
    else await r.transactions.replace(before);
    await r.audit.replace({ ...audit, undone: 1 });
    return { undoneAuditId: id, restoredState: before };
  });
}
