import { beforeEach, expect, it } from "@jest/globals";
import Storage from "expo-sqlite/kv-store";
import {
  INSTRUCTIONS_KEY,
  read_instructions,
  save_instructions,
  question_with_instructions,
} from "./custom_instructions";

beforeEach(async () => Storage.removeItemAsync(INSTRUCTIONS_KEY));
it("saves, reads and clears a local instruction", async () => {
  await save_instructions("Use concise answers");
  expect(await read_instructions()).toBe("Use concise answers");
  expect(
    question_with_instructions("Synthetic question", await read_instructions()),
  ).toContain("Use concise answers");
  await save_instructions("");
  expect(await read_instructions()).toBe("");
});
it("rejects sensitive and oversized instructions without overwriting saved preferences", async () => {
  await save_instructions("Use concise answers");
  await expect(
    save_instructions("My password is synthetic-secret"),
  ).rejects.toThrow();
  await expect(save_instructions("a".repeat(1201))).rejects.toThrow();
  expect(await read_instructions()).toBe("Use concise answers");
});
it("rejects corrupt stored instructions and overlong combined questions", async () => {
  await Storage.setItemAsync(
    INSTRUCTIONS_KEY,
    "My password is synthetic-secret",
  );
  await expect(read_instructions()).rejects.toThrow();
  expect(() =>
    question_with_instructions("x".repeat(8192), "Be concise"),
  ).toThrow();
});
