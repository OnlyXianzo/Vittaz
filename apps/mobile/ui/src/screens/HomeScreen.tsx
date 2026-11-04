import { ChevronLeft, Settings, Sparkles, Mic } from "lucide-react";
import type { AppState } from "../types";
import { formatPaise } from "../money";
import { selectPending, selectSummary } from "../selectors";
import { IconButton, NotificationsButton, TransactionRow } from "../components";
import type { DispatchAction } from "../components";

export function HomeScreen({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: DispatchAction;
}) {
  const summary = selectSummary(state);
  const pending = selectPending(state);
  const recent = state.transactions
    .filter((t) => t.status === "user_confirmed")
    .slice(0, 3);
  return (
    <div className="s">
      <div className="row" style={{ height: 44 }}>
        <div className="row" style={{ gap: 6, justifyContent: "flex-start" }}>
          <IconButton label="Back" onClick={() => dispatch({ type: "back" })}>
            <ChevronLeft size={22} />
          </IconButton>
          <span className="k">V</span>
          <h1 className="h" style={{ margin: 0 }} tabIndex={-1}>
            Vittaz
          </h1>
        </div>
        <div className="row" style={{ gap: 0 }}>
          <IconButton
            label="Settings"
            onClick={() => dispatch({ type: "navigate", screen: "settings" })}
          >
            <Settings size={22} />
          </IconButton>
          <NotificationsButton
            onClick={() => dispatch({ type: "navigate", screen: "inbox" })}
          />
        </div>
      </div>

      <div className="c hero-card">
        <div className="m">Net spend this month</div>
        <div className="hero-amount">{formatPaise(summary.spentPaise)}</div>
        <div className="m" style={{ color: "var(--lime)" }}>
          12% lower than last month
        </div>
        <svg
          viewBox="0 0 300 60"
          width="100%"
          height="60"
          style={{ marginTop: 8 }}
          aria-hidden="true"
        >
          <polyline
            fill="none"
            stroke="#b8f23c"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points="0,48 40,44 80,40 110,46 150,34 190,38 230,22 270,8 300,14"
          />
        </svg>
      </div>

      <div className="stat-grid">
        <div className="c stat-card">
          <div className="m">Cash</div>
          <div className="b stat-value">{formatPaise(summary.cashPaise)}</div>
        </div>
        <div className="c stat-card">
          <div className="m">Receivable</div>
          <div className="b stat-value">
            {formatPaise(summary.receivablePaise)}
          </div>
        </div>
        <div className="c stat-card">
          <div className="m">Payable</div>
          <div className="b stat-value">
            {formatPaise(summary.payablePaise)}
          </div>
        </div>
      </div>

      <button
        className="c row pending-card"
        onClick={() => dispatch({ type: "navigate", screen: "inbox" })}
        type="button"
      >
        <div className="row" style={{ gap: 12, justifyContent: "flex-start" }}>
          <span
            className="lg"
            style={{ background: "#f5a524", color: "#1a1000" }}
          >
            {pending.length}
          </span>
          <div style={{ textAlign: "left" }}>
            <div className="b" style={{ fontSize: 15 }}>
              Pending review
            </div>
            <div className="m">{pending.length} transactions need a check</div>
          </div>
        </div>
      </button>

      <div className="row" style={{ margin: "18px 0 4px" }}>
        <span className="b">Recent activity</span>
        <button
          className="link"
          onClick={() => dispatch({ type: "navigate", screen: "ledger" })}
          type="button"
        >
          See all
        </button>
      </div>
      {recent.map((t) => (
        <TransactionRow
          key={t.id}
          transaction={t}
          showStatus={false}
          onClick={() => dispatch({ type: "navigate", screen: "ledger" })}
        />
      ))}

      <button
        className="quick-cta"
        onClick={() => dispatch({ type: "navigate", screen: "quick" })}
        type="button"
      >
        <Sparkles size={20} aria-hidden="true" />
        <span style={{ flex: 1 }}>Add or ask by message</span>
        <span className="quick-mic">
          <Mic size={20} aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}
