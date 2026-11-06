import type {
  AuditLogRow,
  LedgerRepositories,
  LedgerStore,
  ProposalRow,
  ReadLedgerRepositories,
  TransactionRow,
  UnparsedMessageRow,
  WalletRow,
} from "@vittaz/core";

type StoredRow =
  AuditLogRow | ProposalRow | TransactionRow | UnparsedMessageRow | WalletRow;
const tables: Record<string, Map<string, StoredRow>> = {
  wallets: new Map(),
  transactions: new Map(),
  proposals: new Map(),
  audit: new Map(),
  unparsed_messages: new Map(),
};
const table_for = {
  wallets: "wallets",
  transactions: "transactions",
  proposals: "proposals",
  audit: "audit",
  unparsed_messages: "unparsed_messages",
} as const;

export function getMemoryRows(table: keyof typeof tables): StoredRow[] {
  return [...tables[table].values()];
}

export function resetMemoryLedger(): void {
  for (const table of Object.values(tables)) table.clear();
  const now = "2026-11-06T00:00:00.000Z";
  const wallets: WalletRow[] = [
    {
      id: "cash",
      name: "Cash Wallet",
      kind: "cash",
      opening_balance_paise: 0,
      created_at: now,
    },
    {
      id: "bank_default",
      name: "Primary Bank",
      kind: "bank",
      opening_balance_paise: 0,
      created_at: now,
    },
  ];
  for (const row of wallets) tables.wallets.set(row.id, row);
}

function make_repo<T extends StoredRow>(
  table: keyof typeof table_for,
  writable: boolean,
  active: () => boolean,
) {
  const map = tables[table_for[table]];
  const check = () => {
    if (!active()) throw new Error("repository_scope_expired");
  };
  const base = {
    get: async (id: string) => {
      check();
      return (map.get(id) as T | undefined) ?? null;
    },
    list: async () => {
      check();
      return [...map.values()] as T[];
    },
  };
  if (!writable) return base;
  return {
    ...base,
    insert: async (row: T) => {
      check();
      if (map.has(row.id)) throw new Error("repository_row_exists");
      map.set(row.id, row);
    },
    replace: async (row: T) => {
      check();
      if (!map.has(row.id)) throw new Error("repository_row_missing");
      map.set(row.id, row);
    },
    remove: async (id: string) => {
      check();
      map.delete(id);
    },
  };
}

function repositories(writable: boolean, active: () => boolean) {
  return {
    wallets: make_repo<WalletRow>("wallets", writable, active),
    transactions: make_repo<TransactionRow>("transactions", writable, active),
    proposals: make_repo<ProposalRow>("proposals", writable, active),
    audit: make_repo<AuditLogRow>("audit", writable, active),
    unparsed_messages: make_repo<UnparsedMessageRow>(
      "unparsed_messages",
      writable,
      active,
    ),
  } as unknown as ReadLedgerRepositories | LedgerRepositories;
}

export async function openMobileLedgerStore(): Promise<LedgerStore> {
  return {
    async read<T>(work: (repos: ReadLedgerRepositories) => Promise<T>) {
      let active = true;
      try {
        return await work(
          repositories(false, () => active) as ReadLedgerRepositories,
        );
      } finally {
        active = false;
      }
    },
    async transaction<T>(work: (repos: LedgerRepositories) => Promise<T>) {
      const snapshots = Object.fromEntries(
        Object.entries(tables).map(([key, value]) => [key, new Map(value)]),
      ) as Record<string, Map<string, StoredRow>>;
      let active = true;
      try {
        return await work(
          repositories(true, () => active) as LedgerRepositories,
        );
      } catch (error) {
        for (const [key, snapshot] of Object.entries(snapshots)) {
          tables[key] = snapshot;
        }
        throw error;
      } finally {
        active = false;
      }
    },
    async close() {},
  };
}

resetMemoryLedger();
