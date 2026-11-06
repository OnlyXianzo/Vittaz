import { createContext, useContext, useEffect, useReducer } from "react";
import type { Dispatch, ReactNode } from "react";
import { createInitialState, reducer } from "./domain";
import type { Action, AppState } from "./domain";

interface Store {
  state: AppState;
  dispatch: Dispatch<Action>;
}

const StoreContext = createContext<Store | null>(null);

/**
 * Same reducer as the preview, plus the two timers the browser version kept in
 * components: the toast auto-dismiss and the deterministic "thinking" delay.
 * Keeping them here means they survive navigation on a device.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  useEffect(() => {
    if (!state.toast) return;
    const timer = setTimeout(() => dispatch({ type: "clear_toast" }), 3200);
    return () => clearTimeout(timer);
  }, [state.toast]);

  useEffect(() => {
    if (state.chatMode !== "thinking") return;
    const timer = setTimeout(
      () => dispatch({ type: "finish_chat_thinking" }),
      900,
    );
    return () => clearTimeout(timer);
  }, [state.chatMode]);

  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useApp(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useApp must be used inside <AppProvider>");
  return store;
}
