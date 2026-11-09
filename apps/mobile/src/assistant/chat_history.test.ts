import { beforeEach, expect, it } from "@jest/globals";
import Storage from "expo-sqlite/kv-store";
import {
  CHAT_HISTORY_KEY,
  clear_chat_history,
  load_chat_history,
  save_chat_history,
} from "./chat_history";

beforeEach(async () => {
  await Storage.removeItemAsync(CHAT_HISTORY_KEY);
});

it("round-trips bounded local chat messages", async () => {
  await save_chat_history([
    { id: "chat_user_1", role: "user", text: "Synthetic question" },
    { id: "chat_assistant_2", role: "assistant", text: "Synthetic answer" },
  ]);
  expect(await load_chat_history()).toEqual([
    { id: "chat_user_1", role: "user", text: "Synthetic question" },
    { id: "chat_assistant_2", role: "assistant", text: "Synthetic answer" },
  ]);
});

it("drops sensitive or empty messages instead of persisting them", async () => {
  await save_chat_history([
    {
      id: "chat_user_1",
      role: "user",
      text: "My password is synthetic-secret",
    },
    { id: "chat_assistant_2", role: "assistant", text: "   " },
    { id: "chat_user_3", role: "user", text: "Synthetic safe question" },
  ]);
  expect(await load_chat_history()).toEqual([
    { id: "chat_user_3", role: "user", text: "Synthetic safe question" },
  ]);
});

it("keeps only the latest bounded window and tolerates corrupt storage", async () => {
  const messages = Array.from({ length: 60 }, (_, index) => ({
    id: `chat_user_${index + 1}`,
    role: "user" as const,
    text: `Synthetic question ${index + 1}`,
  }));
  await save_chat_history(messages);
  const loaded = await load_chat_history();
  expect(loaded).toHaveLength(50);
  expect(loaded[0].text).toBe("Synthetic question 11");
  await Storage.setItemAsync(CHAT_HISTORY_KEY, "{not-json");
  expect(await load_chat_history()).toEqual([]);
  await clear_chat_history();
  expect(await load_chat_history()).toEqual([]);
});
