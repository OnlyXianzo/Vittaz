import { z } from "zod";
import { checkSensitiveMessage } from "@vittaz/core";
import type {
  LocalModelTasks,
  LocalModelRunner,
  LocalModelTaskName,
  LocalEntryDraft,
  LocalTaskResult,
} from "@vittaz/core";
export type LocalTaskErrorCode =
  | "invalid_request"
  | "invalid_response"
  | "unavailable"
  | "timeout"
  | "aborted";
export class LocalModelTaskError extends Error {
  constructor(readonly code: LocalTaskErrorCode) {
    super("Local model task could not be completed safely");
    this.name = "LocalModelTaskError";
  }
}
const text = z.string().trim().min(1).max(8192);
const inputSchema = z.strictObject({ text });
const optionsSchema = z.strictObject({
  signal: z.instanceof(AbortSignal).optional(),
  timeout_ms: z.int().min(1).max(120000).default(30000),
});
const draftSchema = z
  .strictObject({
    amount_paise: z.int().positive(),
    direction: z.enum(["debit", "credit"]),
    category: z.string().trim().min(1).max(64).default("uncategorized"),
    counterparty_name: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .nullable()
      .default(null),
    note: text.nullable().default(null),
    split_owed_paise: z
      .int()
      .nonnegative()
      .refine((v) => !Object.is(v, -0))
      .default(0),
  })
  .refine((v) => v.split_owed_paise <= v.amount_paise);
const parseOutput = z.strictObject({ draft: draftSchema.nullable() });
const noteOutput = z.strictObject({ improved_note: text.nullable() });
/** No storage/provider/logging/fallback capabilities; model values are suggestions only. */
export class ValidatedLocalModelTasks implements LocalModelTasks {
  #driver: LocalModelRunner;
  constructor(driver: LocalModelRunner) {
    this.#driver = driver;
  }
  parse_entry(
    input: unknown,
    options: unknown = {},
  ): Promise<LocalTaskResult<LocalEntryDraft>> {
    return this.#run(
      "parse_entry",
      input,
      options,
      (value) => parseOutput.parse(value).draft,
    );
  }
  improve_note(
    input: unknown,
    options: unknown = {},
  ): Promise<LocalTaskResult<string>> {
    return this.#run(
      "improve_note",
      input,
      options,
      (value) => noteOutput.parse(value).improved_note,
    );
  }
  async #run<T>(
    task: LocalModelTaskName,
    rawInput: unknown,
    rawOptions: unknown,
    project: (value: unknown) => T | null,
  ): Promise<LocalTaskResult<T>> {
    let input: z.infer<typeof inputSchema>,
      options: z.infer<typeof optionsSchema>;
    try {
      input = inputSchema.parse(rawInput);
      options = optionsSchema.parse(rawOptions);
    } catch {
      throw new LocalModelTaskError("invalid_request");
    }
    if (checkSensitiveMessage(input.text).sensitive)
      return { status: "sensitive_dropped", value: null };
    if (options.signal?.aborted) throw new LocalModelTaskError("aborted");
    const controller = new AbortController();
    const signal = options.signal
      ? AbortSignal.any([controller.signal, options.signal])
      : controller.signal;
    const expires = performance.now() + options.timeout_ms;
    const timer = setTimeout(() => controller.abort(), options.timeout_ms);
    const stopped = () =>
      new LocalModelTaskError(options.signal?.aborted ? "aborted" : "timeout");
    let abort: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(stopped());
      signal.addEventListener("abort", abort, { once: true });
    });
    try {
      const output = await Promise.race([
        cancelled,
        Promise.resolve().then(() => {
          signal.throwIfAborted();
          return this.#driver.run(task, { text: input.text }, signal);
        }),
      ]);
      if (signal.aborted || performance.now() >= expires) throw stopped();
      let value: T | null;
      try {
        value = project(output);
        if (checkSensitiveMessage(JSON.stringify(value)).sensitive)
          throw new Error();
      } catch {
        throw new LocalModelTaskError("invalid_response");
      }
      if (signal.aborted || performance.now() >= expires) throw stopped();
      return value === null
        ? { status: "not_understood", value: null }
        : { status: "ok", value };
    } catch (error) {
      if (signal.aborted || performance.now() >= expires) throw stopped();
      if (error instanceof LocalModelTaskError) throw error;
      throw new LocalModelTaskError("unavailable");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort!);
    }
  }
}
