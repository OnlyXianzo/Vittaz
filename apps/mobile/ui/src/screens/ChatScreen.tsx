import { useEffect } from "react";
import { ArrowUp, Check, ChevronDown, Mic } from "lucide-react";
import type { AppState } from "../types";
import { formatPaise } from "../money";
import { PageHeader } from "../components";
import type { DispatchAction } from "../components";

const MODEL_LABEL: Record<AppState["model"], string> = {
  auto: "Auto, Qwen 1.5B",
  "openai-compatible": "OpenAI-compatible BYOK",
  "qwen-1.5b": "Qwen 1.5B",
  "qwen-3b": "Qwen 3B",
  claude: "Auto, Claude",
  gemini: "Auto, Gemini",
  free: "Free tier",
};

export function ChatScreen({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: DispatchAction;
}) {
  useEffect(() => {
    if (state.chatMode !== "thinking") return;
    const timer = window.setTimeout(
      () => dispatch({ type: "finish_chat_thinking" }),
      900,
    );
    return () => window.clearTimeout(timer);
  }, [state.chatMode, dispatch]);

  const proposal = state.transactions.find(
    (t) => t.id === state.chatProposalId,
  );
  return (
    <div className="s">
      <PageHeader
        title="Assistant"
        onBack={() => dispatch({ type: "back" })}
        right={
          <button
            className="p model-pill"
            onClick={() => dispatch({ type: "navigate", screen: "models" })}
            type="button"
          >
            {MODEL_LABEL[state.model]}{" "}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        }
      />
      <div className="chat-body">
        {state.chatMessages.length === 0 && (
          <div className="c empty-state">
            <div className="b">Ask or add by message</div>
            <div className="m">
              Questions need no amount — try “Who owes me?” or “What did I spend
              this month?”. To add an entry, say “I spent 299 on Zomato”.
            </div>
          </div>
        )}
        {state.chatMessages.map((m) => (
          <div
            key={m.id}
            className={m.role === "user" ? "ub" : "assistant-text"}
          >
            {m.text}
          </div>
        ))}
        {state.chatSteps.length > 0 && (
          <div className="t">
            {state.chatSteps.map((step) => (
              <div className="st" key={step.tool}>
                {step.state === "done" ? (
                  <span className="ok">
                    <Check size={11} strokeWidth={4} />
                  </span>
                ) : step.state === "running" ? (
                  <span className="sp" />
                ) : (
                  <span className="wt" />
                )}
                <div>
                  <div className="b" style={{ fontSize: 14 }}>
                    {step.label}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <span className="tn">{step.tool}</span>
                    <span className="m" style={{ fontSize: 12 }}>
                      {step.detail}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {state.chatMode === "thinking" && (
          <div className="m" style={{ fontSize: 12 }}>
            Demo steps only. No cloud model is called.
          </div>
        )}
        {proposal && state.chatMode === "approval" && (
          <div className="c proposal-card">
            <div className="row">
              <span className="b">{proposal.title}</span>
              <span className="b">{formatPaise(proposal.amountPaise)}</span>
            </div>
            <div className="m">Paid by you, today</div>
            <div className="row proposal-impact">
              <span className="m">{proposal.category}</span>
              <span className="b" style={{ color: "var(--lime)" }}>
                {formatPaise(proposal.amountPaise)}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                className="lime"
                style={{ flex: 1.4, height: 44, fontSize: 14 }}
                onClick={() => dispatch({ type: "approve", id: proposal.id })}
                type="button"
              >
                Approve
              </button>
              <button
                className="ghost"
                style={{ flex: 1, height: 44, fontSize: 14 }}
                onClick={() =>
                  dispatch({ type: "open_review", id: proposal.id })
                }
                type="button"
              >
                Edit
              </button>
              <button
                className="ghost"
                style={{ flex: 1, height: 44, fontSize: 14 }}
                onClick={() => dispatch({ type: "reject", id: proposal.id })}
                type="button"
              >
                Reject
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="chat-suggestions">
        {[
          { label: "Who owes me?", text: "Who owes me?" },
          { label: "Monthly spend", text: "What did I spend this month?" },
          { label: "Food spend", text: "How much on food?" },
          { label: "Pending review", text: "What is pending?" },
        ].map((chip) => (
          <button
            className="qc"
            key={chip.label}
            onClick={() =>
              dispatch({ type: "send_chat_text", text: chip.text })
            }
            type="button"
          >
            {chip.label}
          </button>
        ))}
      </div>
      <form
        className="inp"
        onSubmit={(e) => {
          e.preventDefault();
          dispatch({ type: "send_chat" });
        }}
      >
        <input
          aria-label="Message"
          placeholder="Message"
          value={state.chatInput}
          onChange={(e) =>
            dispatch({ type: "set_chat_input", value: e.target.value })
          }
        />
        <button
          aria-label="Voice input"
          className="mic"
          type="button"
          onClick={() =>
            dispatch({
              type: "show_toast",
              message: "Voice input is not connected in this UI preview.",
            })
          }
        >
          <Mic size={22} />
        </button>
        <button aria-label="Send" className="sd" type="submit">
          <ArrowUp size={20} strokeWidth={2.6} />
        </button>
      </form>
    </div>
  );
}
