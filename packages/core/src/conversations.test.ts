import { expect, test, vi } from "vitest";
import {
  startConversation,
  recordConversationMessage,
  parseConversation,
  parseConversationMessage,
  parseHistoryLimit,
  ConversationHistoryError,
} from "./conversations.js";
import type { ConversationHistoryStore } from "./conversations.js";
const created_at = "2026-11-05T00:00:00.000Z";
const row = () => ({
  id: "synthetic_msg",
  conversation_id: "synthetic_chat",
  source: "telegram" as const,
  role: "user" as const,
  content: "Paid synthetic friend for tea",
  created_at,
});
function fake(): ConversationHistoryStore {
  return {
    createConversation: vi.fn(async () => {}),
    appendMessage: vi.fn(async () => {}),
    listConversations: vi.fn(async () => []),
    listMessages: vi.fn(async () => []),
  };
}
test("history_core_creates_conversation_and_records_local_text_for_all_sources", async () => {
  const store = fake();
  expect(
    await startConversation(store, { id: "synthetic_chat", created_at }),
  ).toEqual({ id: "synthetic_chat", created_at });
  for (const source of ["app", "cli", "telegram"] as const) {
    const message = { ...row(), source };
    expect(await recordConversationMessage(store, message)).toEqual({
      status: "stored",
      message,
    });
    expect(store.appendMessage).toHaveBeenLastCalledWith(message);
  }
});
test("history_core_sensitive_messages_never_reach_any_store_method", async () => {
  const store = fake();
  expect(
    await recordConversationMessage(store, {
      ...row(),
      content: "Your OTP is 123456. Do not share it.",
    }),
  ).toEqual({ status: "sensitive_dropped" });
  for (const call of Object.values(store)) expect(call).not.toHaveBeenCalled();
});
test("history_core_rejects_invalid_shapes_and_avoids_echoing_inputs", () => {
  for (const input of [
    null,
    [],
    {},
    { id: "bad id", created_at },
    { id: "x", created_at: "2026-02-30T00:00:00.000Z" },
    { id: "x", created_at, extra: true },
  ])
    expect(() => parseConversation(input)).toThrow(
      "Conversation history operation failed",
    );
  for (const patch of [
    { source: "sms" },
    { role: "system" },
    { content: "" },
    { content: " " },
    { content: "x".repeat(8193) },
    { content: "a\0b" },
    { conversation_id: "bad/id" },
    { id: "" },
    { created_at: "yesterday" },
    { extra: 1 },
  ])
    expect(() => parseConversationMessage({ ...row(), ...patch })).toThrow(
      ConversationHistoryError,
    );
  for (const limit of [0, -1, 101, 1.5, NaN, "1", null])
    expect(() => parseHistoryLimit(limit)).toThrow(ConversationHistoryError);
  expect(parseHistoryLimit(undefined)).toBe(50);
  expect(parseHistoryLimit(100)).toBe(100);
});

test("history_core_storage_failures_are_static_and_do_not_echo_driver_details", async () => {
  const store = fake();
  store.createConversation = async () => {
    throw new Error("synthetic_private_driver_details");
  };
  store.appendMessage = async () => {
    throw new Error("synthetic_private_driver_details");
  };
  await expect(
    startConversation(store, { id: "chat", created_at }),
  ).rejects.toMatchObject({
    code: "unavailable",
    message: "Conversation history operation failed",
  });
  await expect(recordConversationMessage(store, row())).rejects.toMatchObject({
    code: "unavailable",
    message: "Conversation history operation failed",
  });
});

test("history_core_snapshots_inputs_outputs_and_accepts_assistant_without_extra_roles", async () => {
  const store = fake();
  store.createConversation = async (v) => {
    v.id = "mutated_by_port";
  };
  store.appendMessage = async (v) => {
    v.content = "mutated_by_port";
  };
  const c = { id: "chat", created_at };
  expect(await startConversation(store, c)).toEqual(c);
  const m = {
    ...row(),
    role: "assistant" as const,
    source: "cli" as const,
    content: "Synthetic नाम retained locally",
  };
  expect(await recordConversationMessage(store, m)).toEqual({
    status: "stored",
    message: m,
  });
  expect(m.content).toBe("Synthetic नाम retained locally");
});
test("history_core_all_validation_boundaries_fail_closed_before_storage", async () => {
  const store = fake();
  for (const input of [
    null,
    [],
    {},
    { ...row(), role: "tool" },
    { ...row(), content: 7 },
    { ...row(), created_at: null },
    { ...row(), created_at: "2026-99-99T99:99:99.999Z" },
  ]) {
    await expect(
      recordConversationMessage(store, input as never),
    ).rejects.toMatchObject({ code: "invalid_input" });
  }
  const getter = Object.defineProperty({ id: "x", created_at }, "id", {
    get() {
      throw new Error("synthetic_private_getter");
    },
    enumerable: true,
  });
  expect(() => parseConversation(getter)).toThrow(
    /^Conversation history operation failed$/,
  );
  expect(() => parseConversation({ id: 7, created_at })).toThrow(
    ConversationHistoryError,
  );
  expect(() => parseConversation({ id: "x".repeat(129), created_at })).toThrow(
    ConversationHistoryError,
  );
  expect(() => parseConversation({ id: "x", created_at: 7 })).toThrow(
    ConversationHistoryError,
  );
  expect(
    parseConversation({ id: "x".repeat(128), created_at }).id,
  ).toHaveLength(128);
  expect(
    parseConversationMessage({ ...row(), content: "x".repeat(8192) }).content,
  ).toHaveLength(8192);
  expect(store.appendMessage).not.toHaveBeenCalled();
  store.appendMessage = async () => {
    throw new ConversationHistoryError("unavailable");
  };
  await expect(recordConversationMessage(store, row())).rejects.toMatchObject({
    code: "unavailable",
  });
});
