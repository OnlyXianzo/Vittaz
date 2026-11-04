import { getDaysInMonth } from "../ledger/allowance.js";
import {
  assertNonNegativePaise,
  assertPositivePaise,
  parseRupeesToPaise,
} from "../ledger/money.js";
import {
  defaultLedgerRuntime,
  insertCapturedTransactionInUnit,
} from "../ledger/ledger.js";
import type {
  AutoCapturedTransactionInput,
  LedgerRuntime,
} from "../ledger/ledger.js";
import type {
  LedgerStore,
  TransactionDirection,
} from "../ledger/repositories.js";
import { checkSensitiveMessage } from "../privacy/sensitiveFilter.js";
export interface ExcelRowError {
  rowNumber: number;
  message: string;
}
export interface ExcelImportResult {
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  importedCount: number;
  skippedDuplicates: number;
  extraColumns: string[];
  errors: ExcelRowError[];
}
export interface ExcelGrid {
  headers: unknown[];
  rows: { rowNumber: number; values: unknown[]; invalid?: boolean }[];
  date1904: boolean;
}
export interface ExcelImportOptions {
  dryRun?: boolean;
  walletId?: string;
}
const columns = new Map(
  Object.entries({
    date: "date",
    amount: "amount",
    direction: "direction",
    type: "direction",
    description: "counterparty",
    counterparty: "counterparty",
    payee: "counterparty",
    category: "category",
    benefit: "benefit",
    benefitpaise: "benefit_paise",
    benefit_paise: "benefit_paise",
    "benefit paise": "benefit_paise",
    tag: "tag",
    tags: "tag",
    note: "note",
    notes: "note",
    wallet: "wallet",
  }),
);
class RowError extends Error {}
function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > 4096)
    throw new RowError("Invalid text cell");
  return value.normalize("NFKC").trim();
}
function date(value: unknown, date1904: boolean): string {
  try {
    if (typeof value === "number") {
      if (
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > 3000000 ||
        (!date1904 && (value === 0 || value === 60))
      )
        throw new Error();
      const days = date1904 ? value : value - (value > 60 ? 1 : 0);
      const d = new Date(
        Date.parse(date1904 ? "1904-01-01T00:00:00Z" : "1899-12-31T00:00:00Z") +
          days * 86400000,
      );
      if (d.getUTCFullYear() > 9999) throw new Error();
      return d.toISOString();
    }
    const str = text(value);
    const ymd = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(str);
    const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(str);
    if (!ymd && !dmy) throw new Error();
    const [year, month, day] = ymd
      ? [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])]
      : [Number(dmy![3]), Number(dmy![2]), Number(dmy![1])];
    if (day < 1 || day > getDaysInMonth(year, month)) throw new Error();
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00.000Z`;
  } catch {
    throw new RowError("Invalid date");
  }
}
function amount(value: unknown): number {
  try {
    return assertPositivePaise(
      parseRupeesToPaise(
        typeof value === "number" ? String(value) : text(value),
      ),
    );
  } catch {
    throw new RowError("Invalid amount");
  }
}
function benefitAmount(value: unknown): number {
  try {
    if (typeof value === "number") return assertNonNegativePaise(value);
    const str = text(value);
    if (!str) return 0;
    if (!/^\d+$/.test(str)) throw new Error();
    return assertNonNegativePaise(Number(BigInt(str)));
  } catch {
    throw new RowError("Invalid benefit_paise");
  }
}
function direction(value: unknown): TransactionDirection {
  const str = text(value).toLowerCase();
  if (["", "debit", "expense", "out", "paid", "dr", "kharch"].includes(str))
    return "debit";
  if (["credit", "income", "in", "received", "cr", "aamdani"].includes(str))
    return "credit";
  throw new RowError("Invalid direction");
}
async function fingerprint(signature: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(signature)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
/** Primitive grid port. No workbook/native dependencies, no AI or logging capability. */
export async function importExcelRows(
  store: LedgerStore,
  grid: ExcelGrid,
  options: ExcelImportOptions = {},
  runtime: LedgerRuntime = defaultLedgerRuntime,
): Promise<ExcelImportResult> {
  const { dryRun = false, walletId = "bank_default" } = options;
  if (
    typeof dryRun !== "boolean" ||
    typeof walletId !== "string" ||
    !walletId.trim()
  )
    throw new Error("Invalid import options");
  const result: ExcelImportResult = {
    dryRun,
    totalRows: grid.rows.length,
    validRows: 0,
    importedCount: 0,
    skippedDuplicates: 0,
    extraColumns: [],
    errors: [],
  };
  if (grid.headers.length === 0 && grid.rows.length === 0) return result;
  if (grid.headers.length > 64 || grid.rows.length > 10000)
    throw new Error("Spreadsheet limits exceeded");
  const seen = new Set<string>();
  const mappedHeaders = grid.headers.map((raw) => {
    if (typeof raw !== "string" || raw.length > 128)
      throw new Error("Invalid spreadsheet headers");
    const name = columns.get(raw.trim().toLowerCase());
    if (name) {
      if (seen.has(name)) throw new Error("Invalid spreadsheet headers");
      seen.add(name);
    } else result.extraColumns.push(raw);
    return name;
  });
  if (!seen.has("date") || !seen.has("amount"))
    throw new Error("Invalid spreadsheet headers");
  const parsed: AutoCapturedTransactionInput[] = [];
  const occurrences = new Map<string, number>();
  for (const row of grid.rows) {
    let input: AutoCapturedTransactionInput;
    try {
      if (row.invalid) throw new RowError("Formula or error cell not accepted");
      const mapped = new Map(
        mappedHeaders.flatMap((name, idx) =>
          name ? [[name, row.values[idx]] as const] : [],
        ),
      );
      if (
        [...mapped.values()].some(
          (value) =>
            typeof value === "string" &&
            value.trim() !== "" &&
            checkSensitiveMessage(value).sensitive,
        )
      )
        throw new RowError("Sensitive row rejected");
      const selectedWallet = text(mapped.get("wallet"));
      if (selectedWallet && selectedWallet !== walletId)
        throw new RowError("Wallet column conflicts with selected wallet");
      const tags = text(mapped.get("tag"))
        .toLowerCase()
        .split(/[,;|]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
      if (tags.length > 32) throw new RowError("Too many tags");
      input = {
        walletId,
        occurredAt: date(mapped.get("date"), grid.date1904),
        amountPaise: amount(mapped.get("amount")),
        direction: direction(mapped.get("direction")),
        eventType: "normal",
        category: text(mapped.get("category")).toLowerCase() || "uncategorized",
        counterpartyName: text(mapped.get("counterparty")) || null,
        note: text(mapped.get("note")) || null,
        source: "excel_import",
        benefit: text(mapped.get("benefit")).toLowerCase() || "self",
        benefitPaise: benefitAmount(mapped.get("benefit_paise")),
        tags,
        tag: tags[0] ?? null,
      };
    } catch (error) {
      result.errors.push({
        rowNumber: row.rowNumber,
        message: error instanceof RowError ? error.message : "Invalid row",
      });
      continue;
    }
    const signature = JSON.stringify([1, input]);
    const occurrence = (occurrences.get(signature) ?? 0) + 1;
    occurrences.set(signature, occurrence);
    parsed.push({
      ...input,
      importFingerprint: await fingerprint(`${signature}#${occurrence}`),
    });
  }
  result.validRows = parsed.length;
  if (dryRun) return result;
  await store.transaction(async (repos) => {
    const existing = new Set(
      (await repos.transactions.list()).map((row) => row.import_fingerprint),
    );
    for (const input of parsed) {
      if (existing.has(input.importFingerprint!)) {
        result.skippedDuplicates++;
        continue;
      }
      await insertCapturedTransactionInUnit(repos, input, runtime);
      existing.add(input.importFingerprint!);
      result.importedCount++;
    }
  });
  return result;
}
