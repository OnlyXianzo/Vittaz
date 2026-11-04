import { z } from "zod";
import { checkSensitiveMessage, sumPaise } from "@vittaz/core";
import type {
  CreateProposalInput,
  PrivacyRedactor,
  ProposalRow,
  TransactionRow,
  WalletSummary,
} from "@vittaz/core";
import type { ToolSpec } from "./provider_client.js";
export class ToolValidationError extends Error {
  constructor() {
    super("Invalid tool call");
    this.name = "ToolValidationError";
  }
}
export class ReadOnlyViolationError extends Error {
  constructor() {
    super("Tool not permitted in read-only context");
    this.name = "ReadOnlyViolationError";
  }
}
export class ToolExecutionError extends Error {
  constructor() {
    super("Tool execution failed");
    this.name = "ToolExecutionError";
  }
}
const nonnegative = z
  .int()
  .nonnegative()
  .refine((value) => !Object.is(value, -0));
const positive = z.int().positive();
const integer = z.int().refine((value) => !Object.is(value, -0));
const person = z.string().regex(/^Person_[1-9]\d{0,5}$/);
const label = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => value.trim().length > 0);
const calendarDate = z.iso.date().refine((value) => !value.startsWith("0000"));
const calendarTime = z.iso
  .datetime()
  .refine((value) => !value.startsWith("0000"));
const proposalArgs = z
  .strictObject({
    amount_paise: positive,
    direction: z.enum(["debit", "credit"]),
    category: label,
    counterparty: person.optional(),
    split_owed_paise: nonnegative.default(0),
    benefit: z
      .enum(["self", "family", "reimbursable", "business", "other"])
      .default("self"),
    benefit_paise: nonnegative.default(0),
    tag: label.optional(),
    tags: z.array(label).max(16).default([]),
    occurred_at: calendarTime.optional(),
  })
  .refine((value) => value.split_owed_paise <= value.amount_paise);
const queryArgs = z
  .strictObject({
    from_date: calendarDate.optional(),
    to_date: calendarDate.optional(),
    category: label.optional(),
    wallet_id: z.string().min(1).max(128).optional(),
    counterparty: person.optional(),
    status: z.enum(["unverified", "ai_checked", "user_confirmed"]).optional(),
    limit: z.int().min(1).max(50).default(10),
  })
  .refine(
    (value) =>
      !value.from_date || !value.to_date || value.from_date <= value.to_date,
  );
const monthArgs = z.strictObject({
  year_month: z
    .string()
    .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/)
    .refine((value) => !value.startsWith("0000")),
});
const balanceArgs = z.strictObject({
  wallet_id: z.string().min(1).max(128).default("cash"),
});
const personArgs = z.strictObject({ name: person });
const pendingArgs = z.strictObject({
  limit: z.int().min(1).max(50).default(10),
});
const qaSchemas = new Map<string, z.ZodType>([
  ["find_person", personArgs],
  ["query_transactions", queryArgs],
  ["get_balance", balanceArgs],
  ["get_month_summary", monthArgs],
  ["check_unverified", pendingArgs],
]);
function spec(name: string, schema: z.ZodType): ToolSpec {
  const parameters = z.toJSONSchema(schema, { target: "draft-7", io: "input" });
  delete parameters.$schema;
  return {
    type: "function",
    function: {
      name,
      description:
        name === "propose_transaction"
          ? "Create a pending draft only; user approval required."
          : "Read-only minimal ledger data; never approve or mutate.",
      parameters,
    },
  };
}
export const PROPOSE_TRANSACTION_TOOL_SPEC = spec(
  "propose_transaction",
  proposalArgs,
);
export const QA_READ_ONLY_TOOL_SPECS: readonly ToolSpec[] = [...qaSchemas].map(
  ([name, schema]) => spec(name, schema),
);
export interface ToolRegistry {
  readonly specs: readonly ToolSpec[];
  execute(call: unknown): Promise<unknown>;
}
export interface QaDataSource {
  listTransactions(): Promise<TransactionRow[]>;
  getWalletSummary(walletId: string): Promise<WalletSummary>;
}
export type ProposePending = (
  input: CreateProposalInput,
) => Promise<ProposalRow>;
const envelope = z.strictObject({
  id: z.string().max(128).optional(),
  type: z.literal("function").optional(),
  function: z.strictObject({
    name: z
      .string()
      .max(128)
      .regex(/^[a-z][a-z0-9_]*$/),
    arguments: z.union([
      z.string().max(16384),
      z.record(z.string(), z.unknown()),
    ]),
  }),
});
function readCall(value: unknown) {
  try {
    return envelope.parse(value).function;
  } catch {
    throw new ToolValidationError();
  }
}
function argumentsFor(schema: z.ZodType, raw: unknown): unknown {
  try {
    const args = typeof raw === "string" ? JSON.parse(raw) : raw;
    const serialized = JSON.stringify(args);
    if (
      serialized.length > 16384 ||
      checkSensitiveMessage(serialized).sensitive
    )
      throw new Error();
    return schema.parse(args);
  } catch {
    throw new ToolValidationError();
  }
}
function localPerson(redactor: PrivacyRedactor, token: string): string | null {
  return (
    redactor.getAllMappings().find((entry) => entry.placeholder === token)
      ?.name ?? null
  );
}
async function executeSafely<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch {
    throw new ToolExecutionError();
  }
}
/** Local application helper returns a proposal, never commits a transaction. */
export async function validateAndCreateProposalFromToolCall(
  propose: ProposePending,
  redactor: PrivacyRedactor,
  call: unknown,
): Promise<ProposalRow> {
  const parsed = readCall(call);
  if (parsed.name !== "propose_transaction") throw new ToolValidationError();
  const args = argumentsFor(proposalArgs, parsed.arguments) as z.infer<
    typeof proposalArgs
  >;
  const name = args.counterparty
    ? localPerson(redactor, args.counterparty)
    : null;
  if (args.counterparty && !name) throw new ToolValidationError();
  return executeSafely(async () => {
    const tags = args.tags.map((tag) => tag.trim().toLowerCase());
    const row = await propose({
      walletId: "bank_default",
      amountPaise: args.amount_paise,
      direction: args.direction,
      category: args.category.trim().toLowerCase(),
      counterpartyName: name,
      splitOwedPaise: args.split_owed_paise,
      benefit: args.benefit,
      benefitPaise: args.benefit_paise,
      tag: args.tag ? args.tag.trim().toLowerCase() : (tags[0] ?? null),
      tags,
      occurredAt: args.occurred_at,
      source: "ai",
      initialTxStatus: "ai_checked",
    });
    if (row.status !== "pending" || row.committed_tx_id !== null)
      throw new Error();
    return row;
  });
}
const draftOutput = z.strictObject({
  status: z.literal("pending"),
  amount_paise: positive,
  direction: z.enum(["debit", "credit"]),
  counterparty: person.nullable(),
});
export function createDraftToolExecutor(
  propose: ProposePending,
  redactor: PrivacyRedactor,
): ToolRegistry {
  return {
    specs: [structuredClone(PROPOSE_TRANSACTION_TOOL_SPEC)],
    async execute(call) {
      const row = await validateAndCreateProposalFromToolCall(
        propose,
        redactor,
        call,
      );
      return executeSafely(async () =>
        draftOutput.parse({
          status: row.status,
          amount_paise: row.amount_paise,
          direction: row.direction,
          counterparty: row.counterparty_name
            ? redactor.registerCounterparty(row.counterparty_name)
            : null,
        }),
      );
    },
  };
}
const categories = [
  "food",
  "lunch",
  "dinner",
  "groceries",
  "transport",
  "shopping",
  "rent",
  "utilities",
  "uncategorized",
  "income",
  "health",
  "education",
  "travel",
  "entertainment",
  "misc",
  "other",
] as const;
const category = (value: string): (typeof categories)[number] =>
  categories.includes(value as (typeof categories)[number])
    ? (value as (typeof categories)[number])
    : "other";
const rowInput = z.object({
  amount_paise: positive,
  direction: z.enum(["debit", "credit"]),
  event_type: z.enum(["normal", "refund", "reversal"]),
  category: z.string(),
  wallet_id: z.string(),
  counterparty_name: z.string().nullable(),
  occurred_at: calendarTime,
  status: z.enum(["unverified", "ai_checked", "user_confirmed"]),
});
const rowOutput = z.strictObject({
  amount_paise: positive,
  direction: z.enum(["debit", "credit"]),
  event_type: z.enum(["normal", "refund", "reversal"]),
  category: z.enum(categories),
  counterparty: person.nullable(),
  occurred_at: calendarTime,
  status: z.enum(["unverified", "ai_checked", "user_confirmed"]),
});
const balanceOutput = z.strictObject({
  opening_balance_paise: integer,
  cash_in_paise: nonnegative,
  cash_out_paise: nonnegative,
  balance_paise: integer,
});
const summaryOutput = z.strictObject({
  spent_paise: nonnegative,
  income_paise: nonnegative,
  count: z.int().nonnegative(),
  by_category: z.array(
    z.strictObject({ category: z.enum(categories), spent_paise: positive }),
  ),
});
type QaArgs = z.infer<typeof queryArgs> & {
  name?: string;
  year_month?: string;
};
/** Only application query functions enter this object, not database/repository/write handles. */
export function createQaToolExecutor(
  source: QaDataSource,
  redactor: PrivacyRedactor,
): ToolRegistry {
  return {
    specs: structuredClone(QA_READ_ONLY_TOOL_SPECS),
    async execute(call) {
      const parsed = readCall(call);
      const schema = qaSchemas.get(parsed.name);
      if (!schema) throw new ReadOnlyViolationError();
      const args = argumentsFor(schema, parsed.arguments) as QaArgs;
      return executeSafely(async () => {
        if (parsed.name === "get_balance") {
          const summary = await source.getWalletSummary(args.wallet_id!);
          return balanceOutput.parse({
            opening_balance_paise: summary.openingBalancePaise,
            cash_in_paise: summary.cashInPaise,
            cash_out_paise: summary.cashOutPaise,
            balance_paise: summary.balancePaise,
          });
        }
        const rows = z.array(rowInput).parse(await source.listTransactions());
        for (const row of rows)
          if (row.counterparty_name)
            redactor.registerCounterparty(row.counterparty_name);
        if (parsed.name === "find_person")
          return z.strictObject({ person, found: z.boolean() }).parse({
            person: args.name,
            found: localPerson(redactor, args.name!) !== null,
          });
        if (parsed.name === "get_month_summary") {
          const selected = rows.filter((row) =>
            row.occurred_at.startsWith(args.year_month! + "-"),
          );
          const debits = selected.filter(
            (row) => row.direction === "debit" && row.event_type === "normal",
          );
          const totals = new Map<string, number>();
          for (const row of debits) {
            const label = category(row.category);
            totals.set(
              label,
              sumPaise([totals.get(label) ?? 0, row.amount_paise]),
            );
          }
          return summaryOutput.parse({
            spent_paise: sumPaise(debits.map((row) => row.amount_paise)),
            income_paise: sumPaise(
              selected
                .filter(
                  (row) =>
                    row.direction === "credit" && row.event_type === "normal",
                )
                .map((row) => row.amount_paise),
            ),
            count: selected.length,
            by_category: [...totals]
              .map(([category, spent_paise]) => ({ category, spent_paise }))
              .sort((a, b) => b.spent_paise - a.spent_paise),
          });
        }
        const local = args.counterparty
          ? localPerson(redactor, args.counterparty)
          : null;
        const selected = rows
          .filter((row) =>
            parsed.name === "check_unverified"
              ? row.status !== "user_confirmed"
              : (!args.from_date ||
                  row.occurred_at.slice(0, 10) >= args.from_date) &&
                (!args.to_date ||
                  row.occurred_at.slice(0, 10) <= args.to_date) &&
                (!args.category || row.category === args.category) &&
                (!args.wallet_id || row.wallet_id === args.wallet_id) &&
                (!args.counterparty ||
                  (local !== null && row.counterparty_name === local)) &&
                (!args.status || row.status === args.status),
          )
          .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
          .slice(0, args.limit);
        return z.array(rowOutput).parse(
          selected.map((row) => ({
            amount_paise: row.amount_paise,
            direction: row.direction,
            event_type: row.event_type,
            category: category(row.category),
            counterparty: row.counterparty_name
              ? redactor.registerCounterparty(row.counterparty_name)
              : null,
            occurred_at: row.occurred_at,
            status: row.status,
          })),
        );
      });
    },
  };
}
