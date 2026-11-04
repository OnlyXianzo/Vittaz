import Database from "better-sqlite3";
import { afterEach, expect, test } from "vitest";
import {
  migrate,
  getCurrentSchemaVersion,
  LATEST_SCHEMA_VERSION,
} from "./migrations.js";

const databases: Database.Database[] = [];
function open() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  databases.push(db);
  return db;
}
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
const insert = `INSERT INTO transactions (id,wallet_id,amount_paise,direction,status,occurred_at,created_at,updated_at) VALUES (?, 'cash', ?, 'debit', 'user_confirmed', '2026-11-04T00:00:00Z','2026-11-04T00:00:00Z','2026-11-04T00:00:00Z')`;

test("baseline_1_2_empty_upgrade_and_idempotent_migrations", () => {
  const db = open();
  expect(getCurrentSchemaVersion(db)).toBe(0);
  expect(migrate(db, { targetVersion: 1 })).toEqual({
    previousVersion: 0,
    currentVersion: 1,
    applied: [1],
  });
  db.prepare(insert).run("synthetic_legacy", 25000);
  expect(migrate(db)).toEqual({
    previousVersion: 1,
    currentVersion: 2,
    applied: [2],
  });
  expect(
    db
      .prepare(
        "SELECT amount_paise, benefit, tags_json, benefit_paise, tag FROM transactions",
      )
      .get(),
  ).toEqual({
    amount_paise: 25000,
    benefit: "self",
    tags_json: "[]",
    benefit_paise: 0,
    tag: null,
  });
  expect(migrate(db).applied).toEqual([]);
  expect(LATEST_SCHEMA_VERSION).toBe(2);
  expect(migrate(open()).applied).toEqual([1, 2]);
  expect(
    db.prepare("SELECT count(*) AS n FROM schema_migrations").get(),
  ).toEqual({ n: 2 });
});
test("baseline_0_2_strict_constraints_and_atomic_rollback", () => {
  const db = open();
  migrate(db);
  expect(db.prepare("SELECT sqlite_version() AS v").get()).toHaveProperty("v");
  for (const amount of [123.45, 0, -1, Number.MAX_SAFE_INTEGER + 1])
    expect(() => db.prepare(insert).run("synthetic_bad", amount)).toThrow();
  expect(() =>
    db
      .prepare(insert.replace("'cash'", "'missing_wallet'"))
      .run("synthetic_fk", 1),
  ).toThrow();
  const write = db.transaction(() => {
    db.prepare(insert).run("synthetic_rollback", 1);
    throw new Error("synthetic_failure");
  });
  expect(write).toThrow("synthetic_failure");
  expect(db.prepare("SELECT count(*) AS n FROM transactions").get()).toEqual({
    n: 0,
  });
});
test("baseline_1_1_sql_sum_preserves_1000_integer_amounts", () => {
  const db = open();
  migrate(db);
  let expected = 0n;
  const run = db.prepare(insert);
  db.transaction(() => {
    for (let i = 1; i <= 1000; i++) {
      const amount = i * 100 + ((i * 37) % 100);
      expected += BigInt(amount);
      run.run(`synthetic_${i}`, amount);
    }
  })();
  expect(
    db.prepare("SELECT sum(amount_paise) AS s FROM transactions").get(),
  ).toEqual({ s: Number(expected) });
});
test("migration_rejects_invalid_targets_future_versions_and_nested_transaction", () => {
  const db = open();
  for (const targetVersion of [-1, 0.5, 3, NaN, Infinity])
    expect(() => migrate(db, { targetVersion })).toThrow(
      "invalid_schema_target",
    );
  migrate(db);
  expect(() => migrate(db, { targetVersion: 1 })).toThrow(
    "schema_downgrade_not_supported",
  );
  db.pragma("user_version = 3");
  expect(() => migrate(db)).toThrow("schema_newer_than_supported");
  db.pragma("user_version = 0");
  db.exec("BEGIN");
  expect(() => migrate(db)).toThrow("migration_requires_idle_connection");
  db.exec("ROLLBACK");
});
test("migration_failure_rolls_back_schema_and_version_and_allows_retry", () => {
  const db = open();
  migrate(db, { targetVersion: 1 });
  db.exec("CREATE TABLE unparsed_messages (conflict TEXT)");
  expect(() => migrate(db)).toThrow();
  expect(getCurrentSchemaVersion(db)).toBe(1);
  expect(
    db
      .prepare("PRAGMA table_info(transactions)")
      .all()
      .some((x) => (x as { name: string }).name === "benefit"),
  ).toBe(false);
  db.exec("DROP TABLE unparsed_messages");
  expect(migrate(db).applied).toEqual([2]);
});
