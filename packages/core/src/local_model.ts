import type { TransactionDirection } from "./ledger/repositories.js";
/** Pure task ports. Real inference/runtime selection belongs to a platform adapter. */
export type LocalModelTaskName = "parse_entry" | "improve_note";
export interface LocalTaskInput {
  text: string;
}
export interface LocalTaskOptions {
  signal?: AbortSignal;
  timeout_ms?: number;
}
export interface LocalEntryDraft {
  amount_paise: number;
  direction: TransactionDirection;
  category: string;
  counterparty_name: string | null;
  note: string | null;
  split_owed_paise: number;
}
export type LocalTaskResult<T> =
  | { status: "ok"; value: T }
  | { status: "not_understood" | "sensitive_dropped"; value: null };
export interface LocalModelTasks {
  parse_entry(
    input: LocalTaskInput,
    options?: LocalTaskOptions,
  ): Promise<LocalTaskResult<LocalEntryDraft>>;
  improve_note(
    input: LocalTaskInput,
    options?: LocalTaskOptions,
  ): Promise<LocalTaskResult<string>>;
}
/** Untrusted model output enters as unknown, never as an executable tool. */
export interface LocalModelRunner {
  run(
    task: LocalModelTaskName,
    input: LocalTaskInput,
    signal: AbortSignal,
  ): Promise<unknown>;
}
