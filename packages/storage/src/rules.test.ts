import { expect, test } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLedgerStore } from "./repositories.js";
import { createBackup, restoreBackup } from "./backup.js";
import { parseAssistantRules } from "@vittaz/core";
test("rules_storage_upsert_clone_restart_backup_and_static_corruption_errors", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vittaz_rules_"));
  const file = join(dir, "synthetic.sqlite");
  let s = openLedgerStore(file);
  try {
    const backup = await createBackup(s);
    expect(await s.rules.get()).toEqual([]);
    const rules = parseAssistantRules([
      { kind: "behavior", rule: "short_summaries" },
    ]);
    await s.rules.set(rules);
    rules[0]!.rule = "amounts_in_rupees";
    expect((await s.rules.get())[0]!.rule).toBe("short_summaries");
    await s.rules.set([{ kind: "behavior", rule: "amounts_in_rupees" }]);
    expect(await createBackup(s, backup.exportedAt)).toEqual(backup);
    await restoreBackup(s, backup);
    expect((await s.rules.get())[0]!.rule).toBe("amounts_in_rupees");
    await expect(s.rules.set([{}] as never)).rejects.toMatchObject({
      code: "invalid_input",
    });
    await s.close();
    s = openLedgerStore(file);
    expect(await s.rules.get()).toHaveLength(1);
    const db = new Database(file);
    try {
      for (const raw of ["not_json", "{}", "x".repeat(2049)]) {
        db.prepare(
          "UPDATE app_settings SET value_json=? WHERE key='assistant_rules'",
        ).run(raw);
        await expect(s.rules.get()).rejects.toThrow(
          /^Assistant rules operation failed$/,
        );
      }
      db.exec(
        "CREATE TRIGGER synthetic_rules_error BEFORE UPDATE ON app_settings BEGIN SELECT RAISE(ABORT, 'synthetic_private'); END",
      );
      await expect(s.rules.set([])).rejects.toMatchObject({
        code: "unavailable",
      });
    } finally {
      db.close();
    }
    await s.close();
    await expect(s.rules.get()).rejects.toMatchObject({ code: "unavailable" });
  } finally {
    await s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
