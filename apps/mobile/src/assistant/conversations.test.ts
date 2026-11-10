import { beforeEach, expect, it, jest } from "@jest/globals";
import Storage from "expo-sqlite/kv-store";
import { CHAT_HISTORY_KEY, save_chat_history } from "./chat_history";
import {
  CONVERSATIONS_KEY,
  create_conversation,
  delete_conversation,
  load_conversations,
  save_conversation_messages,
  select_conversation,
} from "./conversations";

beforeEach(async () => {
  await Storage.removeItemAsync(CHAT_HISTORY_KEY);
  await Storage.removeItemAsync(CONVERSATIONS_KEY);
});

it("migrates the prior history once and removes its legacy copy after saving", async () => {
  await save_chat_history([
    { id: "m1", role: "user", text: "Synthetic question" },
  ]);
  const migrated = await load_conversations();
  expect(migrated.conversations[0].messages[0].text).toBe("Synthetic question");
  expect(migrated.active_id).toBe(migrated.conversations[0].id);
  expect(await Storage.getItemAsync(CHAT_HISTORY_KEY)).toBeNull();
  expect(await load_conversations()).toEqual(migrated);
});

it("isolates messages and retains selected conversation across restarts", async () => {
  await create_conversation("chat_one");
  await save_conversation_messages("chat_one", [
    { id: "m1", role: "user", text: "First synthetic question" },
  ]);
  await create_conversation("chat_two");
  await save_conversation_messages("chat_two", [
    { id: "m2", role: "user", text: "Second synthetic question" },
  ]);
  await select_conversation("chat_one");
  const result = await load_conversations();
  expect(result.active_id).toBe("chat_one");
  expect(
    result.conversations.find((x) => x.id === "chat_one")?.messages[0].text,
  ).toBe("First synthetic question");
  expect(
    result.conversations.find((x) => x.id === "chat_two")?.messages[0].text,
  ).toBe("Second synthetic question");
  await delete_conversation("chat_one");
  expect((await load_conversations()).conversations.map((x) => x.id)).toEqual([
    "chat_two",
  ]);
});

it("drops sensitive messages and never derives a title from them", async () => {
  await create_conversation("chat_one");
  await save_conversation_messages("chat_one", [
    { id: "m1", role: "user", text: "My password is synthetic-secret" },
    { id: "m2", role: "user", text: "Safe synthetic question" },
  ]);
  const chat = (await load_conversations()).conversations[0];
  expect(chat.title).toBe("Safe synthetic question");
  expect(JSON.stringify(chat)).not.toContain("synthetic-secret");
});

it("serializes concurrent writes without losing a conversation", async () => {
  await Promise.all([
    create_conversation("chat_one"),
    create_conversation("chat_two"),
  ]);
  expect(
    (await load_conversations()).conversations.map((x) => x.id).sort(),
  ).toEqual(["chat_one", "chat_two"]);
});

it("refuses to overwrite corrupt new-format data or resurrect deleted legacy history", async () => {
  await Storage.setItemAsync(CONVERSATIONS_KEY, "{bad-json");
  await expect(create_conversation("chat_one")).rejects.toThrow(
    "conversation_storage_invalid",
  );
  expect(await Storage.getItemAsync(CONVERSATIONS_KEY)).toBe("{bad-json");
  await Storage.removeItemAsync(CONVERSATIONS_KEY);
  await save_chat_history([
    { id: "m1", role: "user", text: "Synthetic question" },
  ]);
  const migrated = await load_conversations();
  await delete_conversation(migrated.active_id!);
  expect((await load_conversations()).conversations).toEqual([]);
});

it("keeps the legacy history if migration cannot write the new format", async () => {
  await save_chat_history([
    { id: "m1", role: "user", text: "Synthetic question" },
  ]);
  const original = await Storage.getItemAsync(CHAT_HISTORY_KEY);
  const spy = jest
    .spyOn(Storage, "setItemAsync")
    .mockRejectedValueOnce(new Error("disk full"));
  await expect(load_conversations()).rejects.toThrow("disk full");
  spy.mockRestore();
  expect(await Storage.getItemAsync(CHAT_HISTORY_KEY)).toBe(original);
  expect(await Storage.getItemAsync(CONVERSATIONS_KEY)).toBeNull();
});
