import { createHash } from "node:crypto";
import { z } from "zod";
import { payloadSchema } from "./backup_schema.js";
import type { BackupPayload } from "./backup_schema.js";
import type { LedgerStore } from "@vittaz/core";

export const EXPORT_PRIVACY_WARNING =
  "WARNING: This backup contains unredacted ledger entries, counterparty names, and notes. Store securely. API keys and Telegram tokens are excluded.";
export interface SnapshotStore extends LedgerStore {
  exportSnapshot(): Promise<unknown>;
  replaceSnapshot(payload: BackupPayload): Promise<void>;
}
const backupSchema = z.strictObject({
  format: z.literal("khataclaw-backup-v1"),
  schemaVersion: z.literal(2),
  exportedAt: z.string(),
  privacyWarning: z.literal(EXPORT_PRIVACY_WARNING),
  checksumSha256: z.string(),
  payload: payloadSchema,
});
export type LedgerBackup = z.infer<typeof backupSchema>;
export type KhataclawBackup = LedgerBackup;
export type { BackupPayload } from "./backup_schema.js";
function hash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
export async function createBackup(
  store: SnapshotStore,
  exportedAt = new Date().toISOString(),
): Promise<LedgerBackup> {
  const parsed = payloadSchema.safeParse(await store.exportSnapshot());
  if (!parsed.success) throw new Error("Invalid local backup data");
  const payload = parsed.data;
  return {
    format: "khataclaw-backup-v1",
    schemaVersion: 2,
    exportedAt,
    privacyWarning: EXPORT_PRIVACY_WARNING,
    checksumSha256: hash(payload),
    payload,
  };
}
export async function restoreBackup(
  store: SnapshotStore,
  data: unknown,
): Promise<void> {
  const parsed = backupSchema.safeParse(data);
  if (!parsed.success) throw new Error("Invalid backup format");
  if (hash((data as LedgerBackup).payload) !== parsed.data.checksumSha256)
    throw new Error("Backup integrity check failed: SHA-256 checksum mismatch");
  await store.replaceSnapshot(parsed.data.payload);
}
