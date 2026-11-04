import { Sparkles } from "lucide-react";
import type { AppState, Direction, Mode } from "../types";
import { PageHeader } from "../components";
import type { DispatchAction } from "../components";

const DIRECTIONS: Direction[] = ["spent", "received", "lent"];
const CATEGORIES = ["Food", "Travel", "Shopping", "Rent"];
const MODES: Mode[] = ["Cash", "UPI", "Card"];

export function AddScreen({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: DispatchAction;
}) {
  const draft = state.addDraft;
  return (
    <div className="s">
      <PageHeader
        title="Add transaction"
        onBack={() => dispatch({ type: "back" })}
        right={<span className="p">Saves as verified</span>}
      />
      <div className="c" style={{ marginTop: 12 }}>
        <label className="m" htmlFor="amt">
          Amount
        </label>
        <div className="amount-row">
          <span className="amount-currency">₹</span>
          <input
            id="amt"
            className="amount-input"
            inputMode="decimal"
            value={draft.amount}
            onChange={(e) =>
              dispatch({
                type: "update_draft",
                patch: { amount: e.target.value },
              })
            }
          />
        </div>
      </div>
      <div className="chip-row">
        {DIRECTIONS.map((d) => (
          <button
            key={d}
            className={`chip ${draft.direction === d ? "lime" : "ghost-chip"}`}
            onClick={() =>
              dispatch({ type: "update_draft", patch: { direction: d } })
            }
            type="button"
            aria-pressed={draft.direction === d}
          >
            {d.charAt(0).toUpperCase() + d.slice(1)}
          </button>
        ))}
      </div>
      <div className="chip-row">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={`chip ${draft.category === c ? "lime" : "ghost-chip"}`}
            onClick={() =>
              dispatch({ type: "update_draft", patch: { category: c } })
            }
            type="button"
            aria-pressed={draft.category === c}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="field-row">
        <label className="c row field-card">
          <span className="m">Person</span>
          <input
            value={draft.person}
            onChange={(e) =>
              dispatch({
                type: "update_draft",
                patch: { person: e.target.value },
              })
            }
          />
        </label>
        <label className="c row field-card">
          <span className="m">Mode</span>
          <select
            value={draft.mode}
            onChange={(e) =>
              dispatch({
                type: "update_draft",
                patch: { mode: e.target.value as Mode },
              })
            }
          >
            {MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="c" style={{ marginTop: 10, padding: "12px 16px" }}>
        <label className="m" htmlFor="note">
          Note
        </label>
        <textarea
          id="note"
          className="note-input"
          value={draft.note}
          onChange={(e) =>
            dispatch({ type: "update_draft", patch: { note: e.target.value } })
          }
        />
      </div>
      <button
        className="ghost improve-button"
        onClick={() => dispatch({ type: "improve_note" })}
        type="button"
      >
        <Sparkles size={18} aria-hidden="true" /> Improve note
      </button>
      {state.improvedNote && (
        <div className="c improved-card">
          <div className="row">
            <span className="m">Improved note</span>
            <span className="p">Demo rewrite</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 15, lineHeight: 1.4 }}>
            {state.improvedNote}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              className="lime"
              style={{ flex: 1, height: 44, fontSize: 14 }}
              onClick={() => dispatch({ type: "use_improved_note" })}
              type="button"
            >
              Use this
            </button>
            <button
              className="ghost"
              style={{ flex: 1, height: 44, fontSize: 14 }}
              onClick={() => dispatch({ type: "keep_note" })}
              type="button"
            >
              Keep mine
            </button>
          </div>
        </div>
      )}
      <div className="add-footer">
        <div
          className="m"
          style={{ fontSize: 12, textAlign: "center", marginBottom: 8 }}
        >
          You entered this yourself, so it skips the review inbox.
        </div>
        <button
          className="lime"
          style={{ width: "100%" }}
          onClick={() => dispatch({ type: "add_transaction" })}
          type="button"
        >
          Save transaction
        </button>
      </div>
    </div>
  );
}
