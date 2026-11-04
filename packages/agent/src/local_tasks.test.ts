import { expect, test, vi } from "vitest";
import {
  ValidatedLocalModelTasks,
  LocalModelTaskError,
} from "./local_tasks.js";
const draft = {
  amount_paise: 45000,
  direction: "debit",
  category: "lunch",
  counterparty_name: "SynthPerson",
  note: "Synthetic lunch",
  split_owed_paise: 22500,
};
function fake(value: unknown) {
  return { run: vi.fn(async () => value) };
}
test("local_parse_entry_returns_validated_draft_only_and_preserves_local_names", async () => {
  const driver = fake({ draft });
  const tasks = new ValidatedLocalModelTasks(driver);
  const result = await tasks.parse_entry({
    text: "Synthetic paid 450 to SynthPerson, owes half",
  });
  expect(result).toEqual({ status: "ok", value: draft });
  expect(driver.run).toHaveBeenCalledWith(
    "parse_entry",
    { text: "Synthetic paid 450 to SynthPerson, owes half" },
    expect.any(AbortSignal),
  );
  expect(Object.keys(tasks)).toEqual([]);
});
test("local_improve_note_is_suggestion_only_and_empty_result_is_not_understood", async () => {
  const driver = fake({ improved_note: "Synthetic lunch with SynthPerson" });
  const tasks = new ValidatedLocalModelTasks(driver);
  expect(
    await tasks.improve_note({ text: "Synthetic lunch w SynthPerson" }),
  ).toEqual({ status: "ok", value: "Synthetic lunch with SynthPerson" });
  driver.run.mockResolvedValue({ improved_note: null });
  expect(await tasks.improve_note({ text: "Synthetic" })).toEqual({
    status: "not_understood",
    value: null,
  });
  driver.run.mockResolvedValue({ draft: null });
  expect(await tasks.parse_entry({ text: "Synthetic ambiguous" })).toEqual({
    status: "not_understood",
    value: null,
  });
});
test("local_sensitive_input_and_invalid_request_have_zero_runner_calls", async () => {
  const driver = fake({ draft });
  const tasks = new ValidatedLocalModelTasks(driver);
  expect(await tasks.parse_entry({ text: "Your OTP is 123456" })).toEqual({
    status: "sensitive_dropped",
    value: null,
  });
  expect(await tasks.improve_note({ text: "Your OTP is 123456" })).toEqual({
    status: "sensitive_dropped",
    value: null,
  });
  for (const input of [
    { text: "" },
    { text: "x".repeat(8193) },
    { text: "Synthetic", extra: true },
    null,
  ])
    await expect(tasks.parse_entry(input)).rejects.toMatchObject({
      code: "invalid_request",
    });
  for (const options of [{ timeout_ms: 0 }, { extra: true }, { signal: {} }])
    await expect(
      tasks.improve_note({ text: "Synthetic" }, options),
    ).rejects.toBeInstanceOf(LocalModelTaskError);
  expect(driver.run).not.toHaveBeenCalled();
});

test("local_late_output_validation_cannot_return_after_elapsed_deadline", async () => {
  const response = {
    get improved_note() {
      const start = performance.now();
      while (performance.now() - start < 25) {
        /* synthetic blocking native output accessor */
      }
      return "Synthetic";
    },
  };
  await expect(
    new ValidatedLocalModelTasks(fake(response)).improve_note(
      { text: "Synthetic" },
      { timeout_ms: 5 },
    ),
  ).rejects.toMatchObject({ code: "timeout" });
});

test("local_invalid_or_sensitive_model_output_is_rejected_without_private_error_echo", async () => {
  const driver = fake(null);
  const tasks = new ValidatedLocalModelTasks(driver);
  for (const output of [
    null,
    { draft: { ...draft, amount_paise: 1.5 } },
    { draft: { ...draft, amount_paise: -0 } },
    { draft: { ...draft, amount_paise: Number.MAX_SAFE_INTEGER + 1 } },
    { draft: { ...draft, direction: "approve" } },
    { draft: { ...draft, split_owed_paise: -0 } },
    { draft: { ...draft, split_owed_paise: 45001 } },
    { draft: { ...draft, note: "Your OTP is 123456" } },
    { draft, approve: true },
    Object.defineProperty({}, "draft", {
      get() {
        throw new Error("synthetic_private_getter");
      },
    }),
  ]) {
    driver.run.mockResolvedValue(output);
    await expect(
      tasks.parse_entry({ text: "Synthetic" }),
    ).rejects.toMatchObject({
      code: "invalid_response",
      message: "Local model task could not be completed safely",
    });
  }
  for (const output of [
    { improved_note: "" },
    { improved_note: "Your OTP is 123456" },
    { improved_note: "Synthetic", commit: true },
  ]) {
    driver.run.mockResolvedValue(output);
    await expect(
      tasks.improve_note({ text: "Synthetic" }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  }
});
test("local_unknown_driver_failure_is_static_and_does_not_retry_or_fall_back", async () => {
  const driver = fake(null);
  driver.run.mockRejectedValue(new Error("synthetic_private_runtime_failure"));
  const tasks = new ValidatedLocalModelTasks(driver);
  await expect(tasks.parse_entry({ text: "Synthetic" })).rejects.toMatchObject({
    code: "unavailable",
    message: "Local model task could not be completed safely",
  });
  expect(driver.run).toHaveBeenCalledTimes(1);
});
test("local_abort_and_timeout_bound_non_cooperative_fake_driver_and_ignore_private_reason", async () => {
  const driver = fake(null);
  const tasks = new ValidatedLocalModelTasks(driver);
  const controller = new AbortController();
  controller.abort("synthetic_private_abort");
  await expect(
    tasks.parse_entry({ text: "Synthetic" }, { signal: controller.signal }),
  ).rejects.toMatchObject({ code: "aborted" });
  expect(driver.run).not.toHaveBeenCalled();
  driver.run.mockImplementation(async () => new Promise(() => {}));
  await expect(
    tasks.improve_note({ text: "Synthetic" }, { timeout_ms: 20 }),
  ).rejects.toMatchObject({ code: "timeout" });
  const active = new AbortController();
  driver.run.mockImplementation(async () => {
    active.abort("synthetic_private_reason");
    return new Promise(() => {});
  });
  await expect(
    tasks.parse_entry({ text: "Synthetic" }, { signal: active.signal }),
  ).rejects.toMatchObject({
    code: "aborted",
    message: "Local model task could not be completed safely",
  });
});
test("local_real_ledger_stays_unchanged_and_results_are_cloned_not_live_model_objects", async () => {
  const { openLedgerStore } = await import("../../storage/src/repositories.js");
  const { createManualTransaction } = await import("@vittaz/core");
  const store = openLedgerStore(":memory:");
  try {
    await createManualTransaction(store, {
      amountPaise: 1200,
      direction: "debit",
      note: "Synthetic original",
    });
    const before = await store.exportSnapshot();
    const modelDraft = { ...draft };
    const driver = fake({ draft: modelDraft });
    const tasks = new ValidatedLocalModelTasks(driver);
    const response = await tasks.parse_entry({ text: "Synthetic" });
    modelDraft.amount_paise = 9999;
    expect(response).toEqual({ status: "ok", value: draft });
    driver.run.mockResolvedValue({ improved_note: "Synthetic improved" });
    await tasks.improve_note({ text: "Synthetic original" });
    expect(await store.exportSnapshot()).toEqual(before);
  } finally {
    await store.close();
  }
});
test("local_minimal_draft_has_safe_defaults_without_guessing_money_or_direction", async () => {
  const driver = fake({ draft: { amount_paise: 100, direction: "credit" } });
  const tasks = new ValidatedLocalModelTasks(driver);
  expect(await tasks.parse_entry({ text: "Synthetic" })).toEqual({
    status: "ok",
    value: {
      amount_paise: 100,
      direction: "credit",
      category: "uncategorized",
      counterparty_name: null,
      note: null,
      split_owed_paise: 0,
    },
  });
  driver.run.mockResolvedValue({ draft: {} });
  await expect(tasks.parse_entry({ text: "Synthetic" })).rejects.toMatchObject({
    code: "invalid_response",
  });
});

test("local_synchronous_driver_response_is_rejected_if_it_already_consumed_the_deadline", async () => {
  const driver = fake(null);
  driver.run.mockImplementation(async () => {
    const started = performance.now();
    while (performance.now() - started < 25) {
      /* synthetic blocking inference */
    }
    return { draft };
  });
  await expect(
    new ValidatedLocalModelTasks(driver).parse_entry(
      { text: "Synthetic" },
      { timeout_ms: 5 },
    ),
  ).rejects.toMatchObject({ code: "timeout" });
});
