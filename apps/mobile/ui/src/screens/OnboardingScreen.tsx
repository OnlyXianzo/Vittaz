import { Check, Download, Inbox, MessageCircle, Plus } from "lucide-react";
import type { AppState } from "../types";
import type { DispatchAction } from "../components";

function Dots({ step }: { step: 0 | 1 | 2 }) {
  return (
    <div className="dots" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className={i === step ? "dot on" : "dot"} />
      ))}
    </div>
  );
}

export function OnboardingScreen({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: DispatchAction;
}) {
  const step = state.onboardingStep;
  return (
    <div className="s onboarding">
      <span className="bl b1" aria-hidden="true" />
      <span className="bl b2" aria-hidden="true" />
      <span className="bl b3" aria-hidden="true" />
      {step === 0 && (
        <>
          <span className="k welcome-logo">V</span>
          <h1 className="welcome-title" tabIndex={-1}>
            Hey mate, welcome to Vittaz
          </h1>
          <div className="welcome-copy">
            Track what you spend, lend and owe. Add entries by tapping or by
            messaging, and an AI helps keep them straight.
          </div>
          <div style={{ marginTop: 28 }}>
            {[
              "Your data stays on your phone",
              "The AI drafts, you approve",
              "Bring your own model or API key",
            ].map((text) => (
              <div className="row welcome-check" key={text}>
                <span className="check-bullet">
                  <Check size={11} strokeWidth={2} />
                </span>
                <span style={{ fontSize: 15 }}>{text}</span>
              </div>
            ))}
          </div>
          <div className="onboarding-footer">
            <Dots step={step} />
            <button
              className="lime"
              style={{ width: "100%" }}
              onClick={() => dispatch({ type: "set_onboarding_step", step: 1 })}
              type="button"
            >
              Get started
            </button>
            <button
              className="link onboarding-link"
              onClick={() =>
                dispatch({
                  type: "show_toast",
                  message: "Restore is not connected in this UI preview.",
                })
              }
              type="button"
            >
              Already have a backup? Restore
            </button>
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <h1 className="how-title" tabIndex={-1}>
            How entries get in
          </h1>
          <div className="m" style={{ fontSize: 15 }}>
            Everything lands in one ledger.
          </div>
          <div style={{ marginTop: 14 }}>
            {[
              {
                icon: Plus,
                title: "Tap it in",
                copy: "Amount, category, save. Entries you add yourself are marked verified.",
              },
              {
                icon: MessageCircle,
                title: "Message it",
                copy: "Send a text in the app or on Telegram. The AI drafts the entry and waits for you.",
              },
              {
                icon: Inbox,
                title: "Catch the rest",
                copy: "Bank alerts land in an inbox as unverified until you confirm them.",
              },
            ].map(({ icon: Icon, title, copy }) => (
              <div className="c row how-card" key={title}>
                <span className="lg how-icon">
                  <Icon size={22} />
                </span>
                <div>
                  <div className="b" style={{ fontSize: 16 }}>
                    {title}
                  </div>
                  <div
                    className="m"
                    style={{ marginTop: 4, lineHeight: 1.45, fontSize: 14 }}
                  >
                    {copy}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="onboarding-footer">
            <Dots step={step} />
            <button
              className="lime"
              style={{ width: "100%" }}
              onClick={() => dispatch({ type: "set_onboarding_step", step: 2 })}
              type="button"
            >
              Continue
            </button>
            <button
              className="link onboarding-link"
              onClick={() => dispatch({ type: "finish_onboarding" })}
              type="button"
            >
              Skip
            </button>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <h1 className="ai-title" tabIndex={-1}>
            Pick how the AI runs
          </h1>
          <div className="m" style={{ fontSize: 15, lineHeight: 1.4 }}>
            Use one or both. Auto picks the right one for each job.
          </div>
          <div className="c ai-card">
            <div className="row">
              <div
                className="row"
                style={{ gap: 10, justifyContent: "flex-start" }}
              >
                <span className="rd on" />
                <span className="b">On this phone</span>
              </div>
              <span className="p">Private</span>
            </div>
            <div
              className="m"
              style={{ margin: "8px 0 12px", lineHeight: 1.4, fontSize: 14 }}
            >
              Qwen 1.5B, 1.1 GB. Works offline and nothing leaves your phone.
            </div>
            <button
              className="ghost"
              style={{ width: "100%", height: 44, fontSize: 14 }}
              onClick={() =>
                dispatch({
                  type: "show_toast",
                  message:
                    "Model downloads are not connected in this UI preview.",
                })
              }
              type="button"
            >
              <Download size={16} /> Download model
            </button>
          </div>
          <div className="c" style={{ marginTop: 12 }}>
            <div
              className="row"
              style={{ justifyContent: "flex-start", gap: 10 }}
            >
              <span className="rd on" />
              <span className="b">Your own API key</span>
            </div>
            <div className="chip-row" style={{ margin: "12px 0" }}>
              <button className="chip lime" type="button">
                Claude
              </button>
              <button className="chip ghost-chip" type="button">
                Gemini
              </button>
              <button className="chip ghost-chip" type="button">
                OpenAI
              </button>
            </div>
            <label className="c row api-key-card">
              <input
                aria-label="API key"
                placeholder="Paste your API key"
                type="password"
                autoComplete="off"
              />
            </label>
            <div
              className="m"
              style={{ marginTop: 10, fontSize: 12, lineHeight: 1.4 }}
            >
              Demo only. Keys are not stored or sent in this preview.
            </div>
          </div>
          <div className="onboarding-footer">
            <Dots step={step} />
            <button
              className="lime"
              style={{ width: "100%" }}
              onClick={() => dispatch({ type: "finish_onboarding" })}
              type="button"
            >
              Finish setup
            </button>
            <button
              className="link onboarding-link"
              onClick={() => dispatch({ type: "finish_onboarding" })}
              type="button"
            >
              Skip for now, I will add entries by hand
            </button>
          </div>
        </>
      )}
    </div>
  );
}
