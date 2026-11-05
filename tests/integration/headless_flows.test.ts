import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import * as XLSX from "xlsx";
import {
  PrivacyRedactor,
  createProposal,
  type LocalModelRunner,
} from "@vittaz/core";
import { openLedgerStore } from "@vittaz/storage";
import {
  SharedAssistantService,
  ValidatedLocalModelTasks,
  type QuestionAnsweringAgent,
} from "@vittaz/agent";
import { runCli, type CliDeps } from "../../apps/cli/src/cli.js";

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "vittaz-headless-"));
  dirs.push(dir);
  const db = join(dir, "ledger.db");
  const out: string[] = [];
  const env = { VITTAZ_DB_PATH: db };
  const run = (argv: string[], deps: CliDeps = {}) =>
    runCli(argv, {
      env,
      stdout: (line) => out.push(line),
      stderr: () => undefined,
      ...deps,
    });
  const json = () => JSON.parse(out.at(-1) ?? "null");
  return { dir, db, out, env, run, json };
}
const unexpectedQa: QuestionAnsweringAgent = {
  answerQuestion: async () => {
    throw new Error("unexpected_qa_in_local_flow");
  },
};
function localAssistant(
  runner: LocalModelRunner,
): CliDeps["assistant_factory"] {
  return async (store) =>
    new SharedAssistantService({
      ledger: store,
      history: store.history,
      preferences: store.preferences,
      rules: store.rules,
      qa: unexpectedQa,
      local: new ValidatedLocalModelTasks(runner),
      redactor: new PrivacyRedactor(),
    });
}
const splitRunner: LocalModelRunner = {
  run: async (task) => {
    if (task === "parse_entry")
      return {
        draft: {
          amount_paise: 5000,
          direction: "debit",
          category: "food",
          counterparty_name: "SynthPerson",
          note: "synthetic split draft",
          split_owed_paise: 2500,
        },
      };
    if (task === "improve_note")
      return { improved_note: "Synthetic improved note" };
    throw new Error("unexpected_local_task");
  },
};
function book(rows: unknown[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Synthetic");
  return new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}
async function snapshot(db: string) {
  const store = openLedgerStore(db);
  try {
    return await store.read(async (repos) => ({
      wallets: await repos.wallets.list(),
      transactions: await repos.transactions.list(),
      proposals: await repos.proposals.list(),
      audit: await repos.audit.list(),
    }));
  } finally {
    await store.close();
  }
}

test("headless_flow_1_manual_entry_updates_ledger_balance_and_audit", async () => {
  const f = await fixture();
  expect(
    await f.run([
      "add",
      "--amount_paise",
      "1000",
      "--direction",
      "credit",
      "--category",
      "income",
      "--note",
      "synthetic opening",
    ]),
  ).toBe(0);
  expect(f.json().transaction.status).toBe("user_confirmed");
  expect(
    await f.run([
      "add",
      "--amount_paise",
      "250",
      "--direction",
      "debit",
      "--category",
      "food",
      "--counterparty_name",
      "SynthPerson",
    ]),
  ).toBe(0);
  const auditId = f.json().audit_id;
  expect(await f.run(["balance"])).toBe(0);
  expect(f.json().balance_paise).toBe(750);
  expect(await f.run(["ledger"])).toBe(0);
  expect(f.json().transactions).toHaveLength(2);
  const store = openLedgerStore(f.db);
  try {
    const audit = await store.read((repos) => repos.audit.list());
    expect(audit.map((row) => row.id)).toContain(auditId);
    expect(audit.every((row) => row.undone === 0)).toBe(true);
  } finally {
    await store.close();
  }
});

test("headless_flow_2_split_draft_creates_pending_proposal_only", async () => {
  const f = await fixture();
  expect(
    await f.run(
      [
        "ask",
        "split 50 debit food",
        "--action",
        "draft_entry",
        "--request_id",
        "flow2",
        "--conversation_id",
        "flow2",
      ],
      { assistant_factory: localAssistant(splitRunner) },
    ),
  ).toBe(0);
  expect(f.json().status).toBe("pending_proposal");
  const proposalId = f.json().proposal_id;
  expect(await f.run(["inbox", "list"])).toBe(0);
  expect(f.json().proposals).toHaveLength(1);
  expect(f.json().proposals[0]).toMatchObject({
    id: proposalId,
    status: "pending",
    amount_paise: 5000,
    split_owed_paise: 2500,
    committed_tx_id: null,
  });
  expect(await f.run(["ledger"])).toBe(0);
  expect(f.json().transactions).toHaveLength(0);
  expect(await f.run(["balance", "bank_default"])).toBe(0);
  expect(f.json().balance_paise).toBe(0);
});

test("headless_flow_3_approve_commits_once_and_is_idempotent", async () => {
  const f = await fixture();
  await f.run(
    [
      "ask",
      "split 50 debit food",
      "--action",
      "draft_entry",
      "--request_id",
      "flow3",
      "--conversation_id",
      "flow3",
    ],
    { assistant_factory: localAssistant(splitRunner) },
  );
  const proposalId = f.json().proposal_id;
  expect(await f.run(["inbox", "approve", proposalId])).toBe(0);
  expect(f.json().approved[0]).toMatchObject({
    proposal_id: proposalId,
    already_approved: false,
  });
  const txId = f.json().approved[0].transaction_id;
  expect(await f.run(["inbox", "approve", proposalId])).toBe(0);
  expect(f.json().approved[0]).toMatchObject({
    proposal_id: proposalId,
    already_approved: true,
    transaction_id: txId,
  });
  expect(await f.run(["ledger"])).toBe(0);
  expect(f.json().transactions).toHaveLength(1);
  expect(f.json().transactions[0]).toMatchObject({
    id: txId,
    status: "ai_checked",
    split_owed_paise: 2500,
  });
  expect(await f.run(["inbox", "list", "--status", "approved"])).toBe(0);
  expect(f.json().proposals[0].committed_tx_id).toBe(txId);
});

test("headless_flow_4_improve_note_suggests_without_mutating_ledger", async () => {
  const f = await fixture();
  await f.run([
    "add",
    "--amount_paise",
    "100",
    "--direction",
    "debit",
    "--note",
    "synthetic original note",
  ]);
  const txId = f.json().transaction.id;
  expect(
    await f.run(
      [
        "ask",
        "synthetic original note",
        "--action",
        "improve_note",
        "--request_id",
        "flow4",
        "--conversation_id",
        "flow4",
      ],
      { assistant_factory: localAssistant(splitRunner) },
    ),
  ).toBe(0);
  expect(f.json()).toMatchObject({
    status: "note_suggestion",
    text: "Synthetic improved note",
    proposal_id: null,
  });
  expect(await f.run(["ledger"])).toBe(0);
  expect(f.json().transactions[0]).toMatchObject({
    id: txId,
    note: "synthetic original note",
  });
  const store = openLedgerStore(f.db);
  try {
    const messages = await store.history.listMessages("flow4", 10);
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(messages.every((message) => message.source === "cli")).toBe(true);
    expect(messages[1]?.content).toBe("Synthetic improved note");
  } finally {
    await store.close();
  }
});

test("headless_flow_5_reject_commits_nothing_and_blocks_later_approval", async () => {
  const f = await fixture();
  await f.run(
    [
      "ask",
      "split 50 debit food",
      "--action",
      "draft_entry",
      "--request_id",
      "flow5",
      "--conversation_id",
      "flow5",
    ],
    { assistant_factory: localAssistant(splitRunner) },
  );
  const proposalId = f.json().proposal_id;
  expect(await f.run(["inbox", "reject", proposalId])).toBe(0);
  expect(f.json().proposal.status).toBe("rejected");
  expect(await f.run(["ledger"])).toBe(0);
  expect(f.json().transactions).toHaveLength(0);
  expect(await f.run(["inbox", "approve", proposalId])).toBe(1);
  expect(f.json().error_code).toBe("proposal_rejected");
  expect(await f.run(["ledger"])).toBe(0);
  expect(f.json().transactions).toHaveLength(0);
});

test("headless_flow_6_undo_restores_previous_state_and_rejects_replay", async () => {
  const f = await fixture();
  await f.run(["add", "--amount_paise", "100", "--direction", "debit"]);
  const auditId = f.json().audit_id;
  expect(await f.run(["undo", auditId])).toBe(0);
  expect(f.json()).toMatchObject({
    undone_audit_id: auditId,
    restored_state: null,
  });
  expect(await f.run(["ledger"])).toBe(0);
  expect(f.json().transactions).toHaveLength(0);
  expect(await f.run(["balance"])).toBe(0);
  expect(f.json().balance_paise).toBe(0);
  expect(await f.run(["undo", auditId])).toBe(1);
  expect(f.json().error_code).toBe("already_undone");
});

test("headless_flow_7_batch_approve_is_atomic_and_idempotent", async () => {
  const f = await fixture();
  const store = openLedgerStore(f.db);
  const ids: string[] = [];
  try {
    for (const amountPaise of [100, 200, 300])
      ids.push(
        (await createProposal(store, { amountPaise, direction: "debit" })).id,
      );
  } finally {
    await store.close();
  }
  expect(await f.run(["inbox", "approve", ids[0]!, "missing_proposal"])).toBe(
    1,
  );
  expect(f.json().error_code).toBe("proposal_not_found");
  expect(await f.run(["ledger"])).toBe(0);
  expect(f.json().transactions).toHaveLength(0);
  expect(await f.run(["inbox", "approve", ...ids])).toBe(0);
  expect(f.json().approved).toHaveLength(3);
  expect(
    f
      .json()
      .approved.every(
        (row: { already_approved: boolean }) => row.already_approved === false,
      ),
  ).toBe(true);
  expect(await f.run(["ledger"])).toBe(0);
  expect(f.json().transactions).toHaveLength(3);
  expect(await f.run(["inbox", "approve", ...ids])).toBe(0);
  expect(
    f
      .json()
      .approved.every(
        (row: { already_approved: boolean }) => row.already_approved === true,
      ),
  ).toBe(true);
  expect(await f.run(["ledger"])).toBe(0);
  expect(f.json().transactions).toHaveLength(3);
});

test("headless_flow_8_export_import_restores_ledger_and_reimports_safely", async () => {
  const f = await fixture();
  await f.run([
    "add",
    "--amount_paise",
    "1000",
    "--direction",
    "credit",
    "--counterparty_name",
    "SynthPerson",
    "--note",
    "synthetic export",
  ]);
  const backupPath = join(f.dir, "ledger-backup.json");
  expect(await f.run(["backup", backupPath])).toBe(0);
  expect(f.json().privacy_warning).toContain("WARNING");
  expect((await stat(backupPath)).mode & 0o777).toBe(0o600);
  const restoredDb = join(f.dir, "restored.db");
  expect(
    await f.run(["restore", backupPath], {
      env: { VITTAZ_DB_PATH: restoredDb },
    }),
  ).toBe(0);
  expect(await snapshot(restoredDb)).toEqual(await snapshot(f.db));
  const xlsxPath = join(f.dir, "synthetic.xlsx");
  await writeFile(
    xlsxPath,
    book([
      ["Date", "Description", "Amount", "Direction"],
      ["2026-11-01", "SynthGrocer", "10.50", "Debit"],
    ]),
  );
  expect(
    await f.run(["import", xlsxPath, "--dry_run"], {
      env: { VITTAZ_DB_PATH: restoredDb },
    }),
  ).toBe(0);
  expect(f.json()).toMatchObject({
    dry_run: true,
    imported_count: 0,
    valid_rows: 1,
  });
  expect((await snapshot(restoredDb)).transactions).toHaveLength(1);
  expect(
    await f.run(["import", xlsxPath], { env: { VITTAZ_DB_PATH: restoredDb } }),
  ).toBe(0);
  expect(f.json().imported_count).toBe(1);
  expect(
    await f.run(["import", xlsxPath], { env: { VITTAZ_DB_PATH: restoredDb } }),
  ).toBe(0);
  expect(f.json()).toMatchObject({ imported_count: 0, skipped_duplicates: 1 });
  expect((await snapshot(restoredDb)).transactions).toHaveLength(2);
});
