import { afterEach, expect, test } from "vitest";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openLedgerStore } from "./repositories.js";
import {
  createBackup,
  restoreBackup,
  EXPORT_PRIVACY_WARNING,
} from "./backup.js";
import {
  createManualTransaction,
  createProposal,
  approveProposal,
  updateTransaction,
  setWalletOpeningBalance,
  getWalletSummary,
} from "@vittaz/core";
const stores: ReturnType<typeof openLedgerStore>[] = [];
function open(path = ":memory:") {
  const s = openLedgerStore(path);
  stores.push(s);
  return s;
}
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
});
const input = { amountPaise: 45000, direction: "debit" as const };
function rehash<T extends { payload: unknown; checksumSha256: string }>(
  data: T,
): T {
  data.checksumSha256 = createHash("sha256")
    .update(JSON.stringify(data.payload))
    .digest("hex");
  return data;
}

test("baseline_1_7_backup_reproduces_ledger_and_verifies_checksum", async () => {
  const source = open();
  await setWalletOpeningBalance(source, "cash", 250000);
  const tx = await createManualTransaction(source, {
    ...input,
    note: "synthetic note",
    counterpartyName: "Synthetic Person",
    benefit: "shared",
    tags: ["synthetic"],
    splitOwedPaise: 22500,
    benefitPaise: 7,
    tag: "synthetic",
  });
  await updateTransaction(source, tx.transaction.id, {
    note: "synthetic edited",
  });
  await createProposal(source, input);
  const p = await createProposal(source, input);
  await approveProposal(source, p.id);
  const backup = await createBackup(source);
  expect(backup.privacyWarning).toBe(EXPORT_PRIVACY_WARNING);
  const tampered = structuredClone(backup);
  tampered.payload.tables.transactions[0]!.amount_paise = 1;
  const target = open();
  await expect(restoreBackup(target, tampered)).rejects.toThrow(
    "SHA-256 checksum mismatch",
  );
  await restoreBackup(target, backup);
  expect((await createBackup(target)).payload).toEqual(backup.payload);
  expect(await getWalletSummary(target)).toEqual(
    await getWalletSummary(source),
  );
  await restoreBackup(target, backup);
  expect((await createBackup(target)).payload).toEqual(backup.payload);
});
test("backup_includes_counterparties_but_excludes_nonallowlisted_settings_both_directions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vittaz-backup-"));
  try {
    const path = join(dir, "synthetic.sqlite");
    const source = open(path);
    const db = new Database(path);
    db.prepare("INSERT INTO counterparties VALUES (?,?,?,?)").run(
      "synthetic_person",
      "Synthetic Person",
      "Person_1",
      "2026-11-04T00:00:00Z",
    );
    db.prepare("INSERT INTO app_settings VALUES (?,?)").run(
      "synthetic_provider_secret",
      "synthetic_forbidden_marker",
    );
    db.close();
    const b = await createBackup(source);
    expect(JSON.stringify(b)).not.toContain("synthetic_forbidden_marker");
    expect(b.payload.tables.counterparties.length).toBe(1);
    const target = open();
    await restoreBackup(target, b);
    expect((await createBackup(target)).payload).toEqual(b.payload);
    const bad = structuredClone(b);
    bad.payload.settings.push({
      key: "synthetic_provider_secret",
      value_json: "false",
    } as never);
    await expect(restoreBackup(target, rehash(bad))).rejects.toThrow(
      "Invalid backup format",
    );
  } finally {
    for (const s of stores.splice(0)) await s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("backup_validation_and_fk_failure_leave_target_unchanged", async () => {
  const source = open();
  const tx = await createManualTransaction(source, input);
  const b = await createBackup(source);
  const target = open();
  await createManualTransaction(target, { ...input, amountPaise: 999 });
  const before = (await createBackup(target)).payload;
  for (const bad of [
    null,
    {},
    { ...b, format: "invalid" },
    { ...b, schemaVersion: 3 },
  ])
    await expect(restoreBackup(target, bad)).rejects.toThrow(
      "Invalid backup format",
    );
  const unsafe = structuredClone(b);
  unsafe.payload.tables.transactions[0]!.amount_paise = -0;
  await expect(restoreBackup(target, rehash(unsafe))).rejects.toThrow(
    "Invalid backup format",
  );
  const orphan = structuredClone(b);
  orphan.payload.tables.transactions[0]!.wallet_id = "missing";
  await expect(restoreBackup(target, rehash(orphan))).rejects.toThrow();
  expect((await createBackup(target)).payload).toEqual(before);
  const duplicate = structuredClone(b);
  duplicate.payload.tables.transactions.push(tx.transaction);
  await expect(restoreBackup(target, rehash(duplicate))).rejects.toThrow();
  expect((await createBackup(target)).payload).toEqual(before);
  const malformed = structuredClone(b);
  malformed.payload.tables.audit_log[0]!.after_state =
    '{"id":"synthetic_only"}';
  await expect(restoreBackup(target, rehash(malformed))).rejects.toThrow(
    "Invalid backup format",
  );
  const badJson = structuredClone(b);
  badJson.payload.tables.audit_log[0]!.after_state = "not-json";
  await expect(restoreBackup(target, rehash(badJson))).rejects.toThrow(
    "Invalid backup format",
  );
  const badTags = structuredClone(b);
  badTags.payload.tables.transactions[0]!.tags_json = "{}";
  await expect(restoreBackup(target, rehash(badTags))).rejects.toThrow(
    "Invalid backup format",
  );
});

test("backup_rejects_invalid_local_data_and_sorts_audits_deterministically", async () => {
  const source = open();
  let n = 0;
  for (const now of [
    "2026-11-04T02:00:00Z",
    "2026-11-04T01:00:00Z",
    "2026-11-04T01:00:00Z",
  ]) {
    await createManualTransaction(source, input, {
      now: () => now,
      makeId: (p) => `${p}_synthetic_${++n}`,
    });
  }
  const b = await createBackup(source, "2026-11-04T03:00:00Z");
  expect(b.payload.tables.audit_log.map((x) => x.created_at)).toEqual([
    "2026-11-04T01:00:00Z",
    "2026-11-04T01:00:00Z",
    "2026-11-04T02:00:00Z",
  ]);
  const invalid = {
    ...source,
    exportSnapshot: async () => ({
      ...b.payload,
      settings: [
        {
          key: "send_notes_to_cloud" as const,
          value_json: "invalid" as "false",
        },
      ],
    }),
  };
  await expect(createBackup(invalid)).rejects.toThrow(
    "Invalid local backup data",
  );
  const tags = structuredClone(b);
  tags.payload.tables.transactions[0]!.tags_json = "invalid-json";
  await expect(restoreBackup(source, rehash(tags))).rejects.toThrow(
    "Invalid backup format",
  );
});
