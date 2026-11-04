import { Filter } from "lucide-react";
import type { AppState, InboxFilter } from "../types";
import { formatPaise } from "../money";
import { selectInbox, selectPending } from "../selectors";
import { Avatar, IconButton, PageHeader } from "../components";
import type { DispatchAction } from "../components";

const FILTERS: Array<{ id: InboxFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "upi", label: "UPI" },
  { id: "sms", label: "SMS" },
];

export function InboxScreen({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: DispatchAction;
}) {
  const rows = selectInbox(state);
  const pending = selectPending(state);
  const counts = {
    all: pending.length,
    upi: pending.filter((t) => t.mode === "UPI").length,
    sms: pending.filter((t) => t.mode === "SMS").length,
  };
  return (
    <div className="s">
      <PageHeader
        title="Pending inbox"
        onBack={() => dispatch({ type: "back" })}
        right={
          <IconButton
            label="Filter"
            onClick={() =>
              dispatch({ type: "set_inbox_filter", filter: "all" })
            }
          >
            <Filter size={22} />
          </IconButton>
        }
      />
      <div className="chip-row">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`chip ${state.inboxFilter === f.id ? "lime" : "ghost-chip"}`}
            onClick={() => dispatch({ type: "set_inbox_filter", filter: f.id })}
            type="button"
            aria-pressed={state.inboxFilter === f.id}
          >
            {f.label} {counts[f.id]}
          </button>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="c empty-state">
          <div className="b">Inbox is clear</div>
          <div className="m">No pending entries match this filter.</div>
        </div>
      )}

      {rows.map((t) => {
        const selected = state.selectedInboxIds.includes(t.id);
        return (
          <div
            className={`c inbox-card ${selected ? "selected" : ""}`}
            key={t.id}
          >
            <button
              className="row inbox-select"
              onClick={() =>
                dispatch({ type: "toggle_inbox_selected", id: t.id })
              }
              type="button"
              aria-pressed={selected}
              aria-label={`Select ${t.title}`}
            >
              <div
                className="row"
                style={{ gap: 12, justifyContent: "flex-start" }}
              >
                <Avatar transaction={t} />
                <div style={{ textAlign: "left" }}>
                  <div className="b">{t.title}</div>
                  <div className="m">
                    Today, {t.time}, {t.mode}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="b">{formatPaise(t.amountPaise)}</div>
                {t.confidence && (
                  <span className="p">{t.confidence}% sure</span>
                )}
              </div>
            </button>
            <div className="row" style={{ marginTop: 12 }}>
              <span className="m">{t.note}</span>
              <span className="u">Unverified</span>
            </div>
            <button
              className="link review-link"
              onClick={() => dispatch({ type: "open_review", id: t.id })}
              type="button"
            >
              Review
            </button>
          </div>
        );
      })}

      <button
        className="lime sticky-action"
        onClick={() => dispatch({ type: "review_selected" })}
        type="button"
        disabled={state.selectedInboxIds.length === 0}
      >
        Review selected ({state.selectedInboxIds.length})
      </button>
    </div>
  );
}
