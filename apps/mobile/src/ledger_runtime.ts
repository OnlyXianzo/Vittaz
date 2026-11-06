import { randomUUID } from "expo-crypto";
import type { LedgerRuntime } from "@vittaz/core";

/** Platform runtime for core ledger writes; Hermes Web Crypto is not assumed. */
export const mobileLedgerRuntime: LedgerRuntime = {
  now: () => new Date().toISOString(),
  makeId: (prefix) => `${prefix}_${randomUUID()}`,
};
