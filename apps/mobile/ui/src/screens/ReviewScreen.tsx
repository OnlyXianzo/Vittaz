import type { AppState } from "../types";
import { formatPaise } from "../money";
import { Avatar, PageHeader } from "../components";
import type { DispatchAction } from "../components";

export function ReviewScreen({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: DispatchAction;
}) {
  const transaction = state.transactions.find((t) => t.id === state.reviewId);
  if (!transaction) {
    return (
      <div className="s">
        <PageHeader
          title="Review transaction"
          onBack={() => dispatch({ type: "back" })}
        />
        <div className="c empty-state">
          <div className="b">Nothing to review</div>
          <div className="m">This entry was already handled.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="s">
      <PageHeader
        title="Review transaction"
        onBack={() => dispatch({ type: "back" })}
      />
      <div className="c review-hero">
        <div className="row" style={{ justifyContent: "flex-start", gap: 14 }}>
          <Avatar transaction={transaction} size={56} />
          <div>
            <div className="b" style={{ fontSize: 18 }}>
              {transaction.title}
            </div>
            <div className="review-amount">
              {formatPaise(transaction.amountPaise)}
            </div>
            <div className="m">
              {transaction.note}, {transaction.time}
            </div>
          </div>
        </div>
      </div>
      <div className="c" style={{ marginTop: 12 }}>
        <div className="m">Ledger impact</div>
        <div className="row" style={{ marginTop: 10 }}>
          <span className="b" style={{ fontSize: 15 }}>
            {transaction.category}
          </span>
          <span className="b">{formatPaise(transaction.amountPaise)}</span>
        </div>
      </div>
      <div className="c" style={{ marginTop: 12 }}>
        <div className="m">From notification</div>
        <div style={{ marginTop: 8, fontSize: 17, lineHeight: 1.4 }}>
          {transaction.source ?? transaction.note}
        </div>
      </div>
      <div className="review-actions">
        <button
          className="lime"
          style={{ flex: 1.3 }}
          onClick={() => dispatch({ type: "approve", id: transaction.id })}
          type="button"
        >
          Approve
        </button>
        <button
          className="ghost"
          style={{ flex: 1 }}
          onClick={() => dispatch({ type: "reject", id: transaction.id })}
          type="button"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
