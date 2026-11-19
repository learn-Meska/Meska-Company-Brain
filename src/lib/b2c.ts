// B2C sessions: public cohorts (diplomas, programs) that Meska runs itself, uploaded by admins from the
// "B2C Sessions" Excel template on /admin/b2c and shown on the calendar as B2C trainings.
// Pure rules (no database) so the template check and every row's validation can be tested.

// The template's columns, in order (sheet "B2C Sessions"). Weekday is a formula from Date and is ignored.
export const B2C_COLUMNS = ["Program", "Cohort", "Format", "Day #", "Session", "Date", "Weekday", "Start", "End", "Location", "Trainer", "Status", "Delivered"] as const;
export const B2C_SHEET = "B2C Sessions";
export const B2C_MAX_ROWS = 2000;

export const B2C_STATUS = {
  confirmed: "Confirmed",
  awaiting_trainer: "Awaiting trainer",
  needs_trainer: "Needs trainer",
  cancelled: "Cancelled",
} as const;
export type B2CStatus = keyof typeof B2C_STATUS;
export const B2C_FORMATS = ["online", "offline"] as const;
export type B2CFormat = (typeof B2C_FORMATS)[number];

export type B2CRow = {
  program: string;
  cohort: string;
  format: B2CFormat;
  day_number: number;
  session: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  location: string | null;
  trainer_name: string | null;
  status: B2CStatus;
  delivered: boolean;
};

// A cell as the Excel reader gives it: text, number, date, a formula ({ result }) or rich text.
export type Cell = unknown;

const pad = (n: number) => String(n).padStart(2, "0");

export function cellText(c: Cell): string {
  if (c == null) return "";
  if (typeof c === "string") return c.replace(/\s+/g, " ").trim();
  if (typeof c === "number" || typeof c === "boolean") return String(c);
  if (c instanceof Date) return c.toISOString();
  if (typeof c === "object") {
    const o = c as { result?: unknown; richText?: { text: string }[]; text?: unknown };
    if (Array.isArray(o.richText)) return cellText(o.richText.map((r) => r.text).join(""));
    if ("result" in o) return cellText(o.result);
    if ("text" in o) return cellText(o.text);
  }
  return "";
}

const unwrap = (c: Cell): Cell => (c && typeof c === "object" && !(c instanceof Date) && "result" in (c as object) ? (c as { result: unknown }).result : c);

const realDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

// Excel dates arrive as Date (midnight UTC), an Excel serial number, or text (2026-11-01, 1/11/2026 is day/month).
export function cellDate(c: Cell): string | null {
  const v = unwrap(c);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return realDate(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return realDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  const s = cellText(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return realDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return realDate(+m[3], +m[2], +m[1]);
  return null;
}

// Excel times arrive as Date on 30 Dec 1899 (UTC), a fraction of a day, or text ("7:00 PM", "19:00").
export function cellTime(c: Cell): string | null {
  const v = unwrap(c);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
  if (typeof v === "number" && v >= 0 && v < 1) {
    const mins = Math.round(v * 24 * 60);
    return mins >= 24 * 60 ? null : `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  }
  const m = cellText(v).match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (/p/i.test(m[3]) ? 12 : 0);
  }
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9#]+/g, "");

// The first row must be the template's header, same columns in the same order.
export function headerProblem(headers: Cell[]): string | null {
  const got = headers.map(cellText);
  while (got.length && !got[got.length - 1]) got.pop();
  const missing = B2C_COLUMNS.filter((c) => !got.some((g) => norm(g) === norm(c)));
  if (missing.length) return `This isn't the B2C Sessions template: the column${missing.length > 1 ? "s" : ""} ${missing.map((c) => `"${c}"`).join(", ")} ${missing.length > 1 ? "are" : "is"} missing.`;
  const wrong = B2C_COLUMNS.findIndex((c, i) => norm(got[i] ?? "") !== norm(c));
  if (wrong >= 0) return `The columns aren't in the template's order: column ${String.fromCharCode(65 + wrong)} should be "${B2C_COLUMNS[wrong]}", not "${got[wrong] ?? ""}".`;
  if (got.length > B2C_COLUMNS.length) return `The template has ${B2C_COLUMNS.length} columns (A to M); remove the extra column "${got[B2C_COLUMNS.length]}".`;
  return null;
}

const statusOf = (s: string): B2CStatus | null => (Object.keys(B2C_STATUS) as B2CStatus[]).find((k) => norm(B2C_STATUS[k]) === norm(s)) ?? (norm(s) === "pending" ? "awaiting_trainer" : null);
// "—", "-" or empty mean no location / no trainer yet
const optional = (s: string) => (/^[-–—\s]*$/.test(s) ? null : s);

export const isBlankRow = (cells: Cell[]) => cells.every((c) => !cellText(c));

// Reads one data row (cells A..M). rowNumber is the Excel row number, for the error message.
export function parseB2CRow(cells: Cell[], rowNumber: number): { row: B2CRow } | { error: string } {
  const at = (i: number) => cellText(cells[i]);
  const problems: string[] = [];
  const program = at(0);
  const cohort = at(1);
  const session = at(4);
  if (!program) problems.push("Program is empty");
  if (!cohort) problems.push("Cohort is empty");
  if (!session) problems.push("Session is empty");
  for (const [label, v] of [["Program", program], ["Cohort", cohort], ["Session", session], ["Location", at(9)], ["Trainer", at(10)]] as const) if (v.length > 200) problems.push(`${label} is over 200 characters`);
  const format = norm(at(2)) as B2CFormat;
  if (!B2C_FORMATS.includes(format)) problems.push(`Format must be Online or Offline, not "${at(2)}"`);
  const day = Number(at(3));
  if (!Number.isInteger(day) || day < 1 || day > 100) problems.push(`Day # must be a whole number from 1 to 100, not "${at(3)}"`);
  const date = cellDate(cells[5]);
  if (!date) problems.push(`Date "${at(5)}" isn't a date`);
  else if (date < "2020-01-01" || date > "2100-12-31") problems.push(`Date ${date} is out of range`);
  const start = cellTime(cells[7]);
  const end = cellTime(cells[8]);
  if (!start) problems.push(`Start "${at(7)}" isn't a time`);
  if (!end) problems.push(`End "${at(8)}" isn't a time`);
  if (start && end && end <= start) problems.push(`End (${end}) must be after Start (${start})`);
  const status = statusOf(at(11));
  if (!status) problems.push(`Status must be ${Object.values(B2C_STATUS).join(", ")}, not "${at(11)}"`);
  const deliveredText = norm(at(12));
  const delivered = deliveredText === "yes";
  if (deliveredText !== "yes" && deliveredText !== "no" && deliveredText !== "") problems.push(`Delivered must be Yes or No, not "${at(12)}"`);
  if (delivered && status && status !== "confirmed") problems.push(`Delivered is Yes, so Status must be Confirmed`);
  if (problems.length) return { error: `Row ${rowNumber}: ${problems.join("; ")}.` };
  return {
    row: {
      program,
      cohort,
      format,
      day_number: day,
      session,
      date: date!,
      start_time: start!,
      end_time: end!,
      location: optional(at(9)),
      trainer_name: optional(at(10)),
      status: status!,
      delivered,
    },
  };
}

// A session is one day of one cohort: Program + Cohort + Day # appears once (re-uploading updates it).
export const sessionKey = (r: Pick<B2CRow, "program" | "cohort" | "day_number">) => `${r.program.toLowerCase()}|${r.cohort.toLowerCase()}|${r.day_number}`;

export type B2CCheck = { rows: B2CRow[]; errors: string[] };

// Checks the whole sheet: header first, then every non-blank row, then repeated sessions.
export function checkB2CSheet(sheet: Cell[][]): B2CCheck {
  if (!sheet.length) return { rows: [], errors: ["The sheet is empty."] };
  const head = headerProblem(sheet[0]);
  if (head) return { rows: [], errors: [head] };
  const rows: B2CRow[] = [];
  const errors: string[] = [];
  const seen = new Map<string, number>();
  sheet.slice(1).forEach((cells, i) => {
    const rowNumber = i + 2;
    if (isBlankRow(cells)) return;
    const r = parseB2CRow(cells, rowNumber);
    if ("error" in r) return void errors.push(r.error);
    const key = sessionKey(r.row);
    if (seen.has(key)) return void errors.push(`Row ${rowNumber}: ${r.row.program} ${r.row.cohort} Day ${r.row.day_number} is already on row ${seen.get(key)}.`);
    seen.set(key, rowNumber);
    rows.push(r.row);
  });
  if (!rows.length && !errors.length) errors.push("The sheet has no sessions under the header.");
  if (rows.length + errors.length > B2C_MAX_ROWS) return { rows: [], errors: [`The sheet has more than ${B2C_MAX_ROWS} rows. Split it into smaller files.`] };
  return { rows, errors };
}

// Trainer names are matched to trainer profiles ignoring case and extra spaces; no match keeps the name only.
export const nameKey = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// The sticky-note colour on the calendar, like bookings: delivered is green.
export const b2cNote = (r: Pick<B2CRow, "status" | "delivered">) => (r.delivered ? "delivered" : r.status);
