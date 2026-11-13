import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import * as XLSX from "xlsx";
import {
  createProposal,
  type AssistantReply,
  type AssistantService,
} from "@vittaz/core";
import { openLedgerStore } from "@vittaz/storage";
import { runCli } from "./cli.js";

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "vittaz-cli-"));
  dirs.push(dir);
  const db = join(dir, "ledger.db");
  const out: string[] = [];
  const err: string[] = [];
  const env = { VITTAZ_DB_PATH: db };
  const run = (argv: string[], deps: Parameters<typeof runCli>[1] = {}) =>
    runCli(argv, {
      env,
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
      ...deps,
    });
  const json = () => JSON.parse(out.at(-1) ?? "null");
  return { dir, db, out, err, env, run, json };
}
function book(rows: unknown[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Synthetic");
  return new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}
function snakeKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(snakeKeys);
  if (value !== null && typeof value === "object")
    return Object.entries(value).every(
      ([key, item]) => /^[a-z][a-z0-9_]*$/.test(key) && snakeKeys(item),
    );
  return true;
}

test("cli_version_and_help_emit_snake_case_json", async () => {
  const f = await fixture();
  expect(await f.run([])).toBe(0);
  expect(f.json()).toMatchObject({ ok: true, version: "0.0.1" });
  expect(await f.run(["--version"])).toBe(0);
  expect(f.json()).toMatchObject({ ok: true, version: "0.0.1" });
  expect(await f.run(["--help"])).toBe(0);
  expect(f.json().ok).toBe(true);
  expect(Array.isArray(f.json().commands)).toBe(true);
  expect(snakeKeys(f.json())).toBe(true);
});

test("cli_unknown_command_and_missing_db_fail_statically", async () => {
  const f = await fixture();
  expect(await f.run(["nope"])).toBe(1);
  expect(f.json()).toMatchObject({
    ok: false,
    error_code: "invalid_arguments",
  });
  expect(
    await f.run(["add", "--amount_paise", "1", "--direction", "debit"], {
      env: {},
    }),
  ).toBe(1);
  expect(f.json()).toMatchObject({ ok: false, error_code: "db_path_required" });
});

test("cli_add_writes_manual_transaction_and_invalid_direction_fails", async () => {
  const f = await fixture();
  expect(
    await f.run([
      "add",
      "--amount_paise",
      "1234",
      "--direction",
      "debit",
      "--category",
      "food",
      "--counterparty_name",
      "SynthPerson",
      "--note",
      "synthetic note",
      "--tags_json",
      '["food"]',
    ]),
  ).toBe(0);
  const added = f.json();
  expect(added.ok).toBe(true);
  expect(added.transaction.amount_paise).toBe(1234);
  expect(added.transaction.status).toBe("user_confirmed");
  expect(typeof added.audit_id).toBe("string");
  expect(snakeKeys(added)).toBe(true);
  expect(
    await f.run(["add", "--amount_paise", "1", "--direction", "sideways"]),
  ).toBe(1);
  expect(f.json().ok).toBe(false);
});

test("cli_ledger_lists_and_filters_transactions", async () => {
  const f = await fixture();
  await f.run(["add", "--amount_paise", "100", "--direction", "debit"]);
  await f.run([
    "add",
    "--amount_paise",
    "200",
    "--direction",
    "credit",
    "--wallet_id",
    "bank_default",
  ]);
  expect(await f.run(["ledger"])).toBe(0);
  expect(f.json().transactions).toHaveLength(2);
  expect(await f.run(["ledger", "--wallet_id", "bank_default"])).toBe(0);
  expect(f.json().transactions).toHaveLength(1);
  expect(f.json().transactions[0].amount_paise).toBe(200);
  expect(
    await f.run(["ledger", "--status", "user_confirmed", "--limit", "1"]),
  ).toBe(0);
  expect(f.json().transactions).toHaveLength(1);
});

test("cli_inbox_list_approve_reject_and_batch_approve", async () => {
  const f = await fixture();
  const store = openLedgerStore(f.db);
  const a = await createProposal(store, {
    amountPaise: 100,
    direction: "debit",
  });
  const b = await createProposal(store, {
    amountPaise: 200,
    direction: "credit",
  });
  const c = await createProposal(store, {
    amountPaise: 300,
    direction: "debit",
  });
  await store.close();
  expect(await f.run(["inbox", "list"])).toBe(0);
  expect(f.json().proposals).toHaveLength(3);
  expect(await f.run(["inbox", "approve", a.id, b.id])).toBe(0);
  expect(f.json().approved).toHaveLength(2);
  expect(f.json().approved[0].already_approved).toBe(false);
  expect(await f.run(["inbox", "approve", a.id])).toBe(0);
  expect(f.json().approved[0].already_approved).toBe(true);
  expect(await f.run(["inbox", "reject", c.id])).toBe(0);
  expect(f.json().proposal.status).toBe("rejected");
  expect(await f.run(["inbox", "reject", "missing"])).toBe(1);
  expect(f.json().error_code).toBe("proposal_not_found");
});

test("cli_undo_restores_and_rejects_stale_undo", async () => {
  const f = await fixture();
  await f.run(["add", "--amount_paise", "100", "--direction", "debit"]);
  const auditId = f.json().audit_id;
  expect(await f.run(["undo", auditId])).toBe(0);
  expect(f.json().undone_audit_id).toBe(auditId);
  expect(f.json().restored_state).toBeNull();
  expect(await f.run(["undo", auditId])).toBe(1);
  expect(f.json().error_code).toBe("already_undone");
});

test("cli_balance_reports_wallet_summary", async () => {
  const f = await fixture();
  await f.run(["add", "--amount_paise", "100", "--direction", "credit"]);
  expect(await f.run(["balance"])).toBe(0);
  expect(f.json()).toMatchObject({
    ok: true,
    wallet_id: "cash",
    balance_paise: 100,
  });
  expect(await f.run(["balance", "missing"])).toBe(1);
  expect(f.json().ok).toBe(false);
});

test("cli_import_dry_run_and_commit_use_spreadsheet_adapter", async () => {
  const f = await fixture();
  const buffer = book([
    ["Date", "Description", "Amount", "Direction"],
    ["2026-11-01", "SynthGrocer", "10.50", "Debit"],
  ]);
  const read_file = vi.fn(async () => buffer);
  expect(
    await f.run(["import", "synthetic.xlsx", "--dry_run"], { read_file }),
  ).toBe(0);
  expect(f.json()).toMatchObject({
    ok: true,
    dry_run: true,
    imported_count: 0,
    valid_rows: 1,
  });
  expect(await f.run(["import", "synthetic.xlsx"], { read_file })).toBe(0);
  expect(f.json().imported_count).toBe(1);
  expect(
    await f.run(["import", "bad.xlsx"], {
      read_file: async () => new Uint8Array([1]),
    }),
  ).toBe(1);
  expect(f.json().error_code).toBe("invalid_spreadsheet");
});

test("cli_backup_and_restore_round_trip_with_plaintext_warning", async () => {
  const f = await fixture();
  await f.run([
    "add",
    "--amount_paise",
    "100",
    "--direction",
    "debit",
    "--counterparty_name",
    "SynthPerson",
  ]);
  const backupPath = join(f.dir, "backup.json");
  const writes: { path: string; mode: number; data: Uint8Array }[] = [];
  expect(
    await f.run(["backup", backupPath], {
      write_file: async (path, data, mode) => {
        writes.push({ path, data, mode });
      },
    }),
  ).toBe(0);
  expect(f.json().privacy_warning).toContain("WARNING");
  expect(writes[0]?.mode).toBe(0o600);
  const backup = JSON.parse(new TextDecoder().decode(writes[0]!.data));
  expect(backup.format).toBe("khataclaw-backup-v1");
  const db2 = join(f.dir, "restored.db");
  expect(
    await f.run(["restore", backupPath], {
      env: { VITTAZ_DB_PATH: db2 },
      read_file: async () => new TextEncoder().encode(JSON.stringify(backup)),
    }),
  ).toBe(0);
  expect(f.json().ok).toBe(true);
  expect(
    await f.run(["restore", backupPath], {
      env: { VITTAZ_DB_PATH: db2 },
      read_file: async () => new TextEncoder().encode("{}"),
    }),
  ).toBe(1);
  expect(f.json().error_code).toBe("invalid_backup");
});

test("cli_ask_uses_assistant_port_and_verified_cli_origin", async () => {
  const f = await fixture();
  const handle = vi.fn(async (): Promise<AssistantReply> => ({
    status: "answered",
    text: "synthetic answer",
    proposal_id: null,
  }));
  const assistant: AssistantService = { handle };
  expect(
    await f.run(
      [
        "ask",
        "what is my balance?",
        "--action",
        "question",
        "--conversation_id",
        "chat",
        "--request_id",
        "req_1",
      ],
      {
        assistant_factory: async () => assistant,
      },
    ),
  ).toBe(0);
  expect(f.json()).toMatchObject({
    ok: true,
    status: "answered",
    text: "synthetic answer",
  });
  expect(handle).toHaveBeenCalledWith(
    {
      request_id: "req_1",
      conversation_id: "chat",
      action: "question",
      text: "what is my balance?",
    },
    { source: "cli", authenticated: true, paired_telegram: false },
    { timeout_ms: 30000 },
  );
  expect(
    await f.run(["ask", "hello"], { assistant_factory: async () => assistant }),
  ).toBe(0);
  expect(handle).toHaveBeenLastCalledWith(
    expect.objectContaining({ action: "question", conversation_id: "cli" }),
    { source: "cli", authenticated: true, paired_telegram: false },
    { timeout_ms: 30000 },
  );
});

test("cli_ask_default_provider_requires_explicit_env_and_fails_closed", async () => {
  const f = await fixture();
  expect(await f.run(["ask", "hello"])).toBe(1);
  expect(f.json().error_code).toBe("assistant_unavailable");
  const fetch_stub = vi.fn(async () => new Response("", { status: 400 }));
  expect(
    await f.run(["ask", "hello"], {
      env: {
        ...f.env,
        VITTAZ_AI_BASE_URL: "https://example.invalid",
        VITTAZ_AI_API_KEY: "synthetic-key",
        VITTAZ_AI_MODEL: "synthetic-model",
      },
      fetch: fetch_stub as unknown as typeof fetch,
    }),
  ).toBe(0);
  expect(f.json().status).toBe("unavailable");
  expect(
    await f.run(["ask", "Your OTP is 123456"], {
      env: {
        ...f.env,
        VITTAZ_AI_BASE_URL: "https://example.invalid",
        VITTAZ_AI_API_KEY: "synthetic-key",
        VITTAZ_AI_MODEL: "synthetic-model",
      },
      fetch: fetch_stub as unknown as typeof fetch,
    }),
  ).toBe(0);
  expect(f.json().status).toBe("sensitive_dropped");
  expect(fetch_stub).toHaveBeenCalledTimes(1);
});

test("cli_ask_default_local_tasks_are_unavailable_without_local_model", async () => {
  const f = await fixture();
  const env = {
    ...f.env,
    VITTAZ_AI_BASE_URL: "https://example.invalid",
    VITTAZ_AI_API_KEY: "synthetic-key",
    VITTAZ_AI_MODEL: "synthetic-model",
  };
  expect(
    await f.run(["ask", "improve this note", "--action", "improve_note"], {
      env,
    }),
  ).toBe(0);
  expect(f.json().status).toBe("unavailable");
  expect(
    await f.run(["ask", "draft 100 debit", "--action", "draft_entry"], { env }),
  ).toBe(0);
  expect(f.json().status).toBe("unavailable");
});

test("cli_argument_validation_and_internal_errors_are_static_json", async () => {
  const f = await fixture();
  expect(
    await f.run(["add", "--amount_paise", "abc", "--direction", "debit"]),
  ).toBe(1);
  expect(f.json().error_code).toBe("invalid_arguments");
  expect(
    await f.run([
      "add",
      "--amount_paise",
      "1",
      "--direction",
      "debit",
      "--tags_json",
      "{",
    ]),
  ).toBe(1);
  expect(f.json().error_code).toBe("invalid_arguments");
  expect(
    await f.run([
      "add",
      "--amount_paise",
      "1",
      "--direction",
      "debit",
      "--tags_json",
      "[1]",
    ]),
  ).toBe(1);
  expect(f.json().error_code).toBe("invalid_arguments");
  expect(
    await f.run([
      "add",
      "--amount_paise",
      "10",
      "--direction",
      "debit",
      "--benefit_paise",
      "1",
      "--split_owed_paise",
      "2",
    ]),
  ).toBe(0);
  expect(f.json().transaction.benefit_paise).toBe(1);
  expect(await f.run(["ledger", "--limit", "0"])).toBe(1);
  expect(f.json().error_code).toBe("invalid_arguments");
  expect(await f.run(["ask", "hello", "--action", "bad"])).toBe(1);
  expect(f.json().error_code).toBe("invalid_arguments");
  expect(await f.run(["ask", "hello", "--timeout_ms", "0"])).toBe(1);
  expect(f.json().error_code).toBe("invalid_arguments");
  expect(
    await f.run(["restore", "bad.json"], {
      read_file: async () => new TextEncoder().encode("{"),
    }),
  ).toBe(1);
  expect(f.json().error_code).toBe("invalid_backup");
  expect(
    await f.run(["backup", "out.json"], {
      write_file: async () => {
        throw new Error("disk_private");
      },
    }),
  ).toBe(1);
  expect(f.json().error_code).toBe("internal_error");
  expect(f.out.at(-1)).not.toContain("disk_private");
  expect(await f.run(["ledger", "--help"])).toBe(1);
  expect(f.json().error_code).toBe("invalid_arguments");
});

test("cli_db_option_overrides_env_and_import_reports_row_errors", async () => {
  const f = await fixture();
  const other = join(f.dir, "other.db");
  expect(
    await f.run([
      "--db",
      other,
      "add",
      "--amount_paise",
      "100",
      "--direction",
      "credit",
    ]),
  ).toBe(0);
  expect(await f.run(["balance", "--db", other])).toBe(0);
  expect(f.json().balance_paise).toBe(100);
  expect(await f.run(["balance"])).toBe(0);
  expect(f.json().balance_paise).toBe(0);
  const buffer = book([
    ["Date", "Amount", "Direction"],
    ["2026-11-01", "1.00", "Debit"],
    ["32/13/2026", "1.00", "Debit"],
  ]);
  expect(
    await f.run(["import", "rows.xlsx", "--dry_run"], {
      read_file: async () => buffer,
    }),
  ).toBe(0);
  expect(f.json().valid_rows).toBe(1);
  expect(f.json().errors).toHaveLength(1);
  expect(f.json().errors[0].row_number).toBe(3);
});

test("cli_default_assistant_seeds_names_and_executes_read_only_tools", async () => {
  const f = await fixture();
  await f.run([
    "add",
    "--amount_paise",
    "100",
    "--direction",
    "debit",
    "--counterparty_name",
    "SynthPerson",
  ]);
  await f.run(["add", "--amount_paise", "200", "--direction", "credit"]);
  const env = {
    ...f.env,
    VITTAZ_AI_BASE_URL: "https://example.invalid",
    VITTAZ_AI_API_KEY: "synthetic-key",
    VITTAZ_AI_MODEL: "synthetic-model",
  };
  const bodies: unknown[] = [];
  const fetch_stub = vi.fn(async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    if (bodies.length === 1)
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_balance",
                    type: "function",
                    function: { name: "get_balance", arguments: "{}" },
                  },
                  {
                    id: "query",
                    type: "function",
                    function: {
                      name: "query_transactions",
                      arguments: '{"limit":1}',
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    return new Response(
      JSON.stringify({
        choices: [
          { message: { content: "Person_1 has a synthetic balance." } },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  expect(
    await f.run(["ask", "what is my balance?"], {
      env,
      fetch: fetch_stub as unknown as typeof fetch,
    }),
  ).toBe(0);
  expect(f.json().status).toBe("answered");
  expect(f.json().text).toContain("SynthPerson");
  expect(JSON.stringify(bodies)).not.toContain("SynthPerson");
  expect(fetch_stub).toHaveBeenCalledTimes(2);
});

test("cli_defaults_use_process_env_stdio_and_filesystem", async () => {
  const f = await fixture();
  const out: string[] = [];
  const err: string[] = [];
  const stdout = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      out.push(String(chunk));
      return true;
    });
  const stderr = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown) => {
      err.push(String(chunk));
      return true;
    });
  vi.stubEnv("VITTAZ_DB_PATH", f.db);
  const fetch_stub = vi.fn(async () => new Response("", { status: 400 }));
  vi.stubGlobal("fetch", fetch_stub);
  try {
    expect(await runCli(["--version"])).toBe(0);
    expect(out.at(-1)).toContain('"version"');
    expect(await runCli(["nope"])).toBe(1);
    expect(err.at(-1)).toContain("invalid_arguments");
    expect(
      await runCli(["add", "--amount_paise", "100", "--direction", "debit"]),
    ).toBe(0);
    const backupPath = join(f.dir, "default-backup.json");
    expect(await runCli(["backup", backupPath])).toBe(0);
    expect(
      await runCli(["restore", backupPath], {
        env: { VITTAZ_DB_PATH: join(f.dir, "default-restore.db") },
      }),
    ).toBe(0);
    vi.stubEnv("VITTAZ_AI_BASE_URL", "https://example.invalid");
    vi.stubEnv("VITTAZ_AI_API_KEY", "synthetic-key");
    vi.stubEnv("VITTAZ_AI_MODEL", "synthetic-model");
    expect(await runCli(["ask", "hello"])).toBe(0);
    expect(JSON.parse(out.at(-1)!).status).toBe("unavailable");
    expect(fetch_stub).toHaveBeenCalledTimes(1);
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

test("cli_non_error_failures_do_not_echo_raw_values", async () => {
  const f = await fixture();
  expect(
    await f.run(["backup", "out.json"], {
      write_file: async () => {
        throw "private_raw_failure";
      },
    }),
  ).toBe(1);
  expect(f.json()).toEqual({ ok: false, error_code: "internal_error" });
  expect(f.out.at(-1)).not.toContain("private_raw_failure");
});
