import type { AppState, Transaction } from "./types";

export interface Summary {
  spentPaise: number;
  receivedPaise: number;
  cashPaise: number;
  receivablePaise: number;
  payablePaise: number;
  pendingCount: number;
}

export function selectPending(state: AppState): Transaction[] {
  return state.transactions.filter((t) => t.status === "unverified");
}

export function selectInbox(state: AppState): Transaction[] {
  const pending = selectPending(state);
  if (state.inboxFilter === "upi")
    return pending.filter((t) => t.mode === "UPI");
  if (state.inboxFilter === "sms")
    return pending.filter((t) => t.mode === "SMS");
  return pending;
}

export function selectLedger(state: AppState): Transaction[] {
  let rows = state.transactions;
  if (state.ledgerFilter === "cash")
    rows = rows.filter((t) => t.mode === "Cash");
  if (state.ledgerFilter === "upi") rows = rows.filter((t) => t.mode === "UPI");
  if (state.ledgerFilter === "unverified")
    rows = rows.filter((t) => t.status !== "user_confirmed");
  const query = state.ledgerSearch.trim().toLowerCase();
  if (query) {
    rows = rows.filter((t) =>
      [t.title, t.category, t.person, t.note, t.mode]
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
    (t) => t.status === "user_confirmed",
  );
  const spent = confirmed
    .filter((t) => t.direction === "spent")
    .reduce((s, t) => s + t.amountPaise, 0);
  const received = confirmed
    .filter((t) => t.direction === "received")
    .reduce((s, t) => s + t.amountPaise, 0);
  const cash = confirmed
    .filter((t) => t.mode === "Cash")
    .reduce(
      (s, t) =>
        s + (t.direction === "received" ? t.amountPaise : -t.amountPaise),
      0,
    );
  const receivable = state.people
    .filter((p) => p.balancePaise > 0)
    .reduce((s, p) => s + p.balancePaise, 0);
  const payable = state.people
    .filter((p) => p.balancePaise < 0)
    .reduce((s, p) => s - p.balancePaise, 0);
  return {
    spentPaise: 647100 + spent,
    receivedPaise: 200000 + received,
    cashPaise: 73000 + cash,
    receivablePaise: receivable,
    payablePaise: payable,
    pendingCount: selectPending(state).length,
  };
}

export function groupByDay(
  rows: Transaction[],
): Array<{ day: string; rows: Transaction[] }> {
  const order = ["Today", "Yesterday", "27 Oct"];
  const groups = new Map<string, Transaction[]>();
  for (const row of rows) {
    const list = groups.get(row.day) ?? [];
    list.push(row);
    groups.set(row.day, list);
  }
  return order
    .filter((day) => groups.has(day))
    .map((day) => ({ day, rows: groups.get(day) ?? [] }));
}
