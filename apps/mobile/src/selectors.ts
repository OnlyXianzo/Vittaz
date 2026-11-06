import type { AppState, Transaction } from "./domain";

export interface Summary {
  spentPaise: number;
  receivedPaise: number;
  cashPaise: number;
  receivablePaise: number;
  payablePaise: number;
  pendingCount: number;
}

/** Native selectors operate only on rows loaded from LedgerStore. No demo offsets. */
export function selectPending(state: AppState): Transaction[] {
  return state.transactions.filter((row) => row.status === "unverified");
}

export function selectInbox(state: AppState): Transaction[] {
  const pending = selectPending(state);
  if (state.inboxFilter === "upi")
    return pending.filter((row) => row.mode === "UPI");
  if (state.inboxFilter === "sms")
    return pending.filter((row) => row.mode === "SMS");
  return pending;
}

export function selectLedger(state: AppState): Transaction[] {
  let rows = state.transactions;
  if (state.ledgerFilter === "cash")
    rows = rows.filter((row) => row.mode === "Cash");
  if (state.ledgerFilter === "upi")
    rows = rows.filter((row) => row.mode === "UPI");
  if (state.ledgerFilter === "unverified")
    rows = rows.filter((row) => row.status !== "user_confirmed");
  const query = state.ledgerSearch.trim().toLowerCase();
  if (query) {
    rows = rows.filter((row) =>
      [row.title, row.category, row.person, row.note, row.mode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }
  return rows;
}

export function selectSummary(state: AppState): Summary {
  const confirmed = state.transactions.filter(
    (row) => row.status === "user_confirmed",
  );
  const spentPaise = confirmed
    .filter((row) => row.direction === "spent" || row.direction === "lent")
    .reduce((sum, row) => sum + row.amountPaise, 0);
  const receivedPaise = confirmed
    .filter((row) => row.direction === "received")
    .reduce((sum, row) => sum + row.amountPaise, 0);
  const cashPaise = confirmed
    .filter((row) => row.mode === "Cash")
    .reduce(
      (sum, row) =>
        sum +
        (row.direction === "received" ? row.amountPaise : -row.amountPaise),
      0,
    );
  const receivablePaise =
    confirmed.reduce((sum, row) => sum + (row.splitOwedPaise ?? 0), 0) +
    state.people
      .filter((person) => person.balancePaise > 0)
      .reduce((sum, person) => sum + person.balancePaise, 0);
  const payablePaise = state.people
    .filter((person) => person.balancePaise < 0)
    .reduce((sum, person) => sum - person.balancePaise, 0);
  return {
    spentPaise,
    receivedPaise,
    cashPaise,
    receivablePaise,
    payablePaise,
    pendingCount: selectPending(state).length,
  };
}

export function groupByDay(
  rows: Transaction[],
): Array<{ day: string; rows: Transaction[] }> {
  const groups = new Map<string, Transaction[]>();
  for (const row of rows) {
    const group = groups.get(row.day) ?? [];
    group.push(row);
    groups.set(row.day, group);
  }
  return [...groups.entries()].map(([day, grouped]) => ({
    day,
    rows: grouped,
  }));
}
