import { LATEST_SCHEMA_VERSION } from "./migrations.js";
import { afterEach, expect, test, vi } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLedgerStore, openReadOnlyLedgerStore } from "./repositories.js";
const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function file() {
  const d = mkdtempSync(join(tmpdir(), "vittaz_readonly_"));
  dirs.push(d);
  return join(d, "ledger.sqlite");
}
test("baseline_4_5_actual_readonly_connection_blocks_sql_writes_even_if_query_only_is_disabled", async () => {
  const path = file();
  const writer = openLedgerStore(path);
  await writer.close();
  const reader = openReadOnlyLedgerStore(path);
  let inspected = false;
  const prepare = Database.prototype.prepare;
  vi.spyOn(Database.prototype, "prepare").mockImplementation(function (
    this: Database.Database,
    sql: string,
  ) {
    if (!inspected) {
      inspected = true;
      expect(this.readonly).toBe(true);
      expect(this.pragma("query_only", { simple: true })).toBe(1);
      expect(() => this.exec("DELETE FROM wallets")).toThrow();
      this.pragma("query_only = OFF");
      expect(() => this.exec("DELETE FROM wallets")).toThrow();
      expect(() => this.exec("CREATE TABLE forbidden (id TEXT)")).toThrow();
      this.pragma("query_only = ON");
    }
    return prepare.call(this, sql);
  });
  try {
    expect(await reader.read((r) => r.wallets.list())).toHaveLength(2);
    expect(inspected).toBe(true);
    let leaked: Parameters<Parameters<typeof reader.read>[0]>[0] | undefined;
    await reader.read(async (r) => {
      leaked = r;
      expect("insert" in r.wallets).toBe(false);
    });
    await expect(leaked!.wallets.list()).rejects.toThrow(
      "repository_scope_expired",
    );
    await expect(
      reader.read(async () => {
        throw new Error("synthetic_failure");
      }),
    ).rejects.toThrow("synthetic_failure");
    expect(await reader.read((r) => r.wallets.list())).toHaveLength(2);
  } finally {
    await reader.close();
  }
  await expect(reader.read((r) => r.wallets.list())).rejects.toThrow(
    "repository_closed",
  );
});
test("readonly_missing_or_stale_or_future_schema_never_creates_or_migrates_a_file", () => {
  const path = file();
  for (const input of ["", ":memory:", path])
    expect(() => openReadOnlyLedgerStore(input)).toThrow();
  expect(existsSync(path)).toBe(false);
  for (const version of [0, 1, 2, LATEST_SCHEMA_VERSION + 1]) {
    const db = new Database(path);
    db.pragma(`user_version = ${version}`);
    db.close();
    expect(() => openReadOnlyLedgerStore(path)).toThrow(
      "readonly_requires_current_schema",
    );
    const check = new Database(path);
    expect(check.pragma("user_version", { simple: true })).toBe(version);
    check.close();
  }
});
