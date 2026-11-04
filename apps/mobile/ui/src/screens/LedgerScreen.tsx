import { Plus, Search } from "lucide-react";
import type { AppState, LedgerFilter } from "../types";
import { formatPaise } from "../money";
import {
  groupByDay,
  selectLedger,
  selectPending,
  selectSummary,
} from "../selectors";
import { IconButton, PageHeader, TransactionRow } from "../components";
import type { DispatchAction } from "../components";

const FILTERS: Array<{ id: LedgerFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "unverified", label: "Unverified" },
];

export function LedgerScreen({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: DispatchAction;
}) {
  const rows = selectLedger(state);
  const groups = groupByDay(rows);
  const summary = selectSummary(state);
  const pending = selectPending(state).length;
  return (
    <div className="s">
      <PageHeader
        large
        title="Ledger"
        right={
          <div className="row" style={{ gap: 4 }}>
            <IconButton
              label="Search"
              onClick={() => dispatch({ type: "toggle_search" })}
            >
              <Search size={22} />
            </IconButton>
            <IconButton
              label="Add transaction"
              className="add-fab"
              onClick={() => dispatch({ type: "navigate", screen: "add" })}
            >
              <Plus size={22} />
            </IconButton>
          </div>
        }
      />
      {state.searchOpen && (
        <input
          className="search-input"
          aria-label="Search ledger"
          placeholder="Search title, category, person…"
          value={state.ledgerSearch}
          onChange={(e) =>
            dispatch({ type: "set_ledger_search", value: e.target.value })
          }
        />
      )}
      <div className="chip-row">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`chip ${state.ledgerFilter === f.id ? "lime" : "ghost-chip"}`}
            onClick={() =>
              dispatch({ type: "set_ledger_filter", filter: f.id })
            }
            type="button"
            aria-pressed={state.ledgerFilter === f.id}
          >
            {f.label}
            {f.id === "unverified" ? ` ${pending}` : ""}
          </button>
        ))}
      </div>
      <div className="c summary-card">
        <div className="m" style={{ fontSize: 12 }}>
          This month
        </div>
        <div className="summary-grid">
          <div>
            <div className="m" style={{ fontSize: 12 }}>
              Spent
            </div>
            <div className="b" style={{ fontSize: 17 }}>
              {formatPaise(summary.spentPaise)}
            </div>
          </div>
          <div>
            <div className="m" style={{ fontSize: 12 }}>
              Received
            </div>
            <div className="b" style={{ fontSize: 17, color: "var(--lime)" }}>
              {formatPaise(summary.receivedPaise)}
            </div>
          </div>
          <div>
            <div className="m" style={{ fontSize: 12 }}>
              Cash in hand
            </div>
            <div className="b" style={{ fontSize: 17 }}>
              {formatPaise(summary.cashPaise)}
            </div>
          </div>
        </div>
      </div>

      <div className="ledger-list">
        {groups.length === 0 && (
          <div className="c empty-state">
            <div className="b">No entries</div>
            <div className="m">Try another filter or add a transaction.</div>
          </div>
        )}
        {groups.map((group) => (
          <section key={group.day}>
            <div className="m day-label">{group.day}</div>
            {group.rows.map((t) => (
              <TransactionRow
                key={t.id}
                transaction={t}
                onClick={
                  t.status === "user_confirmed"
                    ? undefined
                    : () => dispatch({ type: "open_review", id: t.id })
                }
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
