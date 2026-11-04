import Database from "better-sqlite3";
import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import {
  assertIntegerPaise,
  assertPositivePaise,
  assertNonNegativePaise,
} from "@vittaz/core";
import type {
  LedgerStore,
  LedgerRepositories,
  ReadLedgerRepositories,
  WriteRepository,
} from "@vittaz/core";
import * as schema from "./schema.js";
import { migrate } from "./migrations.js";

/** Owns its private native connection. Every callback is serialized, including reads. */
export function openLedgerStore(filename: string): LedgerStore {
  const native = new Database(filename);
  try {
    native.pragma("foreign_keys = ON");
    migrate(native);
  } catch (error) {
    native.close();
    throw error;
  }
  const db = drizzle(native);
  const context = new AsyncLocalStorage<boolean>();
  let tail: Promise<unknown> = Promise.resolve();
  let closed = false;
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    if (context.getStore())
      return Promise.reject(new Error("repository_reentrant_access"));
    const result = tail.then(() => context.run(true, work));
    tail = result.catch(() => undefined);
    return result;
  }
  function assertOpen() {
    if (closed) throw new Error("repository_closed");
  }
  function session() {
    let active = true;
    const guard = () => {
      if (!active) throw new Error("repository_scope_expired");
    };
    function wrap<Row>(
      ops: WriteRepository<Row>,
      validate: (row: Row) => void,
    ): WriteRepository<Row> {
      return {
        async get(id) {
          guard();
          return ops.get(id);
        },
        async list() {
          guard();
          return ops.list();
        },
        async insert(row) {
          guard();
          validate(row);
          await ops.insert(row);
        },
        async replace(row) {
          guard();
          validate(row);
          await ops.replace(row);
        },
        async remove(id) {
          guard();
          await ops.remove(id);
        },
      };
    }
    const repos: LedgerRepositories = {
      wallets: wrap(
        {
          async get(id) {
            return (
              db
                .select()
                .from(schema.wallets)
                .where(eq(schema.wallets.id, id))
                .get() ?? null
            );
          },
          async list() {
            return db
              .select()
              .from(schema.wallets)
              .orderBy(schema.wallets.id)
              .all();
          },
          async insert(row) {
            db.insert(schema.wallets).values(row).run();
          },
          async replace(row) {
            const result = db
              .update(schema.wallets)
              .set(row)
              .where(eq(schema.wallets.id, row.id))
              .run();
            if (result.changes !== 1) throw new Error("repository_row_missing");
          },
          async remove(id) {
            db.delete(schema.wallets).where(eq(schema.wallets.id, id)).run();
          },
        },
        (row) => {
          assertIntegerPaise(row.opening_balance_paise);
        },
      ),
      transactions: wrap(
        {
          async get(id) {
            return (
              db
                .select()
                .from(schema.transactions)
                .where(eq(schema.transactions.id, id))
                .get() ?? null
            );
          },
          async list() {
            return db
              .select()
              .from(schema.transactions)
              .orderBy(schema.transactions.id)
              .all();
          },
          async insert(row) {
            db.insert(schema.transactions).values(row).run();
          },
          async replace(row) {
            const result = db
              .update(schema.transactions)
              .set(row)
              .where(eq(schema.transactions.id, row.id))
              .run();
            if (result.changes !== 1) throw new Error("repository_row_missing");
          },
          async remove(id) {
            db.delete(schema.transactions)
              .where(eq(schema.transactions.id, id))
              .run();
          },
        },
        (row) => {
          assertPositivePaise(row.amount_paise);
          assertNonNegativePaise(row.benefit_paise);
          assertNonNegativePaise(row.split_owed_paise);
        },
      ),
      proposals: wrap(
        {
          async get(id) {
            return (
              db
                .select()
                .from(schema.proposals)
                .where(eq(schema.proposals.id, id))
                .get() ?? null
            );
          },
          async list() {
            return db
              .select()
              .from(schema.proposals)
              .orderBy(schema.proposals.id)
              .all();
          },
          async insert(row) {
            db.insert(schema.proposals).values(row).run();
          },
          async replace(row) {
            const result = db
              .update(schema.proposals)
              .set(row)
              .where(eq(schema.proposals.id, row.id))
              .run();
            if (result.changes !== 1) throw new Error("repository_row_missing");
          },
          async remove(id) {
            db.delete(schema.proposals)
              .where(eq(schema.proposals.id, id))
              .run();
          },
        },
        (row) => {
          assertPositivePaise(row.amount_paise);
          assertNonNegativePaise(row.benefit_paise);
          assertNonNegativePaise(row.split_owed_paise);
        },
      ),
      audit: wrap(
        {
          async get(id) {
            return (
              db
                .select()
                .from(schema.audit_log)
                .where(eq(schema.audit_log.id, id))
                .get() ?? null
            );
          },
          async list() {
            return db
              .select()
              .from(schema.audit_log)
              .orderBy(schema.audit_log.id)
              .all();
          },
          async insert(row) {
            db.insert(schema.audit_log).values(row).run();
          },
          async replace(row) {
            const result = db
              .update(schema.audit_log)
              .set(row)
              .where(eq(schema.audit_log.id, row.id))
              .run();
            if (result.changes !== 1) throw new Error("repository_row_missing");
          },
          async remove(id) {
            db.delete(schema.audit_log)
              .where(eq(schema.audit_log.id, id))
              .run();
          },
        },
        (row) => {
          void row;
        },
      ),
    };
    const read: ReadLedgerRepositories = {
      wallets: { get: repos.wallets.get, list: repos.wallets.list },
      transactions: {
        get: repos.transactions.get,
        list: repos.transactions.list,
      },
      proposals: { get: repos.proposals.get, list: repos.proposals.list },
      audit: { get: repos.audit.get, list: repos.audit.list },
    };
    return {
      repos,
      read,
      expire: () => {
        active = false;
      },
    };
  }
  async function unit<T>(
    write: boolean,
    work: (
      repos: LedgerRepositories,
      read: ReadLedgerRepositories,
    ) => Promise<T>,
  ): Promise<T> {
    assertOpen();
    const scope = session();
    native.exec(write ? "BEGIN IMMEDIATE" : "BEGIN");
    try {
      const result = await work(scope.repos, scope.read);
      native.exec("COMMIT");
      return result;
    } catch (error) {
      if (native.inTransaction) native.exec("ROLLBACK");
      throw error;
    } finally {
      scope.expire();
    }
  }
  return {
    read: (work) => enqueue(() => unit(false, (_repos, read) => work(read))),
    transaction: (work) => enqueue(() => unit(true, (repos) => work(repos))),
    close: () =>
      enqueue(async () => {
        if (!closed) {
          closed = true;
          native.close();
        }
      }),
  };
}
