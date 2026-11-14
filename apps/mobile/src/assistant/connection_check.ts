/**
 * What a connection check found, and how to read one back from storage.
 *
 * Lives in its own module because two layers need the type: the key registry
 * owns the check itself, and the profile manifest persists it. Importing one
 * from the other would make them a cycle.
 */
export type ConnectionCheck =
  | { readonly state: "untested" }
  | {
      readonly state: "reachable";
      readonly models: number;
      readonly at: number;
    }
  | {
      readonly state: "rejected" | "unreachable";
      readonly at: number;
    };

export const UNTESTED: ConnectionCheck = { state: "untested" };

function is_instant(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

/**
 * A stored check, or `untested` for anything unrecognised.
 *
 * Deliberately total: a check is a hint, and a corrupt one must not make a
 * profile unreadable. Nothing here can carry text from the provider.
 */
export function parse_connection_check(value: unknown): ConnectionCheck {
  if (value === null || typeof value !== "object") return UNTESTED;
  const check = value as {
    state?: unknown;
    models?: unknown;
    at?: unknown;
  };
  if (!is_instant(check.at)) return UNTESTED;
  if (check.state === "reachable") {
    if (!is_instant(check.models)) return UNTESTED;
    return { state: "reachable", models: check.models, at: check.at };
  }
  if (check.state === "rejected" || check.state === "unreachable")
    return { state: check.state, at: check.at };
  return UNTESTED;
}
