import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Inbox,
  Mic,
  NotebookText,
  Paperclip,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { AppState, ChatStep } from "../types";
import { formatPaise } from "../money";
import { selectPending } from "../selectors";
import { IconButton } from "../components";
import type { DispatchAction } from "../components";

const MODEL_LABEL: Record<AppState["model"], string> = {
  auto: "Auto, Qwen 1.5B",
  "qwen-1.5b": "Qwen 1.5B",
  "qwen-3b": "Qwen 3B",
  claude: "Auto, Claude",
  gemini: "Auto, Gemini",
  free: "Free tier",
};

const SUGGESTIONS = [
  "I spent 299 on Zomato",
  "What did I spend this month?",
  "Who owes me?",
  "Send my summary to Telegram",
];

function StepStatus({ step }: { step: ChatStep }) {
  if (step.state === "done")
    return (
      <span className="ok" aria-label="Done">
        <Check size={11} strokeWidth={4} aria-hidden="true" />
      </span>
    );
  if (step.state === "running")
    return <span className="sp" aria-label="Running" />;
  if (step.state === "waiting")
    return <span className="wt" aria-label="Waiting for you" />;
  return <span className="qd" aria-label="Queued" />;
}

function ToolCalls({ steps }: { steps: ChatStep[] }) {
  if (steps.length === 0) return null;
  return (
    <section className="t tool-calls" aria-label="Tool calls">
      {steps.map((step) => (
        <div className={`st ${step.state}`} key={step.id}>
          <StepStatus step={step} />
          <div style={{ flex: 1 }}>
            <div className="b" style={{ fontSize: 14 }}>
              {step.label}
            </div>
            <div style={{ marginTop: 4 }}>
              <span className="tn">{step.tool}</span>
              <span className="m" style={{ fontSize: 12 }}>
                {step.detail}
              </span>
            </div>
            {step.args && <code className="tool-args">{step.args}</code>}
            {step.result && <div className="m tool-result">{step.result}</div>}
          </div>
        </div>
      ))}
    </section>
  );
}

export function ChatScreen({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: DispatchAction;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pendingCount = selectPending(state).length;

  useEffect(() => {
    if (state.chatMode !== "thinking") return;
    const timer = window.setTimeout(
      () => dispatch({ type: "advance_chat" }),
      420,
    );
    return () => window.clearTimeout(timer);
  }, [state.chatMode, state.chatSteps, dispatch]);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [state.chatMessages, state.chatSteps, state.chatTelegramPreview]);

  const proposal = state.transactions.find(
    (t) => t.id === state.chatProposalId,
  );
  const lastAssistantId = [...state.chatMessages]
    .reverse()
    .find((m) => m.role === "assistant")?.id;

  function send(text: string) {
    setAddOpen(false);
    dispatch({ type: "send_chat_text", text });
  }

  return (
    <div className="s chat-screen">
      <div className="chat-head">
        <div className="row" style={{ height: 44 }}>
          <div
            className="row"
            style={{ gap: 10, justifyContent: "flex-start" }}
          >
            <span className="k" aria-hidden="true">
              V
            </span>
            <h1 className="h" style={{ margin: 0 }} tabIndex={-1}>
              Vittaz AI
            </h1>
          </div>
          <button
            className="p model-pill"
            onClick={() => dispatch({ type: "navigate", screen: "models" })}
            type="button"
          >
            {MODEL_LABEL[state.model]}{" "}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        </div>
        <nav className="chat-tools" aria-label="Primary">
          <button
            onClick={() => dispatch({ type: "navigate", screen: "ledger" })}
            type="button"
          >
            <NotebookText size={16} aria-hidden="true" />
            <span>Ledger</span>
          </button>
          <button
            onClick={() => dispatch({ type: "navigate", screen: "inbox" })}
            type="button"
          >
            <Inbox size={16} aria-hidden="true" />
            <span>Inbox</span>
            {pendingCount > 0 && <em className="nav-badge">{pendingCount}</em>}
          </button>
          <button
            onClick={() => dispatch({ type: "navigate", screen: "people" })}
            type="button"
          >
            <Users size={16} aria-hidden="true" />
            <span>People</span>
          </button>
          <button
            onClick={() => dispatch({ type: "navigate", screen: "settings" })}
            type="button"
          >
            <Settings size={16} aria-hidden="true" />
            <span>Settings</span>
          </button>
        </nav>
      </div>

      <div
        className="chat-body"
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        ref={bodyRef}
      >
        {state.chatMessages.length === 0 && (
          <div className="c empty-state">
            <div className="b">Send me anything</div>
            <div className="m">
              Type it, paste a bank SMS, or add a screenshot. I check it for
              account numbers and other private details on this phone before I
              read it, then draft an entry for you to approve.
            </div>
          </div>
        )}
        {state.chatMessages.map((m) => (
          <div key={m.id}>
            <div className={m.role === "user" ? "ub" : "assistant-text"}>
              {m.text}
            </div>
            {m.redacted && m.redacted.length > 0 && (
              <div className="redacted-note">
                <ShieldCheck size={13} aria-hidden="true" />
                <span>Hidden before sending: {m.redacted.join(", ")}</span>
              </div>
            )}
            {m.variant === "telegram" && state.chatTelegramPreview && (
              <div className="c telegram-card">
                <div className="row">
                  <span className="b">
                    <Send size={14} aria-hidden="true" /> Telegram
                  </span>
                  <span className="p">Mock delivery</span>
                </div>
                <pre className="telegram-preview">
                  {state.chatTelegramPreview}
                </pre>
                <div className="m" style={{ fontSize: 12 }}>
                  Nothing was sent. Pairing a real bot is a backend feature.
                </div>
              </div>
            )}
            {m.id === lastAssistantId && <ToolCalls steps={state.chatSteps} />}
          </div>
        ))}
        {state.chatMessages.length > 0 &&
          state.chatMode === "thinking" &&
          !state.chatMessages.some((m) => m.role === "assistant") && (
            <ToolCalls steps={state.chatSteps} />
          )}
        {state.chatMode === "thinking" && (
          <div className="m" style={{ fontSize: 12 }}>
            Demo tool run. No cloud model or Telegram request is called.
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
        {SUGGESTIONS.map((text) => (
          <button
            className="qc"
            key={text}
            onClick={() => send(text)}
            type="button"
          >
            {text}
          </button>
        ))}
      </div>

      {addOpen && (
        <div className="c add-menu" role="group" aria-label="Add to the chat">
          <button
            className="mr setting-button"
            onClick={() => {
              setAddOpen(false);
              dispatch({ type: "attach_mock", kind: "sms" });
            }}
            type="button"
          >
            Bank SMS sample
          </button>
          <button
            className="mr setting-button"
            onClick={() => {
              setAddOpen(false);
              dispatch({ type: "attach_mock", kind: "screenshot" });
            }}
            type="button"
          >
            Screenshot sample
          </button>
          <button
            className="mr setting-button"
            onClick={() => {
              setAddOpen(false);
              dispatch({ type: "navigate", screen: "add" });
            }}
            type="button"
          >
            Manual entry
          </button>
          <button
            className="mr setting-button"
            onClick={() => {
              setAddOpen(false);
              dispatch({ type: "navigate", screen: "home" });
            }}
            type="button"
          >
            <Sparkles size={15} aria-hidden="true" /> Overview
          </button>
        </div>
      )}

      <form
        className="inp"
        onSubmit={(e) => {
          e.preventDefault();
          dispatch({ type: "send_chat" });
        }}
      >
        <IconButton
          label="Add to chat"
          onClick={() => setAddOpen((open) => !open)}
        >
          <Paperclip size={20} />
        </IconButton>
        <input
          aria-label="Message"
          placeholder="Message or paste anything"
          value={state.chatInput}
          onChange={(e) =>
            dispatch({ type: "set_chat_input", value: e.target.value })
          }
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            if (!pasted.trim()) return;
            e.preventDefault();
            send(pasted);
          }}
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
