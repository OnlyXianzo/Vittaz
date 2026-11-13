import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Command, CommanderError } from "commander";
import {
  VERSION,
  LedgerError,
  PrivacyRedactor,
  batchApproveProposals,
  createManualTransaction,
  getWalletSummary,
  rejectProposal,
  undoAuditEntry,
} from "@vittaz/core";
import type {
  ApproveProposalResult,
  AssistantReply,
  AssistantService,
  ExcelImportResult,
  WalletSummary,
} from "@vittaz/core";
import {
  EXPORT_PRIVACY_WARNING,
  createBackup,
  importExcelBuffer,
  openLedgerStore,
  restoreBackup,
} from "@vittaz/storage";
import type { OperationalStore } from "@vittaz/storage";
import {
  create_ai_sdk_provider,
  ReadOnlyQaLoop,
  SharedAssistantService,
  ValidatedLocalModelTasks,
} from "@vittaz/agent";

export type CliEnv = Record<string, string | undefined>;
export interface CliDeps {
  env?: CliEnv;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  read_file?: (path: string) => Promise<Uint8Array>;
  write_file?: (path: string, data: Uint8Array, mode: number) => Promise<void>;
  fetch?: typeof fetch;
  assistant_factory?: (
    store: OperationalStore,
    env: CliEnv,
    fetch_fn: typeof fetch,
  ) => Promise<AssistantService>;
}
class CliError extends Error {
  constructor(readonly code: string) {
    super("CLI request failed");
    this.name = "CliError";
  }
}
function integerOption(value: unknown): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new CliError("invalid_arguments");
  return number;
}
function stringOption(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function tagsOption(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(String(value));
    if (!Array.isArray(parsed) || parsed.some((tag) => typeof tag !== "string"))
      throw new Error();
    return parsed as string[];
  } catch {
    throw new CliError("invalid_arguments");
  }
}
function errorCode(error: unknown): string {
  if (error instanceof CliError) return error.code;
  if (error instanceof LedgerError) return error.code.toLowerCase();
  if (error instanceof CommanderError) return "invalid_arguments";
  if (error instanceof Error) {
    if (error.message === "Invalid spreadsheet") return "invalid_spreadsheet";
    if (
      error.message === "Invalid backup format" ||
      error.message === "Invalid local backup data" ||
      error.message.startsWith("Backup integrity check failed")
    )
      return "invalid_backup";
  }
  return "internal_error";
}
function walletSummary(summary: WalletSummary) {
  return {
    wallet_id: summary.walletId,
    opening_balance_paise: summary.openingBalancePaise,
    cash_in_paise: summary.cashInPaise,
    cash_out_paise: summary.cashOutPaise,
    balance_paise: summary.balancePaise,
  };
}
function importResult(result: ExcelImportResult) {
  return {
    dry_run: result.dryRun,
    total_rows: result.totalRows,
    valid_rows: result.validRows,
    imported_count: result.importedCount,
    skipped_duplicates: result.skippedDuplicates,
    extra_columns: result.extraColumns,
    errors: result.errors.map((error) => ({
      row_number: error.rowNumber,
      message: error.message,
    })),
  };
}
function approved(result: ApproveProposalResult) {
  return {
    proposal_id: result.transaction.proposal_id,
    transaction_id: result.transaction.id,
    already_approved: result.alreadyApproved,
    audit_id: result.auditId,
    transaction: result.transaction,
  };
}
async function defaultAssistant(
  store: OperationalStore,
  env: CliEnv,
  fetch_fn: typeof fetch,
): Promise<AssistantService> {
  try {
    const base_url = env.VITTAZ_AI_BASE_URL;
    const api_key = env.VITTAZ_AI_API_KEY;
    const model = env.VITTAZ_AI_MODEL;
    // `default_model` is required by the shared provider contract, and the SDK
    // cannot construct a model handle without one. Fail closed instead of
    // sending a request the provider would reject anyway.
    if (!base_url || !api_key || !model) throw new Error();
    const redactor = new PrivacyRedactor();
    const rows = await store.read(async (repos) => ({
      transactions: await repos.transactions.list(),
      proposals: await repos.proposals.list(),
    }));
    for (const row of [...rows.transactions, ...rows.proposals])
      if (row.counterparty_name)
        redactor.registerCounterparty(row.counterparty_name);
    const client = create_ai_sdk_provider(
      {
        id: env.VITTAZ_AI_KEY_NICKNAME ?? "cli",
        kind: "openai_compatible",
        credential_ref: "VITTAZ_AI_API_KEY",
        base_url,
        default_model: model,
      },
      {
        resolve_credential: async () => api_key,
        fetch: fetch_fn,
        redactor,
      },
    );
    const qa = new ReadOnlyQaLoop({
      client,
      redactor,
      data: {
        listTransactions: () =>
          store.read((repos) => repos.transactions.list()),
        getWalletSummary: (walletId) => getWalletSummary(store, walletId),
      },
    });
    const local = new ValidatedLocalModelTasks({
      run: async () => {
        throw new Error("local_model_unavailable");
      },
    });
    return new SharedAssistantService({
      ledger: store,
      history: store.history,
      preferences: store.preferences,
      rules: store.rules,
      qa,
      local,
      redactor,
    });
  } catch {
    throw new CliError("assistant_unavailable");
  }
}
export async function runCli(
  argv: readonly string[],
  deps: CliDeps = {},
): Promise<number> {
  const env = deps.env ?? process.env;
  const stdout =
    deps.stdout ??
    ((line: string) => {
      process.stdout.write(line + "\n");
    });
  const stderr =
    deps.stderr ??
    ((line: string) => {
      process.stderr.write(line + "\n");
    });
  const read_file = deps.read_file ?? readFile;
  const write_file =
    deps.write_file ??
    (async (path: string, data: Uint8Array, mode: number) => {
      await writeFile(path, data, { mode });
    });
  const fetch_fn = deps.fetch ?? fetch;
  const emit = (value: Record<string, unknown>) =>
    stdout(JSON.stringify(value));
  const success = (value: Record<string, unknown> = {}) =>
    emit({ ok: true, ...value });
  const fail = (error: unknown) => {
    const line = JSON.stringify({ ok: false, error_code: errorCode(error) });
    stdout(line);
    stderr(line);
    return 1;
  };
  const args = [...argv];
  if (args.length === 0 || args[0] === "--version" || args[0] === "-V") {
    success({ version: VERSION });
    return 0;
  }
  if (args[0] === "--help" || args[0] === "-h") {
    success({
      version: VERSION,
      commands: [
        { name: "add", description: "Add a manual transaction." },
        { name: "ledger", description: "List ledger transactions." },
        { name: "inbox", description: "List, approve, or reject proposals." },
        { name: "undo", description: "Undo an audit entry." },
        { name: "balance", description: "Show a wallet balance." },
        { name: "import", description: "Import an XLSX spreadsheet." },
        { name: "backup", description: "Write a plaintext ledger backup." },
        { name: "restore", description: "Restore a ledger backup." },
        { name: "ask", description: "Ask the shared assistant." },
      ],
    });
    return 0;
  }
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeOut: () => undefined,
    writeErr: () => undefined,
  });
  const dbPath = (opts: Record<string, unknown>) => {
    const path =
      stringOption(opts.db) ??
      stringOption(program.opts().db) ??
      env.VITTAZ_DB_PATH;
    if (!path) throw new CliError("db_path_required");
    return path;
  };
  const withStore = async <T>(
    opts: Record<string, unknown>,
    work: (store: OperationalStore) => Promise<T>,
  ): Promise<T> => {
    const store = openLedgerStore(dbPath(opts));
    try {
      return await work(store);
    } finally {
      await store.close();
    }
  };
  const command = (name: string) => {
    const cmd = program.command(name);
    cmd.exitOverride();
    cmd.option("--db <path>", "SQLite database path");
    return cmd;
  };
  program.option("--db <path>", "SQLite database path");

  command("add")
    .description("Add a manual transaction")
    .requiredOption(
      "--amount_paise <paise>",
      "Positive integer amount in paise",
    )
    .requiredOption("--direction <direction>", "debit or credit")
    .option("--wallet_id <id>")
    .option("--event_type <type>")
    .option("--category <category>")
    .option("--counterparty_name <name>")
    .option("--account_last4 <last4>")
    .option("--note <note>")
    .option("--benefit <benefit>")
    .option("--benefit_paise <paise>")
    .option("--tag <tag>")
    .option("--tags_json <json>")
    .option("--split_owed_paise <paise>")
    .option("--occurred_at <iso>")
    .action(async (raw: unknown) => {
      const opts = raw as Record<string, unknown>;
      const result = await withStore(opts, (store) =>
        createManualTransaction(store, {
          amountPaise: integerOption(opts.amount_paise),
          direction: String(opts.direction) as "debit" | "credit",
          walletId: stringOption(opts.wallet_id),
          eventType: stringOption(opts.event_type) as
            "normal" | "refund" | "reversal" | undefined,
          category: stringOption(opts.category),
          counterpartyName: stringOption(opts.counterparty_name),
          accountLast4: stringOption(opts.account_last4),
          note: stringOption(opts.note),
          benefit: stringOption(opts.benefit),
          benefitPaise:
            opts.benefit_paise === undefined
              ? undefined
              : integerOption(opts.benefit_paise),
          tag: stringOption(opts.tag),
          tags: tagsOption(opts.tags_json),
          splitOwedPaise:
            opts.split_owed_paise === undefined
              ? undefined
              : integerOption(opts.split_owed_paise),
          occurredAt: stringOption(opts.occurred_at),
        }),
      );
      success({ transaction: result.transaction, audit_id: result.auditId });
    });

  command("ledger")
    .description("List ledger transactions")
    .option("--status <status>")
    .option("--wallet_id <id>")
    .option("--limit <count>")
    .action(async (raw: unknown) => {
      const opts = raw as Record<string, unknown>;
      const limit = opts.limit === undefined ? 50 : integerOption(opts.limit);
      if (limit < 1 || limit > 500) throw new CliError("invalid_arguments");
      const transactions = await withStore(opts, async (store) => {
        const rows = await store.read((repos) => repos.transactions.list());
        const status = stringOption(opts.status);
        const walletId = stringOption(opts.wallet_id);
        return rows
          .filter((row) => (status ? row.status === status : true))
          .filter((row) => (walletId ? row.wallet_id === walletId : true))
          .slice(0, limit);
      });
      success({ transactions });
    });

  const inbox = program.command("inbox");
  inbox.exitOverride();
  inbox
    .command("list")
    .exitOverride()
    .option("--db <path>")
    .option("--status <status>")
    .action(async (raw: unknown) => {
      const opts = raw as Record<string, unknown>;
      const status = stringOption(opts.status) ?? "pending";
      const proposals = await withStore(opts, async (store) => {
        const rows = await store.read((repos) => repos.proposals.list());
        return rows.filter((row) => row.status === status);
      });
      success({ proposals });
    });
  inbox
    .command("approve")
    .exitOverride()
    .argument("<ids...>", "Proposal IDs")
    .option("--db <path>")
    .action(async (ids: string[], raw: unknown) => {
      const opts = raw as Record<string, unknown>;
      const results = await withStore(opts, (store) =>
        batchApproveProposals(store, ids),
      );
      success({ approved: results.map(approved) });
    });
  inbox
    .command("reject")
    .exitOverride()
    .argument("<id>", "Proposal ID")
    .option("--db <path>")
    .action(async (id: string, raw: unknown) => {
      const opts = raw as Record<string, unknown>;
      const proposal = await withStore(opts, (store) =>
        rejectProposal(store, id),
      );
      success({ proposal });
    });

  command("undo")
    .description("Undo an audit entry")
    .argument("<audit_id>", "Audit entry ID")
    .action(async (auditId: string, raw: unknown) => {
      const opts = raw as Record<string, unknown>;
      const result = await withStore(opts, (store) =>
        undoAuditEntry(store, auditId),
      );
      success({
        undone_audit_id: result.undoneAuditId,
        restored_state: result.restoredState,
      });
    });

  command("balance")
    .description("Show a wallet balance")
    .argument("[wallet_id]", "Wallet ID", "cash")
    .action(async (walletId: string, raw: unknown) => {
      const opts = raw as Record<string, unknown>;
      const summary = await withStore(opts, (store) =>
        getWalletSummary(store, walletId),
      );
      success(walletSummary(summary));
    });

  command("import")
    .description("Import an XLSX spreadsheet")
    .argument("<file>", "XLSX file path")
    .option("--dry_run", "Validate without committing")
    .option("--wallet_id <id>")
    .action(async (file: string, raw: unknown) => {
      const opts = raw as Record<string, unknown>;
      const buffer = await read_file(file);
      const result = await withStore(opts, (store) =>
        importExcelBuffer(store, buffer, {
          dryRun: opts.dry_run === true,
          walletId: stringOption(opts.wallet_id),
        }),
      );
      success(importResult(result));
    });

  command("backup")
    .description("Write a plaintext ledger backup")
    .argument("<file>", "Backup file path")
    .action(async (file: string, raw: unknown) => {
      const opts = raw as Record<string, unknown>;
      const backup = await withStore(opts, (store) => createBackup(store));
      await write_file(
        file,
        new TextEncoder().encode(JSON.stringify(backup, null, 2)),
        0o600,
      );
      success({
        privacy_warning: EXPORT_PRIVACY_WARNING,
        format: backup.format,
        schema_version: backup.schemaVersion,
      });
    });

  command("restore")
    .description("Restore a ledger backup")
    .argument("<file>", "Backup file path")
    .action(async (file: string, raw: unknown) => {
      const opts = raw as Record<string, unknown>;
      const buffer = await read_file(file);
      let data: unknown;
      try {
        data = JSON.parse(new TextDecoder().decode(buffer));
      } catch {
        throw new CliError("invalid_backup");
      }
      await withStore(opts, (store) => restoreBackup(store, data));
      success();
    });

  command("ask")
    .description("Ask the shared assistant")
    .argument("<text>", "User message")
    .option(
      "--action <action>",
      "question, draft_entry, or improve_note",
      "question",
    )
    .option("--conversation_id <id>", "Conversation ID", "cli")
    .option("--request_id <id>", "Request ID")
    .option("--timeout_ms <ms>", "Timeout in milliseconds", "30000")
    .action(async (text: string, raw: unknown) => {
      const opts = raw as Record<string, unknown>;
      const action = String(opts.action);
      if (!["question", "draft_entry", "improve_note"].includes(action))
        throw new CliError("invalid_arguments");
      const timeout_ms = integerOption(opts.timeout_ms);
      if (timeout_ms < 1 || timeout_ms > 120000)
        throw new CliError("invalid_arguments");
      const reply: AssistantReply = await withStore(opts, async (store) => {
        const assistant = deps.assistant_factory
          ? await deps.assistant_factory(store, env, fetch_fn)
          : await defaultAssistant(store, env, fetch_fn);
        return assistant.handle(
          {
            request_id: stringOption(opts.request_id) ?? `cli_${randomUUID()}`,
            conversation_id: String(opts.conversation_id),
            action,
            text,
          },
          { source: "cli", authenticated: true, paired_telegram: false },
          { timeout_ms },
        );
      });
      success({
        status: reply.status,
        text: reply.text,
        proposal_id: reply.proposal_id,
      });
    });

  try {
    await program.parseAsync(args, { from: "user" });
    return 0;
  } catch (error) {
    return fail(error);
  }
}
