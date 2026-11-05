import Database from "better-sqlite3";
import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLedgerStore, openReadOnlyLedgerStore } from "./repositories.js";
import { migrate, getCurrentSchemaVersion } from "./migrations.js";
import { createBackup, restoreBackup } from "./backup.js";
import { recordConversationMessage } from "@vittaz/core";
const stores: ReturnType<typeof openLedgerStore>[] = [];
const folders: string[] = [];
const databases: Database.Database[] = [];
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
  for (const db of databases.splice(0)) db.close();
  for (const p of folders.splice(0))
    rmSync(p, { recursive: true, force: true });
});
const time = "2026-11-05T00:00:00.000Z";
function open(path = ":memory:") {
  const s = openLedgerStore(path);
  stores.push(s);
  return s;
}
function message(
  id = "m1",
  source: "app" | "cli" | "telegram" = "telegram",
  conversation_id = "chat",
) {
  return {
    id,
    conversation_id,
    source,
    role: "user" as const,
    content: "Synthetic friend paid for tea",
    created_at: time,
  };
}
test("history_storage_cross_channel_recent_window_persists_restart_without_ledger_changes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vittaz_history_"));
  folders.push(dir);
  const path = join(dir, "synthetic.sqlite");
  const s = open(path);
  const ledger = await s.exportSnapshot();
  await s.history.createConversation({ id: "chat", created_at: time });
  await s.history.createConversation({ id: "other", created_at: time });
  await s.history.appendMessage(message("a", "telegram"));
  await s.history.appendMessage(message("c", "app"));
  await s.history.appendMessage(message("b", "cli"));
  await s.history.appendMessage(message("z", "cli", "other"));
  expect(
    (await s.history.listMessages("chat", 2)).map((m) => [m.id, m.source]),
  ).toEqual([
    ["c", "app"],
    ["b", "cli"],
  ]);
  expect((await s.history.listConversations(1)).map((c) => c.id)).toEqual([
    "other",
  ]);
  expect(await s.exportSnapshot()).toEqual(ledger);
  await s.close();
  const reopened = open(path);
  expect(await reopened.history.listMessages("chat")).toHaveLength(3);
  const read = openReadOnlyLedgerStore(path);
  expect(read).not.toHaveProperty("history");
  await read.close();
});
test("history_storage_migration2_to3_is_additive_atomic_and_idempotent", () => {
  const db = new Database(":memory:");
  databases.push(db);
  db.pragma("foreign_keys = ON");
  migrate(db, { targetVersion: 2 });
  const wallets = db.prepare("SELECT * FROM wallets ORDER BY id").all();
  db.exec("CREATE TABLE messages (conflict TEXT)");
  expect(() => migrate(db)).toThrow();
  expect(getCurrentSchemaVersion(db)).toBe(2);
  expect(
    db
      .prepare("SELECT name FROM sqlite_master WHERE name='conversations'")
      .get(),
  ).toBeUndefined();
  db.exec("DROP TABLE messages");
  expect(migrate(db).applied).toEqual([3]);
  expect(migrate(db).applied).toEqual([]);
  expect(getCurrentSchemaVersion(db)).toBe(3);
  expect(db.prepare("SELECT * FROM wallets ORDER BY id").all()).toEqual(
    wallets,
  );
});
test("history_storage_sensitive_zero_rows_and_static_errors_no_sql_parameter_echo", async () => {
  const s = open();
  await s.history.createConversation({ id: "chat", created_at: time });
  expect(
    await recordConversationMessage(s.history, {
      ...message(),
      content: "Your OTP is 123456. Do not share it.",
    }),
  ).toEqual({ status: "sensitive_dropped" });
  await expect(
    s.history.appendMessage({
      ...message(),
      content: "Your OTP is 123456. Do not share it.",
    }),
  ).rejects.toMatchObject({ code: "sensitive_message" });
  expect(await s.history.listMessages("chat")).toEqual([]);
  await expect(
    s.history.appendMessage(message("missing", "app", "absent")),
  ).rejects.toThrow(/^Conversation history operation failed$/);
  await s.history.appendMessage(message());
  await expect(s.history.appendMessage(message())).rejects.toThrow(
    /^Conversation history operation failed$/,
  );
  expect(await s.history.listMessages("chat")).toHaveLength(1);
});
test("history_storage_legacy_ledger_backup_remains_v2_and_restore_preserves_local_chats", async () => {
  const s = open();
  const backup = await createBackup(s);
  expect(backup.schemaVersion).toBe(2);
  await s.history.createConversation({ id: "chat", created_at: time });
  await s.history.appendMessage(message());
  expect(await createBackup(s, backup.exportedAt)).toEqual(backup);
  await restoreBackup(s, backup);
  expect(await s.history.listMessages("chat")).toEqual([message()]);
});

test("history_storage_serializes_with_ledger_clones_queued_input_and_rejects_reentry_and_closed", async () => {
  const s = open();
  let release!: () => void;
  let entered!: () => void;
  const inside = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holding = s.transaction(async () => {
    entered();
    await expect(s.history.listConversations()).rejects.toThrow(
      /^Conversation history operation failed$/,
    );
    await gate;
  });
  await inside;
  const c = { id: "chat", created_at: time };
  const creating = s.history.createConversation(c);
  c.id = "changed";
  release();
  await holding;
  await creating;
  const input = message();
  const pending = s.history.appendMessage(input);
  input.content = "mutated_after_call";
  await pending;
  const rows = await s.history.listMessages("chat");
  rows[0]!.content = "mutated_output";
  expect(await s.history.listMessages("chat")).toEqual([message()]);
  await expect(
    s.history.createConversation({ id: "chat", created_at: time }),
  ).rejects.toMatchObject({ code: "unavailable" });
  for (const limit of [0, 101, 0.5])
    await expect(s.history.listConversations(limit)).rejects.toMatchObject({
      code: "invalid_input",
    });
  await expect(s.history.listMessages("bad/id")).rejects.toMatchObject({
    code: "invalid_input",
  });
  expect(await s.history.listMessages("absent")).toEqual([]);
  await s.close();
  await expect(s.history.listMessages("chat")).rejects.toMatchObject({
    code: "unavailable",
  });
});
test("history_storage_strict_sql_constraints_reject_orphans_roles_sources_and_bad_bodies", () => {
  const db = new Database(":memory:");
  databases.push(db);
  db.pragma("foreign_keys=ON");
  migrate(db);
  db.prepare("INSERT INTO conversations VALUES (?,?)").run("chat", time);
  const insert = db.prepare(
    "INSERT INTO messages (id,conversation_id,source,role,content,created_at) VALUES (?,?,?,?,?,?)",
  );
  for (const params of [
    ["a", "absent", "app", "user", "synthetic", time],
    ["b", "chat", "sms", "user", "synthetic", time],
    ["c", "chat", "cli", "system", "synthetic", time],
    ["d", "chat", "app", "user", "", time],
    ["e", "chat", "app", "user", "x".repeat(8193), time],
    ["f", "chat", "app", "user", "a\0b", time],
    ["g", "chat", "app", "user", null, time],
  ])
    expect(() => insert.run(...params)).toThrow();
  insert.run("ok", "chat", "cli", "assistant", "synthetic", time);
  expect(() =>
    db.prepare("DELETE FROM conversations WHERE id='chat'").run(),
  ).toThrow();
  expect(db.prepare("SELECT count(*) AS n FROM messages").get()).toEqual({
    n: 1,
  });
});

test("history_storage_turn_order_survives_equal_timestamps_and_clock_rollback", async () => {
  const s = open();
  await s.history.createConversation({ id: "chat", created_at: time });
  await s.history.appendMessage(message("z_user"));
  await s.history.appendMessage({
    ...message("a_assistant", "app"),
    role: "assistant",
  });
  await s.history.appendMessage({
    ...message("m_later", "cli"),
    created_at: "2026-11-04T23:59:59.000Z",
  });
  expect((await s.history.listMessages("chat")).map((m) => m.id)).toEqual([
    "z_user",
    "a_assistant",
    "m_later",
  ]);
  expect((await s.history.listMessages("chat", 2)).map((m) => m.id)).toEqual([
    "a_assistant",
    "m_later",
  ]);
});
