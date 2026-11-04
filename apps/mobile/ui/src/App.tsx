import { useEffect, useReducer, useRef } from "react";
import type { Dispatch } from "react";
import { BottomNav, Toast } from "./components";
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

const NAV_SCREENS: Screen[] = ["home", "inbox", "ledger", "people", "settings"];
const PREVIEW_SCREENS: Array<{ id: string; label: string }> = [
  { id: "home", label: "Home" },
  { id: "inbox", label: "Pending inbox" },
  { id: "review", label: "Review transaction" },
  { id: "ledger", label: "Ledger" },
  { id: "people", label: "People" },
  { id: "settings", label: "Settings" },
  { id: "add", label: "Add transaction" },
  { id: "quick", label: "Quick ingestion" },
  { id: "chat", label: "Chat" },
  { id: "chat-approval", label: "Chat, approval" },
  { id: "chat-thinking", label: "Chat, thinking" },
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
      return <PeopleScreen state={state} />;
    case "settings":
      return <SettingsScreen state={state} dispatch={dispatch} />;
    case "add":
      return <AddScreen state={state} dispatch={dispatch} />;
    case "quick":
      return <QuickScreen state={state} dispatch={dispatch} />;
    case "chat":
      return <ChatScreen state={state} dispatch={dispatch} />;
    case "models":
      return <ModelsScreen state={state} dispatch={dispatch} />;
    case "onboarding-welcome":
    case "onboarding-how":
    case "onboarding-ai":
      return <OnboardingScreen state={state} dispatch={dispatch} />;
    default:
      return <HomeScreen state={state} dispatch={dispatch} />;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const pendingCount = selectPending(state).length;
  const deviceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const heading = deviceRef.current?.querySelector<HTMLElement>("h1");
    heading?.focus({ preventScroll: true });
  }, [state.screen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      )
        return;
      if (state.screen === "home" || state.screen.startsWith("onboarding"))
        return;
      dispatch({ type: "back" });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.screen]);

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
        type: "set_quick_input",
        value: "Paid 450 to Aman for lunch. He owes me half.",
      });
      dispatch({ type: "analyze_quick" });
      return;
    }
    if (id === "chat-thinking") {
      dispatch({ type: "navigate", screen: "chat" });
      dispatch({
        type: "set_chat_input",
        value: "How much did I spend on food in October?",
      });
      dispatch({ type: "send_chat" });
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

  const showNav = NAV_SCREENS.includes(state.screen);
  return (
    <div className="preview-shell">
      <aside className="preview-panel" aria-label="UI preview controls">
        <div className="preview-brand">
          <span className="k">V</span>
          <div>
            <strong>Vittaz UI</strong>
            <small>Mobile preview</small>
          </div>
        </div>
        <p className="preview-note">
          Synthetic data only. No backend, AI provider, Telegram bot or device
          storage is connected.
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
          <div className={`screen-scroll ${showNav ? "with-nav" : ""}`}>
            <ScreenView state={state} dispatch={dispatch} />
          </div>
          {showNav && (
            <BottomNav
              current={state.screen}
              dispatch={dispatch}
              pendingCount={pendingCount}
            />
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
