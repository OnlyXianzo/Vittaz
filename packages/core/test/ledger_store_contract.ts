import type {
  AuditLogRow,
  LedgerStore,
  ProposalRow,
  TransactionRow,
  WalletRow,
} from "../src/index.js";

export interface ContractAssertions {
  equal(actual: unknown, expected: unknown): void;
  deepEqual(actual: unknown, expected: unknown): void;
  asyncRejects(promise: Promise<unknown>, message: string): Promise<void>;
}

/**
 * Framework-neutral acceptance cases shared by the Node and Expo SQLite
 * adapters. These assert the public core LedgerStore contract only; tests for
 * a specific native/Node driver remain in that driver's own suite.
 */
export function ledgerStoreContractCases(open: () => Promise<LedgerStore>) {
  const wallet: WalletRow = {
    id: "contract_wallet",
    name: "Synthetic Contract Wallet",
    kind: "cash",
    opening_balance_paise: 1234,
    created_at: "2026-11-06T00:00:00.000Z",
  };
  const proposal: ProposalRow = {
    id: "contract_proposal",
    wallet_id: "cash",
    amount_paise: 2500,
    direction: "debit",
    event_type: "normal",
    category: "synthetic",
    counterparty_name: "Person_1",
    note: null,
    source: "manual",
    initial_tx_status: "user_confirmed",
    status: "pending",
    committed_tx_id: null,
    benefit: "self",
    benefit_paise: 0,
    tag: null,
    tags_json: "[]",
    split_owed_paise: 0,
    occurred_at: "2026-11-06T00:00:00.000Z",
    created_at: "2026-11-06T00:00:00.000Z",
  };
  const audit: AuditLogRow = {
    id: "contract_audit",
    action: "proposal_created",
    entity_type: "proposal",
    entity_id: proposal.id,
    before_state: null,
    after_state: JSON.stringify(proposal),
    related_proposal_before: null,
    undone: 0,
    created_at: "2026-11-06T00:00:00.000Z",
  };

  return [
    {
      name: "ledger_store_crud_and_capability_contract",
      run: async (a: ContractAssertions) => {
        const store = await open();
        try {
          await store.transaction(async (repos) => {
            a.equal(await repos.wallets.get("missing"), null);
            await repos.wallets.insert(wallet);
            a.deepEqual(await repos.wallets.get(wallet.id), wallet);
            a.equal((await repos.wallets.list()).length, 3);
            await repos.wallets.replace({ ...wallet, name: "Changed" });
            a.equal((await repos.wallets.get(wallet.id))?.name, "Changed");
            await repos.wallets.remove(wallet.id);
            a.equal(await repos.wallets.get(wallet.id), null);
          });
          await a.asyncRejects(
            store.transaction((repos) => repos.wallets.replace(wallet)),
            "repository_row_missing",
          );
          let leaked:
            | Awaited<Parameters<Parameters<LedgerStore["transaction"]>[0]>[0]>
            | undefined;
          await store.transaction(async (repos) => {
            leaked = repos;
          });
          if (!leaked) throw new Error("contract_missing_scope");
          await a.asyncRejects(
            leaked.wallets.get(wallet.id),
            "repository_scope_expired",
          );
          await store.read(async (repos) => {
            a.deepEqual(Object.keys(repos.wallets).sort(), ["get", "list"]);
          });
        } finally {
          await store.close();
        }
      },
    },
    {
      name: "ledger_store_async_rollback_and_queue_recovery_contract",
      run: async (a: ContractAssertions) => {
        const store = await open();
        try {
          await a.asyncRejects(
            store.transaction(async (repos) => {
              await repos.wallets.insert(wallet);
              await Promise.resolve();
              throw new Error("contract_rollback");
            }),
            "contract_rollback",
          );
          a.equal(
            await store.read((repos) => repos.wallets.get(wallet.id)),
            null,
          );
          await store.transaction((repos) => repos.wallets.insert(wallet));
          a.deepEqual(
            await store.read((repos) => repos.wallets.get(wallet.id)),
            wallet,
          );
        } finally {
          await store.close();
        }
      },
    },
    {
      name: "ledger_store_enforces_wallet_foreign_keys_contract",
      run: async (a: ContractAssertions) => {
        const store = await open();
        try {
          const transaction: TransactionRow = {
            id: "contract_orphan_tx",
            wallet_id: "missing_wallet",
            amount_paise: 10,
            direction: "debit",
            event_type: "normal",
            category: "synthetic",
            counterparty_name: null,
            account_last4: null,
            dedup_key: null,
            note: null,
            status: "user_confirmed",
            source: "manual",
            proposal_id: null,
            benefit: "self",
            benefit_paise: 0,
            tag: null,
            tags_json: "[]",
            import_fingerprint: null,
            split_owed_paise: 0,
            occurred_at: "2026-11-06T00:00:00.000Z",
            created_at: "2026-11-06T00:00:00.000Z",
            updated_at: "2026-11-06T00:00:00.000Z",
          };
          await a.asyncRejects(
            store.transaction((repos) =>
              repos.transactions.insert(transaction),
            ),
            "FOREIGN KEY",
          );
        } finally {
          await store.close();
        }
      },
    },
    {
      name: "ledger_store_serializes_external_operations_contract",
      run: async (a: ContractAssertions) => {
        const store = await open();
        try {
          const order: string[] = [];
          let release!: () => void;
          const barrier = new Promise<void>((resolve) => {
            release = resolve;
          });
          const first = store.transaction(async (repos) => {
            order.push("transaction");
            await repos.wallets.insert(wallet);
            await barrier;
            order.push("commit");
          });
          const second = store.read(async (repos) => {
            order.push("read");
            return repos.wallets.get(wallet.id);
          });
          await Promise.resolve();
          a.deepEqual(order, ["transaction"]);
          release();
          await first;
          a.deepEqual(await second, wallet);
          a.deepEqual(order, ["transaction", "commit", "read"]);
        } finally {
          await store.close();
        }
      },
    },
    {
      name: "ledger_store_rejects_direct_reentrant_access_contract",
      run: async (a: ContractAssertions) => {
        const store = await open();
        try {
          await a.asyncRejects(
            store.transaction(async () => store.read(async () => null)),
            "repository_reentrant_access",
          );
          await a.asyncRejects(
            store.read(async () => store.close()),
            "repository_reentrant_access",
          );
        } finally {
          await store.close();
        }
      },
    },
    {
      name: "ledger_store_close_is_idempotent_contract",
      run: async (a: ContractAssertions) => {
        const store = await open();
        await store.close();
        await store.close();
        await a.asyncRejects(
          store.read(async () => null),
          "repository_closed",
        );
        await a.asyncRejects(
          store.transaction(async () => null),
          "repository_closed",
        );
      },
    },
    {
      name: "ledger_store_proposal_and_audit_round_trip_contract",
      run: async (a: ContractAssertions) => {
        const store = await open();
        try {
          await store.transaction(async (repos) => {
            await repos.proposals.insert(proposal);
            await repos.audit.insert(audit);
            a.deepEqual(await repos.proposals.get(proposal.id), proposal);
            a.deepEqual(await repos.audit.get(audit.id), audit);
          });
        } finally {
          await store.close();
        }
      },
    },
  ] as const;
}
