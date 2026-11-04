import { useEffect, useReducer, useRef } from "react";
import type { Dispatch } from "react";
import { Toast } from "./components";
import { createInitialState, reducer } from "./state";
import { selectPending } from "./selectors";
import type { Action, AppState, Screen } from "./types";
import { HomeScreen } from "./screens/HomeScreen";
import { InboxScreen } from "./screens/InboxScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { LedgerScreen } from "./screens/LedgerScreen";
import { PeopleScreen } from "./screens/PeopleScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { AddScreen } from "./screens/AddScreen";
import { QuickScreen } from "./screens/QuickScreen";
import { ChatScreen } from "./screens/ChatScreen";
import { ModelsScreen } from "./screens/ModelsScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";

const SHEET_TITLES: Record<Screen, string> = {
  chat: "Chat",
  home: "Overview",
  inbox: "Pending inbox",
  review: "Review transaction",
  ledger: "Ledger",
  people: "People",
  settings: "Settings",
  add: "Add transaction",
  quick: "Paste a message",
  models: "Choose model",
  "onboarding-welcome": "Welcome",
  "onboarding-how": "How it works",
  "onboarding-ai": "Pick your AI",
};

const PREVIEW_SCREENS: Array<{ id: string; label: string }> = [
  { id: "chat", label: "Chat window" },
  { id: "chat-approval", label: "Chat, approval" },
  { id: "chat-thinking", label: "Chat, tool run" },
  { id: "chat-privacy", label: "Chat, privacy guard" },
  { id: "chat-telegram", label: "Chat, Telegram mock" },
  { id: "home", label: "Overview panel" },
  { id: "inbox", label: "Pending inbox" },
  { id: "review", label: "Review transaction" },
  { id: "ledger", label: "Ledger" },
  { id: "people", label: "People" },
  { id: "settings", label: "Settings" },
  { id: "add", label: "Add transaction" },
  { id: "quick", label: "Paste a message" },
  { id: "models", label: "Choose model" },
  { id: "onboarding-welcome", label: "Onboarding, welcome" },
  { id: "onboarding-how", label: "Onboarding, how it works" },
  { id: "onboarding-ai", label: "Onboarding, pick your AI" },
];

function ScreenView({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: Dispatch<Action>;
}) {
  switch (state.screen) {
    case "home":
      return <HomeScreen state={state} dispatch={dispatch} />;
    case "inbox":
      return <InboxScreen state={state} dispatch={dispatch} />;
    case "review":
      return <ReviewScreen state={state} dispatch={dispatch} />;
    case "ledger":
      return <LedgerScreen state={state} dispatch={dispatch} />;
    case "people":
      return <PeopleScreen state={state} dispatch={dispatch} />;
    case "settings":
      return <SettingsScreen state={state} dispatch={dispatch} />;
    case "add":
      return <AddScreen state={state} dispatch={dispatch} />;
    case "quick":
      return <QuickScreen state={state} dispatch={dispatch} />;
    case "models":
      return <ModelsScreen state={state} dispatch={dispatch} />;
    case "onboarding-welcome":
    case "onboarding-how":
    case "onboarding-ai":
      return <OnboardingScreen state={state} dispatch={dispatch} />;
    default:
      return null;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const deviceRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const sheetOpen = state.screen !== "chat";
  const isOnboarding = state.screen.startsWith("onboarding");

  useEffect(() => {
    const root = sheetOpen ? sheetRef.current : deviceRef.current;
    const heading = root?.querySelector<HTMLElement>("h1");
    heading?.focus({ preventScroll: true });
  }, [state.screen, sheetOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !sheetOpen) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      )
        return;
      dispatch({ type: "back" });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen]);

  useEffect(() => {
    if (!state.toast) return;
    const timer = window.setTimeout(
      () => dispatch({ type: "clear_toast" }),
      3200,
    );
    return () => window.clearTimeout(timer);
  }, [state.toast]);

  function jump(id: string) {
    if (id === "review") {
      const first = selectPending(state)[0];
      if (first) dispatch({ type: "open_review", id: first.id });
      else dispatch({ type: "navigate", screen: "review" });
      return;
    }
    if (id === "chat-approval") {
      dispatch({
        type: "send_chat_text",
        text: "Paid 450 to Aman for lunch. He owes me half.",
      });
      dispatch({ type: "finish_chat_thinking" });
      return;
    }
    if (id === "chat-thinking") {
      dispatch({
        type: "send_chat_text",
        text: "How much did I spend on food in October?",
      });
      return;
    }
    if (id === "chat-privacy") {
      dispatch({ type: "attach_mock", kind: "sms" });
      dispatch({ type: "finish_chat_thinking" });
      return;
    }
    if (id === "chat-telegram") {
      dispatch({
        type: "send_chat_text",
        text: "Send my summary to Telegram",
      });
      dispatch({ type: "finish_chat_thinking" });
      return;
    }
    if (id === "onboarding-welcome")
      return dispatch({ type: "set_onboarding_step", step: 0 });
    if (id === "onboarding-how")
      return dispatch({ type: "set_onboarding_step", step: 1 });
    if (id === "onboarding-ai")
      return dispatch({ type: "set_onboarding_step", step: 2 });
    dispatch({ type: "navigate", screen: id as Screen });
  }

  return (
    <div className="preview-shell">
      <aside className="preview-panel" aria-label="UI preview controls">
        <div className="preview-brand">
          <span className="k">V</span>
          <div>
            <strong>Vittaz UI</strong>
            <small>Chat-first preview</small>
          </div>
        </div>
        <p className="preview-note">
          Synthetic data only. The assistant, tool calls and Telegram delivery
          are mocked. No backend, AI provider or bot is connected.
        </p>
        <label className="preview-label" htmlFor="screen-jump">
          Screen
        </label>
        <select
          id="screen-jump"
          className="preview-select"
          value={state.screen}
          onChange={(e) => jump(e.target.value)}
        >
          {PREVIEW_SCREENS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="preview-meta">
          <span className="p">UI-only branch</span>
          <span className="u">G3 not claimed</span>
        </div>
      </aside>
      <main className="device-wrap">
        <div className="device" data-screen={state.screen} ref={deviceRef}>
          <div className="screen-scroll chat-only">
            <ChatScreen state={state} dispatch={dispatch} />
          </div>
          {sheetOpen && (
            <div className="sheet-layer">
              <button
                className="sheet-backdrop"
                aria-label="Close panel"
                onClick={() => dispatch({ type: "back" })}
                type="button"
              />
              <section
                className={`sheet ${isOnboarding ? "full" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-label={SHEET_TITLES[state.screen]}
                ref={sheetRef}
              >
                <div className="sheet-scroll">
                  <ScreenView state={state} dispatch={dispatch} />
                </div>
              </section>
            </div>
          )}
          {state.toast && (
            <Toast
              message={state.toast}
              onDone={() => dispatch({ type: "clear_toast" })}
            />
          )}
        </div>
      </main>
    </div>
  );
}
