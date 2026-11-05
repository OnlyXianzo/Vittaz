import { createRulesRepository } from "./rules.js";
import type { AssistantRulesStore } from "@vittaz/core";
import { createPreferencesRepository } from "./preferences.js";
import type { AssistantPreferencesStore } from "@vittaz/core";
import { createHistoryRepository } from "./conversations.js";
import type { ConversationHistoryStore } from "@vittaz/core";
import { randomUUID } from "node:crypto";
import { parseAnalyticsMetadata } from "./analytics.js";
import type { AiAnalyticsMetadata, AiAnalyticsRow } from "@vittaz/core";
import type { SnapshotStore } from "./backup.js";
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
  LedgerRepositories,
  ReadLedgerRepositories,
  WriteRepository,
} from "@vittaz/core";
import * as schema from "./schema.js";
import {
  migrate,
  getCurrentSchemaVersion,
  LATEST_SCHEMA_VERSION,
} from "./migrations.js";

export interface OperationalStore extends SnapshotStore {
  rules: AssistantRulesStore;
  preferences: AssistantPreferencesStore;
  history: ConversationHistoryStore;
  appendAnalytics(metadata: AiAnalyticsMetadata): Promise<void>;
  listAnalytics(): Promise<AiAnalyticsRow[]>;
}
/** Owns its private native connection. Every callback is serialized, including reads. */
export function openLedgerStore(filename: string): OperationalStore {
  return connect(filename, false);
}
/** Existing current-schema file only. No migrations, SQL or write handle exposed. */
export function openReadOnlyLedgerStore(
  filename: string,
): Pick<SnapshotStore, "read" | "close"> {
  if (!filename || filename === ":memory:")
    throw new Error("readonly_requires_existing_file");
  const store = connect(filename, true);
  return { read: store.read, close: store.close };
}
function connect(filename: string, readonly: boolean): OperationalStore {
  const native = new Database(filename, { readonly });
  try {
    native.pragma("foreign_keys = ON");
    if (readonly) {
      native.pragma("query_only = ON");
      if (getCurrentSchemaVersion(native) !== LATEST_SCHEMA_VERSION)
        throw new Error("readonly_requires_current_schema");
    } else {
      migrate(native);
    }
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
      unparsed_messages: wrap(
        {
          async get(id) {
            return (
              db
                .select()
                .from(schema.unparsed_messages)
                .where(eq(schema.unparsed_messages.id, id))
                .get() ?? null
            );
          },
          async list() {
            return db
              .select()
              .from(schema.unparsed_messages)
              .orderBy(schema.unparsed_messages.id)
              .all();
          },
          async insert(row) {
            db.insert(schema.unparsed_messages).values(row).run();
          },
          async replace(row) {
            const result = db
              .update(schema.unparsed_messages)
              .set(row)
              .where(eq(schema.unparsed_messages.id, row.id))
              .run();
            if (result.changes !== 1) throw new Error("repository_row_missing");
          },
          async remove(id) {
            db.delete(schema.unparsed_messages)
              .where(eq(schema.unparsed_messages.id, id))
              .run();
          },
        },
        (row) => {
          void row;
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
      unparsed_messages: {
        get: repos.unparsed_messages.get,
        list: repos.unparsed_messages.list,
      },
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
    rules: createRulesRepository(db, (write, work) =>
      enqueue(() => unit(write, work)),
    ),
    preferences: createPreferencesRepository(db, (write, work) =>
      enqueue(() => unit(write, work)),
    ),
    history: createHistoryRepository(db, (write, work) =>
      enqueue(() => unit(write, work)),
    ),
    read: (work) => enqueue(() => unit(false, (_repos, read) => work(read))),
    transaction: (work) => enqueue(() => unit(true, (repos) => work(repos))),
    appendAnalytics: async (input) => {
      const value = parseAnalyticsMetadata(input);
      return enqueue(() =>
        unit(true, async () => {
          db.insert(schema.ai_analytics_log)
            .values({
              ...value,
              id: `anl_${randomUUID()}`,
              created_at: new Date().toISOString(),
            })
            .run();
        }),
      );
    },
    listAnalytics: () =>
      enqueue(() =>
        unit(false, async () =>
          db
            .select()
            .from(schema.ai_analytics_log)
            .orderBy(
              schema.ai_analytics_log.created_at,
              schema.ai_analytics_log.id,
            )
            .all(),
        ),
      ),
    exportSnapshot: () =>
      enqueue(() =>
        unit(false, async (repos) => ({
          tables: {
            wallets: await repos.wallets.list(),
            counterparties: db
              .select()
              .from(schema.counterparties)
              .orderBy(schema.counterparties.id)
              .all(),
            proposals: await repos.proposals.list(),
            transactions: await repos.transactions.list(),
            audit_log: (await repos.audit.list()).sort(
              (a, b) =>
                a.created_at.localeCompare(b.created_at) ||
                a.id.localeCompare(b.id),
            ),
          },
          settings: db
            .select()
            .from(schema.app_settings)
            .where(eq(schema.app_settings.key, "send_notes_to_cloud"))
            .all(),
        })),
      ),
    replaceSnapshot: (payload) =>
      enqueue(() =>
        unit(true, async (repos) => {
          db.delete(schema.audit_log).run();
          db.delete(schema.transactions).run();
          db.delete(schema.proposals).run();
          db.delete(schema.counterparties).run();
          db.delete(schema.wallets).run();
          for (const row of payload.tables.wallets)
            await repos.wallets.insert(row);
          for (const row of payload.tables.counterparties)
            db.insert(schema.counterparties).values(row).run();
          for (const row of payload.tables.proposals)
            await repos.proposals.insert(row);
          for (const row of payload.tables.transactions)
            await repos.transactions.insert(row);
          for (const row of payload.tables.audit_log)
            await repos.audit.insert(row);
          db.delete(schema.app_settings)
            .where(eq(schema.app_settings.key, "send_notes_to_cloud"))
            .run();
          for (const row of payload.settings)
            db.insert(schema.app_settings).values(row).run();
        }),
      ),
    close: () =>
      enqueue(async () => {
        if (!closed) {
          closed = true;
          native.close();
        }
      }),
  };
}
