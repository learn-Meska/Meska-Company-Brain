import "server-only";
import ExcelJS from "exceljs";
import { B2C_COLUMNS, B2C_SHEET, type Cell } from "./b2c";

// Reads the uploaded workbook into rows of raw cells (A..M) from the "B2C Sessions" sheet
// (or the first sheet when it was renamed). Returns null when the file isn't a readable .xlsx.
export async function readB2CWorkbook(data: ArrayBuffer): Promise<Cell[][] | null> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    return null;
  }
  const ws = wb.getWorksheet(B2C_SHEET) ?? wb.worksheets[0];
  if (!ws) return null;
  const out: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    // row.values is 1-based; keep one extra column so a stray column after M is noticed in the header
    const values = (row.values as Cell[]).slice(1, B2C_COLUMNS.length + 2);
    out[n - 1] = values;
  });
  return Array.from(out, (r) => r ?? []);
}

// An empty copy of the template (header, formats, the Weekday formula's place) to download from /admin/b2c.
export async function b2cTemplate(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(B2C_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { key: "program", width: 26 },
    { key: "cohort", width: 12 },
    { key: "format", width: 10 },
    { key: "day", width: 7 },
    { key: "session", width: 22 },
    { key: "date", width: 16, style: { numFmt: "ddd d mmm yyyy" } },
    { key: "weekday", width: 12 },
    { key: "start", width: 10, style: { numFmt: "h:mm AM/PM" } },
    { key: "end", width: 10, style: { numFmt: "h:mm AM/PM" } },
    { key: "location", width: 24 },
    { key: "trainer", width: 22 },
    { key: "status", width: 16 },
    { key: "delivered", width: 10 },
  ];
  const head = ws.addRow([...B2C_COLUMNS]);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1F4B" } };
  const list = (cells: string, values: string[]) => {
    for (let r = 2; r <= 500; r++) ws.getCell(`${cells}${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${values.join(",")}"`] };
  };
  list("C", ["Online", "Offline"]);
  list("L", ["Confirmed", "Awaiting trainer", "Needs trainer", "Cancelled"]);
  list("M", ["Yes", "No"]);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
