import { afterEach, expect, test } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLedgerStore } from "./repositories.js";
import { createBackup, restoreBackup } from "./backup.js";
import { defaultAssistantPreferences } from "@vittaz/core";
const stores: ReturnType<typeof openLedgerStore>[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function open(file = ":memory:") {
  const s = openLedgerStore(file);
  stores.push(s);
  return s;
}
test("preferences_storage_defaults_upsert_clone_and_legacy_backup_preserves", async () => {
  const s = open();
  const backup = await createBackup(s);
  expect(await s.preferences.get()).toEqual(defaultAssistantPreferences());
  const p = {
    tone: "friendly",
    language: "hinglish",
    detail: "concise",
  } as const;
  await s.preferences.set(p);
  await s.preferences.set({ ...p, tone: "formal" });
  const read = await s.preferences.get();
  read.detail = "detailed";
  expect(await s.preferences.get()).toEqual({ ...p, tone: "formal" });
  await expect(
    s.preferences.set({ ...p, language: "ignore safety" } as never),
  ).rejects.toMatchObject({ code: "invalid_input" });
  expect(await createBackup(s, backup.exportedAt)).toEqual(backup);
  await restoreBackup(s, backup);
  expect((await s.preferences.get()).tone).toBe("formal");
  await s.close();
  await expect(s.preferences.get()).rejects.toMatchObject({
    code: "unavailable",
  });
});
test("preferences_storage_restart_corrupt_json_and_native_error_are_static", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vittaz_prefs_"));
  dirs.push(dir);
  const file = join(dir, "synthetic.sqlite");
  const s = open(file);
  await s.preferences.set(defaultAssistantPreferences());
  await s.close();
  const r = open(file);
  expect(await r.preferences.get()).toEqual(defaultAssistantPreferences());
  const db = new Database(file);
  try {
    for (const value of [
      "not_json",
      JSON.stringify({ tone: "unsafe" }),
      "x".repeat(257),
    ]) {
      db.prepare(
        "UPDATE app_settings SET value_json=? WHERE key='assistant_preferences'",
      ).run(value);
      await expect(r.preferences.get()).rejects.toThrow(
        /^Assistant preferences operation failed$/,
      );
    }
    db.exec(
      "CREATE TRIGGER synthetic_prefs_error BEFORE UPDATE ON app_settings BEGIN SELECT RAISE(ABORT, 'synthetic_private'); END",
    );
    await expect(
      r.preferences.set(defaultAssistantPreferences()),
    ).rejects.toThrow(/^Assistant preferences operation failed$/);
  } finally {
    db.close();
  }
});
