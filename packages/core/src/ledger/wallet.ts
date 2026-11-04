import { assertIntegerPaise, sumPaise } from "./money.js";
import { defaultLedgerRuntime } from "./ledger.js";
import type { LedgerStore, WalletRow } from "./repositories.js";
export type { WalletRow } from "./repositories.js";
export interface WalletSummary {
  walletId: string;
  openingBalancePaise: number;
  cashInPaise: number;
  cashOutPaise: number;
  balancePaise: number;
}
export async function createWallet(
  store: LedgerStore,
  input: {
    name: string;
    kind: WalletRow["kind"];
    openingBalancePaise?: number;
  },
  runtime = defaultLedgerRuntime,
): Promise<WalletRow> {
  if (!input.name.trim() || !["cash", "bank", "upi"].includes(input.kind))
    throw new Error("Invalid wallet name/kind");
  const row: WalletRow = {
    id: runtime.makeId("wallet"),
    name: input.name,
    kind: input.kind,
    opening_balance_paise: assertIntegerPaise(input.openingBalancePaise ?? 0),
    created_at: runtime.now(),
  };
  await store.transaction((r) => r.wallets.insert(row));
  return row;
}
export async function setWalletOpeningBalance(
  store: LedgerStore,
  id: string,
  openingBalancePaise: number,
): Promise<void> {
  assertIntegerPaise(openingBalancePaise, "openingBalancePaise");
  await store.transaction(async (r) => {
    const row = await r.wallets.get(id);
    if (!row) throw new Error(`Wallet not found: ${id}`);
    await r.wallets.replace({
      ...row,
      opening_balance_paise: openingBalancePaise,
    });
  });
}
export function getWalletSummary(
  store: LedgerStore,
  id = "cash",
): Promise<WalletSummary> {
  return store.read(async (r) => {
    const wallet = await r.wallets.get(id);
    if (!wallet) throw new Error(`Wallet not found: ${id}`);
    const rows = (await r.transactions.list()).filter(
      (row) => row.wallet_id === id,
    );
    const cashInPaise = sumPaise(
      rows
        .filter((row) => row.direction === "credit")
        .map((row) => row.amount_paise),
    );
    const cashOutPaise = sumPaise(
      rows
        .filter(
          (row) => row.direction === "debit" && row.event_type === "normal",
        )
        .map((row) => row.amount_paise),
    );
    const balancePaise = assertIntegerPaise(
      Number(
        BigInt(wallet.opening_balance_paise) +
          BigInt(cashInPaise) -
          BigInt(cashOutPaise),
      ),
      "balancePaise",
    );
    return {
      walletId: id,
      openingBalancePaise: wallet.opening_balance_paise,
      cashInPaise,
      cashOutPaise,
      balancePaise,
    };
  });
}
