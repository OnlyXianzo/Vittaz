import { afterEach, expect, test } from "vitest";
import { openLedgerStore } from "./repositories.js";
import type { LedgerRepositories, WalletRow } from "@vittaz/core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const stores: ReturnType<typeof openLedgerStore>[] = [];
function open(path = ":memory:") {
  const store = openLedgerStore(path);
  stores.push(store);
  return store;
}
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});
const wallet: WalletRow = {
  id: "synthetic_wallet",
  name: "Synthetic Cash",
  kind: "cash",
  opening_balance_paise: 1234,
  created_at: "2026-11-04T00:00:00Z",
};

test("repository_wallet_crud_and_missing_rows_are_async", async () => {
  const store = open();
  await store.transaction(async (r) => {
    expect(await r.wallets.get("missing")).toBeNull();
    await r.wallets.insert(wallet);
    expect(await r.wallets.get(wallet.id)).toEqual(wallet);
    expect((await r.wallets.list()).length).toBe(3);
    await r.wallets.replace({ ...wallet, name: "Synthetic Update" });
    expect((await r.wallets.get(wallet.id))?.name).toBe("Synthetic Update");
    await r.wallets.remove(wallet.id);
    expect(await r.wallets.get(wallet.id)).toBeNull();
  });
  await expect(
    store.transaction((r) => r.wallets.replace(wallet)),
  ).rejects.toThrow("repository_row_missing");
  await expect(
    store.transaction((r) =>
      r.wallets.insert({ ...wallet, opening_balance_paise: -0 }),
    ),
  ).rejects.toThrow();
  expect(await store.read((r) => r.wallets.get(wallet.id))).toBeNull();
});
test("repository_transaction_rolls_back_after_await_and_queue_recovers", async () => {
  const store = open();
  await expect(
    store.transaction(async (r) => {
      await r.wallets.insert(wallet);
      await Promise.resolve();
      throw new Error("synthetic_failure");
    }),
  ).rejects.toThrow("synthetic_failure");
  expect(await store.read((r) => r.wallets.get(wallet.id))).toBeNull();
  await store.transaction((r) => r.wallets.insert(wallet));
  expect(await store.read((r) => r.wallets.get(wallet.id))).toEqual(wallet);
});
test("repository_serializes_concurrent_work_and_rejects_reentrancy", async () => {
  const store = open();
  const order: string[] = [];
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = store.transaction(async (r) => {
    order.push("first");
    await r.wallets.insert(wallet);
    await barrier;
    order.push("commit");
  });
  const second = store.read(async (r) => {
    order.push("second");
    return r.wallets.get(wallet.id);
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(order).toEqual(["first"]);
  release();
  await first;
  expect(await second).toEqual(wallet);
  expect(order).toEqual(["first", "commit", "second"]);
  await expect(
    store.transaction(async () => store.read(async () => null)),
  ).rejects.toThrow("repository_reentrant_access");
});
test("repository_capabilities_expire_and_read_has_no_write_methods", async () => {
  const store = open();
  let leaked!: LedgerRepositories;
  await store.transaction(async (r) => {
    leaked = r;
  });
  await expect(leaked.wallets.list()).rejects.toThrow(
    "repository_scope_expired",
  );
  await expect(leaked.wallets.get("cash")).rejects.toThrow(
    "repository_scope_expired",
  );
  await expect(leaked.wallets.insert(wallet)).rejects.toThrow(
    "repository_scope_expired",
  );
  await expect(leaked.wallets.replace(wallet)).rejects.toThrow(
    "repository_scope_expired",
  );
  await expect(leaked.wallets.remove("cash")).rejects.toThrow(
    "repository_scope_expired",
  );
  await store.read(async (r) => {
    expect(Object.keys(r.wallets).sort()).toEqual(["get", "list"]);
  });
});
test("repository_close_is_idempotent_and_later_operations_reject", async () => {
  const store = open();
  await store.close();
  await store.close();
  await expect(store.read(async () => null)).rejects.toThrow(
    "repository_closed",
  );
  await expect(store.transaction(async () => null)).rejects.toThrow(
    "repository_closed",
  );
});
test("repository_file_persists_and_failed_open_does_not_return_store", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vittaz-store-"));
  try {
    const path = join(dir, "synthetic.sqlite");
    const first = open(path);
    await first.transaction((r) => r.wallets.insert(wallet));
    await first.close();
    const second = open(path);
    expect(await second.read((r) => r.wallets.get(wallet.id))).toEqual(wallet);
    expect(() => openLedgerStore(join(dir, "missing", "db.sqlite"))).toThrow();
  } finally {
    for (const s of stores.splice(0)) await s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("repository_transaction_proposal_and_audit_round_trip_all_fields", async () => {
  const store = open();
  const tx = {
    id: "synthetic_tx",
    wallet_id: "cash",
    amount_paise: 123,
    direction: "debit" as const,
    event_type: "normal" as const,
    category: "synthetic",
    counterparty_name: null,
    account_last4: null,
    dedup_key: null,
    note: null,
    status: "unverified" as const,
    source: "import",
    proposal_id: null,
    benefit: "self",
    benefit_paise: 1,
    tag: "synthetic_tag",
    tags_json: "[]",
    import_fingerprint: null,
    split_owed_paise: 0,
    occurred_at: wallet.created_at,
    created_at: wallet.created_at,
    updated_at: wallet.created_at,
  };
  const proposal = {
    id: "synthetic_proposal",
    wallet_id: "cash",
    amount_paise: 123,
    direction: "debit" as const,
    event_type: "normal" as const,
    category: "synthetic",
    counterparty_name: null,
    note: null,
    source: "ai",
    initial_tx_status: "ai_checked" as const,
    status: "pending" as const,
    committed_tx_id: null,
    benefit: "self",
    benefit_paise: 0,
    tag: null,
    tags_json: "[]",
    split_owed_paise: 0,
    occurred_at: wallet.created_at,
    created_at: wallet.created_at,
  };
  const audit = {
    id: "synthetic_audit",
    action: "synthetic",
    entity_type: "transaction",
    entity_id: tx.id,
    before_state: null,
    after_state: "{}",
    related_proposal_before: null,
    undone: 0 as const,
    created_at: wallet.created_at,
  };
  await store.transaction(async (r) => {
    expect(await r.transactions.get("missing")).toBeNull();
    expect(await r.proposals.get("missing")).toBeNull();
    expect(await r.audit.get("missing")).toBeNull();
    await r.transactions.insert(tx);
    await r.proposals.insert(proposal);
    await r.audit.insert(audit);
    expect(await r.transactions.get(tx.id)).toEqual(tx);
    expect(await r.proposals.get(proposal.id)).toEqual(proposal);
    expect(await r.audit.get(audit.id)).toEqual(audit);
    expect(await r.transactions.list()).toEqual([tx]);
    expect(await r.proposals.list()).toEqual([proposal]);
    expect(await r.audit.list()).toEqual([audit]);
    await r.transactions.replace({ ...tx, note: "synthetic note" });
    await r.proposals.replace({ ...proposal, note: "synthetic proposal note" });
    await r.audit.replace({ ...audit, undone: 1 });
    expect((await r.transactions.get(tx.id))?.note).toBe("synthetic note");
    expect((await r.proposals.get(proposal.id))?.note).toBe(
      "synthetic proposal note",
    );
    expect((await r.audit.get(audit.id))?.undone).toBe(1);
    await r.audit.remove(audit.id);
    await r.transactions.remove(tx.id);
    await r.proposals.remove(proposal.id);
  });
  await expect(
    store.transaction((r) => r.transactions.replace(tx)),
  ).rejects.toThrow("repository_row_missing");
  await expect(
    store.transaction((r) => r.proposals.replace(proposal)),
  ).rejects.toThrow("repository_row_missing");
  await expect(
    store.transaction((r) => r.audit.replace(audit)),
  ).rejects.toThrow("repository_row_missing");
  for (const amount of [123.4, NaN, -0, 0, -1, Number.MAX_SAFE_INTEGER + 1])
    await expect(
      store.transaction((r) =>
        r.transactions.insert({ ...tx, amount_paise: amount }),
      ),
    ).rejects.toThrow();
  await expect(
    store.transaction((r) =>
      r.proposals.insert({ ...proposal, benefit_paise: -1 }),
    ),
  ).rejects.toThrow();
  await expect(
    store.transaction((r) =>
      r.transactions.insert({ ...tx, split_owed_paise: -1 }),
    ),
  ).rejects.toThrow();
  await store.transaction((r) => r.transactions.insert(tx));
  await expect(
    store.transaction((r) => r.transactions.insert(tx)),
  ).rejects.toThrow();
  await expect(
    store.transaction((r) =>
      r.transactions.insert({
        ...tx,
        id: "synthetic_orphan",
        wallet_id: "missing",
      }),
    ),
  ).rejects.toThrow();
});

test("repository_open_rejects_future_schema_and_automatic_rollback_recovers", async () => {
  const { default: Database } = await import("better-sqlite3");
  const dir = mkdtempSync(join(tmpdir(), "vittaz-future-"));
  try {
    const path = join(dir, "synthetic.sqlite");
    const native = new Database(path);
    native.pragma("user_version = 3");
    native.close();
    expect(() => openLedgerStore(path)).toThrow("schema_newer_than_supported");
    const reset = new Database(path);
    reset.pragma("user_version = 0");
    reset.close();
    const store = open(path);
    const trigger = new Database(path);
    trigger.exec(
      "CREATE TRIGGER synthetic_rollback BEFORE INSERT ON wallets BEGIN SELECT RAISE(ROLLBACK, 'synthetic_rollback'); END",
    );
    trigger.close();
    await expect(
      store.transaction((r) => r.wallets.insert(wallet)),
    ).rejects.toThrow();
    const cleanup = new Database(path);
    cleanup.exec("DROP TRIGGER synthetic_rollback");
    cleanup.close();
    await store.transaction((r) => r.wallets.insert(wallet));
    expect(await store.read((r) => r.wallets.get(wallet.id))).toEqual(wallet);
    await expect(store.read(async () => store.close())).rejects.toThrow(
      "repository_reentrant_access",
    );
  } finally {
    for (const store of stores.splice(0)) await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("repository_local_unparsed_queue_crud_rollback_and_scope", async () => {
  const store = open();
  const row = {
    id: "synthetic_unparsed",
    app_package: "synthetic.app",
    sanitized_text: "statement ready",
    post_time: "2026-11-04T00:00:00.000Z",
    reason: "unknown_format",
    routed_to: "unparsed_list" as const,
    created_at: "2026-11-04T00:00:00.000Z",
  };
  expect(
    await store.read((r) => r.unparsed_messages.get("missing")),
  ).toBeNull();
  await store.transaction(async (r) => {
    await r.unparsed_messages.insert(row);
    expect(await r.unparsed_messages.get(row.id)).toEqual(row);
    await r.unparsed_messages.replace({ ...row, reason: "reviewed" });
    expect((await r.unparsed_messages.list())[0]!.reason).toBe("reviewed");
    await r.unparsed_messages.remove(row.id);
  });
  await expect(
    store.transaction((r) => r.unparsed_messages.replace(row)),
  ).rejects.toThrow("repository_row_missing");
  await expect(
    store.transaction(async (r) => {
      await r.unparsed_messages.insert(row);
      throw new Error("synthetic_rollback");
    }),
  ).rejects.toThrow("synthetic_rollback");
  expect(await store.read((r) => r.unparsed_messages.list())).toEqual([]);
  let leaked!: LedgerRepositories;
  await store.transaction(async (r) => {
    leaked = r;
  });
  await expect(leaked.unparsed_messages.insert(row)).rejects.toThrow(
    "repository_scope_expired",
  );
});
