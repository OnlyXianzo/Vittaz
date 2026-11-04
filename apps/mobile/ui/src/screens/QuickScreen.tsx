import type { AppState } from "../types";
import { formatPaise } from "../money";
import { Avatar, PageHeader } from "../components";
import type { DispatchAction } from "../components";

export function QuickScreen({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: DispatchAction;
}) {
  const recent = state.quickRecentIds
    .map((id) => state.transactions.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  return (
    <div className="s">
      <PageHeader
        title="Quick ingestion"
        onBack={() => dispatch({ type: "back" })}
      />
      <div className="c" style={{ marginTop: 14 }}>
        <textarea
          className="quick-input"
          aria-label="Transaction text"
          placeholder="Paste a bank SMS or UPI alert, or type it as you would say it."
          value={state.quickInput}
          onChange={(e) =>
            dispatch({ type: "set_quick_input", value: e.target.value })
          }
        />
      </div>
      <div className="m" style={{ margin: "10px 4px" }}>
        For example: I spent 299 on Zomato
      </div>
      <div className="row" style={{ margin: "20px 0 4px" }}>
        <span className="b">Recent inputs</span>
        <button
          className="link"
          onClick={() => dispatch({ type: "navigate", screen: "inbox" })}
          type="button"
        >
          See all
        </button>
      </div>
      <div className="c" style={{ padding: "6px 16px" }}>
        {recent.map((t) => (
          <div className="row" style={{ padding: "9px 0" }} key={t.id}>
            <div
              className="row"
              style={{ gap: 12, justifyContent: "flex-start" }}
            >
              <Avatar transaction={t} />
              <div>
                <div className="b" style={{ fontSize: 15 }}>
                  {t.title}, {formatPaise(t.amountPaise)}
                </div>
                <div className="m">
                  {t.day}, {t.time}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="m" style={{ margin: "14px 4px" }}>
        Demo parser only. No message leaves this preview.
      </div>
      <button
        className="lime sticky-action"
        onClick={() => dispatch({ type: "analyze_quick" })}
        type="button"
      >
        Analyze
      </button>
    </div>
  );
}
