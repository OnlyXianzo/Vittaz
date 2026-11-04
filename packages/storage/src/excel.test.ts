import { afterEach, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { importExcelBuffer } from "./excel.js";
import { importExcelRows } from "../../core/src/importers/excelImporter.js";
import { openLedgerStore } from "./repositories.js";
import { createWallet } from "../../core/src/ledger/wallet.js";
import type { LedgerStore } from "@vittaz/core";
const stores: ReturnType<typeof openLedgerStore>[] = [];
function open() {
  const s = openLedgerStore(":memory:");
  stores.push(s);
  return s;
}
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
});
function book(rows: unknown[][], date1904 = false) {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { WBProps: { date1904 } };
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Synthetic");
  return new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}
const headers = [
  "Date",
  "Description",
  "Amount",
  "Direction",
  "Category",
  "Benefit",
  "Tag",
  "Note",
  "ExtraTempCol",
];
const rows = [
  headers,
  [
    "2026-11-01",
    "SynthGrocer",
    "640.50",
    "Expense",
    "Groceries",
    "Family",
    "weekly, essentials",
    "Synthetic pantry",
    "ignored",
  ],
  [
    "02/11/2026",
    "SynthMetro",
    "45",
    "Debit",
    "Transport",
    "Reimbursable",
    "commute",
    "",
    "ignored",
  ],
  ["32/13/2026", "BadDateRow", "100"],
  ["2026-11-03", "BlankAmountRow", ""],
];

test("baseline_3_6_excel_dry_run_replay_benefit_tags_and_per_row_errors", async () => {
  const store = open();
  const buffer = book(rows);
  const dry = await importExcelBuffer(store, buffer, { dryRun: true });
  expect(dry).toMatchObject({
    dryRun: true,
    totalRows: 4,
    validRows: 2,
    importedCount: 0,
    skippedDuplicates: 0,
    extraColumns: ["ExtraTempCol"],
  });
  expect(dry.errors.map((e) => e.rowNumber)).toEqual([4, 5]);
  expect(await store.read((r) => r.transactions.list())).toHaveLength(0);
  expect(await store.read((r) => r.audit.list())).toHaveLength(0);
  expect((await importExcelBuffer(store, buffer)).importedCount).toBe(2);
  const txs = (await store.read((r) => r.transactions.list())).sort((a, b) =>
    a.occurred_at.localeCompare(b.occurred_at),
  );
  expect(txs[0]).toMatchObject({
    amount_paise: 64050,
    benefit: "family",
    benefit_paise: 0,
    tag: "weekly",
    tags_json: '["weekly","essentials"]',
    status: "unverified",
    source: "excel_import",
  });
  expect(txs[1]).toMatchObject({
    amount_paise: 4500,
    benefit: "reimbursable",
    tags_json: '["commute"]',
  });
  expect(await importExcelBuffer(store, buffer)).toMatchObject({
    importedCount: 0,
    skippedDuplicates: 2,
  });
  expect(await store.read((r) => r.audit.list())).toHaveLength(2);
});

test("excel_duplicates_preserve_occurrence_count_and_wallet_scope_under_concurrent_replay", async () => {
  const store = open();
  const duplicate = ["2026-11-01", "12.50"];
  const buffer = book([["Date", "Amount"], duplicate, duplicate]);
  const result = await Promise.all([
    importExcelBuffer(store, buffer),
    importExcelBuffer(store, buffer),
  ]);
  expect(result.map((r) => r.importedCount).sort()).toEqual([0, 2]);
  const wallet = await createWallet(store, {
    name: "SyntheticOther",
    kind: "bank",
  });
  expect(
    (await importExcelBuffer(store, buffer, { walletId: wallet.id }))
      .importedCount,
  ).toBe(2);
  expect(await store.read((r) => r.transactions.list())).toHaveLength(4);
});

test("excel_numeric_values_strict_dates_both_epoch_systems_and_benefit_paise", async () => {
  const store = open();
  const data = [
    ["Date", "Amount", "Type", "BenefitPaise", "Tags", "Wallet"],
    [46327, 12.5, "income", "50", "Family; Split| Travel", "bank_default"],
    [60, 1],
    [0, 1],
    [46327.5, 1],
    ["0000-1-1", 1],
    ["2026/2/29", 1],
    ["29-02-2024", "०.१०", "kharch", 0],
    ["bad_private_date", 1],
    ["2026-13-01", 1],
    ["31/4/2026", 1],
    [3000000, 1],
  ];
  const out = await importExcelBuffer(store, book(data));
  expect(out).toMatchObject({ importedCount: 2, validRows: 2 });
  const txs = await store.read((r) => r.transactions.list());
  expect(txs.find((t) => t.direction === "credit")).toMatchObject({
    amount_paise: 1250,
    benefit_paise: 50,
    occurred_at: "2026-11-01T00:00:00.000Z",
    tag: "family",
  });
  expect(JSON.stringify(out)).not.toContain("bad_private_date");
  expect(
    (
      await importExcelBuffer(
        store,
        book(
          [
            ["Date", "Amount"],
            [0, 1],
          ],
          true,
        ),
      )
    ).importedCount,
  ).toBe(1);
});

test("privacy_excel_rejects_sensitive_formulas_bad_money_and_invalid_fields_without_echo", async () => {
  const store = open();
  const invalid = [0, -1, "", "0.001", 1.234, "90071992547409.92", true];
  const data: unknown[][] = [
    ["Date", "Amount", "Direction", "Benefit_paise", "Note", "Wallet"],
  ];
  for (const amount of invalid) data.push(["2026-11-01", amount]);
  data.push(
    ["2026-11-01", 12, "private_invalid_direction"],
    ["2026-11-01", 12, "debit", -1],
    ["2026-11-01", 12, "debit", "1.5"],
    ["2026-11-01", 12, "debit", 0, "OTP 123456"],
    ["2026-11-01", 12, "debit", 0, "", "wrong_wallet"],
    ["2026-11-01", { t: "n", v: 999, f: "1+1" }],
    ["2026-11-01", 12, "debit", 0, "x".repeat(4097)],
    ["2026-11-01", 12, "debit", "9007199254740992"],
  );
  const result = await importExcelBuffer(store, book(data));
  expect(result.validRows).toBe(0);
  expect(result.errors).toHaveLength(data.length - 1);
  expect(JSON.stringify(result)).not.toMatch(
    /private_invalid_direction|123456|wrong_wallet/,
  );
  expect(await store.read((r) => r.transactions.list())).toHaveLength(0);
});

test("excel_dry_run_never_touches_store_and_errors_preserve_physical_rows", async () => {
  const broken: LedgerStore = {
    read: async () => {
      throw new Error("must_not_read");
    },
    transaction: async () => {
      throw new Error("must_not_write");
    },
    close: async () => {},
  };
  const out = await importExcelBuffer(
    broken,
    book([["Date", "Amount"], ["2026-11-01", 1], [], ["bad", 1]]),
    { dryRun: true },
  );
  expect(out.errors[0]!.rowNumber).toBe(4);
  expect(out.totalRows).toBe(2);
});

test("excel_header_empty_workbook_and_bounded_invalid_container_cases", async () => {
  const store = open();
  for (const data of [
    [
      ["Date", "Amount", "Type", "Direction"],
      ["2026-11-01", 1],
    ],
    [["Amount"], [1]],
  ])
    await expect(importExcelBuffer(store, book(data))).rejects.toThrow(
      "Invalid spreadsheet headers",
    );
  for (const bytes of [
    new Uint8Array(),
    new Uint8Array(1048577),
    new TextEncoder().encode("private_invalid_file"),
    new Uint8Array([80, 75, 3, 4, 0, 0]),
  ])
    await expect(importExcelBuffer(store, bytes)).rejects.toThrow(
      "Invalid spreadsheet",
    );
  expect((await importExcelBuffer(store, book([]))).totalRows).toBe(0);
  expect(
    (await importExcelBuffer(store, book([["Date", "Amount"]]))).totalRows,
  ).toBe(0);
  expect(
    (
      await importExcelBuffer(
        store,
        book([
          ["Date", "Amount", "__proto__"],
          ["2026-11-01", 1, "ignored"],
        ]),
      )
    ).extraColumns,
  ).toEqual(["__proto__"]);
});

test("excel_audit_failure_rolls_back_all_valid_rows_and_missing_wallet_is_not_row_error", async () => {
  const store = open();
  let inserted = 0;
  const failing: LedgerStore = {
    close: () => store.close(),
    read: (work) => store.read(work),
    transaction: (work) =>
      store.transaction((r) =>
        work({
          ...r,
          audit: {
            ...r.audit,
            insert: async (row) => {
              if (++inserted === 2)
                throw new Error("synthetic_import_audit_failure");
              await r.audit.insert(row);
            },
          },
        }),
      ),
  };
  await expect(importExcelBuffer(failing, book(rows))).rejects.toThrow(
    "synthetic_import_audit_failure",
  );
  expect(await store.read((r) => r.transactions.list())).toHaveLength(0);
  expect(await store.read((r) => r.audit.list())).toHaveLength(0);
  await expect(
    importExcelBuffer(store, book(rows), {
      walletId: "missing_synthetic_wallet",
    }),
  ).rejects.toThrow();
});

test("excel_core_refuses_object_coercion_unknown_cell_types_and_invalid_grids", async () => {
  const store = open();
  const evil = {
    toString() {
      throw new Error("private_coercion");
    },
  };
  for (const [headers, values] of [
    [
      ["Date", "Amount"],
      [evil, 12],
    ],
    [
      ["Date", "Amount"],
      ["2026-11-01", evil],
    ],
    [
      ["Date", "Amount", "Note"],
      ["2026-11-01", 1, evil],
    ],
    [
      ["Date", "Amount", "Tag"],
      ["2026-11-01", 1, Array(34).fill("synthetic").join(",")],
    ],
  ] as const) {
    const out = await importExcelRows(store, {
      headers: [...headers],
      rows: [{ rowNumber: 2, values: [...values] }],
      date1904: false,
    });
    expect(out.errors).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain("private_coercion");
  }
});

test("excel_core_bounds_headers_options_and_unreadable_cells_fail_statically", async () => {
  const store = open();
  const base = { headers: ["Date", "Amount"], rows: [], date1904: false };
  for (const walletId of ["", "   "])
    await expect(importExcelRows(store, base, { walletId })).rejects.toThrow(
      "Invalid import options",
    );
  for (const headers of [
    [1, "Amount"],
    ["Date", "x".repeat(129)],
    Array(65).fill("extra"),
  ])
    await expect(
      importExcelRows(store, { ...base, headers }),
    ).rejects.toThrow();
  await expect(
    importExcelRows(store, {
      ...base,
      rows: Array(10001).fill({ rowNumber: 2, values: [] }),
    }),
  ).rejects.toThrow("Spreadsheet limits exceeded");
  const values: unknown[] = [];
  Object.defineProperty(values, 0, {
    get() {
      throw new Error("private_synthetic_cell_getter");
    },
  });
  expect(
    (
      await importExcelRows(store, {
        ...base,
        rows: [{ rowNumber: 2, values }],
      })
    ).errors,
  ).toEqual([{ rowNumber: 2, message: "Invalid row" }]);
  expect(
    (
      await importExcelBuffer(
        store,
        book([
          ["Date", "Amount"],
          ["2026-01-00", 1],
        ]),
      )
    ).errors,
  ).toHaveLength(1);
});

test("excel_adapter_rejects_oversized_sheets_and_formula_headers", async () => {
  const store = open();
  for (const data of [
    [Array(65).fill("column")],
    [[{ t: "s", v: "Date", f: '"Date"' }, "Amount"]],
    [["Date", "Amount"], ...Array(10001).fill(["2026-11-01", 1])],
  ])
    await expect(importExcelBuffer(store, book(data))).rejects.toThrow(
      "Invalid spreadsheet",
    );
});

test("excel_1900_serial_before_false_leap_day_is_exact", async () => {
  const store = open();
  await importExcelBuffer(
    store,
    book([
      ["Date", "Amount"],
      [59, 1],
    ]),
  );
  expect((await store.read((r) => r.transactions.list()))[0]!.occurred_at).toBe(
    "1900-02-28T00:00:00.000Z",
  );
});

test("excel_compressed_xlsx_roundtrip_and_formula_error_cells_never_execute", async () => {
  const store = open();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Date", "Amount"],
      ["2026-11-01", 12.5],
      ["2026-11-01", { t: "e", v: 7 }],
    ]),
    "Synthetic",
  );
  const compressed = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
  });
  expect(await importExcelBuffer(store, compressed)).toMatchObject({
    totalRows: 2,
    importedCount: 1,
    errors: [{ rowNumber: 3, message: "Formula or error cell not accepted" }],
  });
});
