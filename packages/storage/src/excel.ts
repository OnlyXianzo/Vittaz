import { validateWorkbookZip } from "./excel_zip.js";
import * as XLSX from "xlsx";
import { importExcelRows } from "@vittaz/core";
import type {
  ExcelGrid,
  ExcelImportOptions,
  ExcelImportResult,
  LedgerRuntime,
  LedgerStore,
} from "@vittaz/core";

/** First-sheet XLSX decoding stays outside framework-free core. No formulas execute. */
export async function importExcelBuffer(
  store: LedgerStore,
  buffer: Uint8Array,
  options?: ExcelImportOptions,
  runtime?: LedgerRuntime,
): Promise<ExcelImportResult> {
  let grid: ExcelGrid;
  try {
    if (
      !(buffer instanceof Uint8Array) ||
      buffer.byteLength < 4 ||
      buffer.byteLength > 1048576 ||
      buffer[0] !== 80 ||
      buffer[1] !== 75 ||
      buffer[2] !== 3 ||
      buffer[3] !== 4
    )
      throw new Error();
    const snapshot = Buffer.from(buffer);
    validateWorkbookZip(snapshot);
    const workbook = XLSX.read(snapshot, {
      type: "array",
      sheets: 0,
      sheetRows: 10002,
      cellDates: false,
      cellFormula: true,
      cellHTML: false,
      cellText: false,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]!];
    grid = {
      headers: [],
      rows: [],
      date1904: !!workbook.Workbook?.WBProps?.date1904,
    };
    if (sheet["!ref"]) {
      const range = XLSX.utils.decode_range(sheet["!fullref"] ?? sheet["!ref"]);
      if (range.e.r - range.s.r > 10000 || range.e.c - range.s.c >= 64)
        throw new Error();
      for (let r = range.s.r; r <= range.e.r; r++) {
        const values: unknown[] = [];
        let invalid = false;
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = sheet[XLSX.utils.encode_cell({ r, c })] as
            XLSX.CellObject | undefined;
          values.push(cell?.v ?? "");
          if (cell?.f !== undefined || cell?.t === "e") invalid = true;
        }
        if (r === range.s.r) {
          if (invalid) throw new Error();
          grid.headers = values;
        } else if (values.some((value) => value !== "") || invalid)
          grid.rows.push({ rowNumber: r + 1, values, invalid });
      }
    }
  } catch {
    throw new Error("Invalid spreadsheet");
  }
  return importExcelRows(store, grid, options, runtime);
}
