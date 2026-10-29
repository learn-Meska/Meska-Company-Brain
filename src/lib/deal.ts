// New deal rules shared by the request form (browser) and createRequest (server).
// Pure functions only: no database, no Next.js, so the golden tests in tests/ can run them directly.

import { slotsFor } from "./format";

/* ---------- Client point of contact ---------- */

export type ClientContact = { name: string; email: string; mobile: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function contactError(c: ClientContact) {
  if (!String(c?.name ?? "").trim()) return "Enter the client contact's name.";
  if (!EMAIL.test(String(c?.email ?? "").trim())) return "Enter a valid email for the client contact.";
  if (String(c?.mobile ?? "").replace(/\D/g, "").length < 7) return "Enter the client contact's phone number.";
  return null;
}

export const contactFields = (c: ClientContact) => ({ contact_name: c.name.trim(), contact_email: c.email.trim().toLowerCase(), contact_mobile: c.mobile.trim() });

/* ---------- Training days ---------- */

export const TIME = /^\d{2}:\d{2}$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const dayError = (d: { day_number: number; date: string; start: string; end: string }) =>
  !DATE.test(d.date)
    ? `Pick a date for Day ${d.day_number}.`
    : !TIME.test(d.start) || !TIME.test(d.end) || d.end <= d.start
      ? `Check the time for Day ${d.day_number}.`
      : !slotsFor(d.start, d.end).length
        ? `Day ${d.day_number}: the time must fall within Morning (9 AM – 5 PM) or Evening (6 PM – 11 PM).`
        : null;

/* ---------- Participants (the audience, uploaded as a CSV) ---------- */

export type Participant = { name: string; title: string; department: string };

export const PARTICIPANT_COLUMNS = ["name", "title", "department"] as const;
export const MAX_PARTICIPANTS = 500;
const MAX_FIELD = 200;

// The file Growth downloads and fills in. The BOM makes Excel open it as UTF-8 (Arabic names stay intact).
export const PARTICIPANTS_TEMPLATE_CSV = "﻿" + PARTICIPANT_COLUMNS.join(",") + "\r\n";
export const PARTICIPANTS_TEMPLATE_NAME = "participants-template.csv";

// RFC 4180: quoted fields, "" inside quotes, commas and line breaks inside quotes, CRLF or LF.
// Excel in some regions saves with semicolons, so the header line decides the delimiter.
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = !firstLine.includes(",") && firstLine.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

// Reads the filled-in template. Every row needs a name; title and department may be blank.
export function parseParticipants(text: string): { participants: Participant[]; error: string | null } {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (!rows.length) return { participants: [], error: "The file is empty. Download the template and add one participant per row." };
  const header = rows[0].map((h) => clean(h).toLowerCase());
  const at = PARTICIPANT_COLUMNS.map((c) => header.indexOf(c));
  const missing = PARTICIPANT_COLUMNS.filter((_, i) => at[i] < 0);
  if (missing.length) return { participants: [], error: `The file must use the template's columns: name, title, department (missing: ${missing.join(", ")}).` };
  const body = rows.slice(1);
  if (!body.length) return { participants: [], error: "The file has no participants. Add one participant per row under the header." };
  if (body.length > MAX_PARTICIPANTS) return { participants: [], error: `A deal can list at most ${MAX_PARTICIPANTS} participants (the file has ${body.length}).` };
  const participants: Participant[] = [];
  for (const [i, r] of body.entries()) {
    const [name, title, department] = at.map((j) => clean(r[j]));
    if (!name) return { participants: [], error: `Row ${i + 2}: the name is missing.` };
    if ([name, title, department].some((v) => v.length > MAX_FIELD)) return { participants: [], error: `Row ${i + 2}: a value is longer than ${MAX_FIELD} characters.` };
    participants.push({ name, title, department });
  }
  return { participants, error: null };
}

// The server re-checks the list the browser parsed (it can be called with anything).
export function participantsError(list: unknown): string | null {
  if (!Array.isArray(list) || !list.length) return "Upload the participants file (name, title, department).";
  if (list.length > MAX_PARTICIPANTS) return `A deal can list at most ${MAX_PARTICIPANTS} participants.`;
  for (const [i, p] of list.entries()) {
    if (!p || typeof p !== "object") return `Participant ${i + 1} is not valid.`;
    const { name, title, department } = p as Record<string, unknown>;
    if (![name, title, department].every((v) => v == null || typeof v === "string")) return `Participant ${i + 1} is not valid.`;
    if (!clean(name)) return `Participant ${i + 1}: the name is missing.`;
    if ([name, title, department].some((v) => clean(v).length > MAX_FIELD)) return `Participant ${i + 1}: a value is longer than ${MAX_FIELD} characters.`;
  }
  return null;
}

// Quotes a value for CSV and defuses spreadsheet formulas (=, +, -, @) so opening the file never runs anything.
function csvCell(v: string) {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// The participant list in the template's own format, so it can be edited and uploaded again.
export function participantsCsv(list: { name: string; title: string | null; department: string | null }[]) {
  return "﻿" + [PARTICIPANT_COLUMNS.join(","), ...list.map((p) => [p.name, p.title ?? "", p.department ?? ""].map(csvCell).join(","))].join("\r\n") + "\r\n";
}

export const participantRows =(dealId: string, list: Participant[]) =>
  list.map((p, i) => ({ deal_id: dealId, position: i + 1, name: clean(p.name), title: clean(p.title) || null, department: clean(p.department) || null }));

/* ---------- Proposal and value ---------- */

export const PROPOSAL_TYPES = /\.(pdf|docx?|pptx?|xlsx?|odt|odp|ods|rtf)$/i;
export const PROPOSAL_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.odp,.ods,.rtf";
export const MAX_PROPOSAL_BYTES = 50 * 1024 * 1024;

export function proposalFileError(fileName: string, size?: number) {
  if (typeof fileName !== "string" || !PROPOSAL_TYPES.test(fileName.trim())) return "Upload the proposal as a PDF, Word, PowerPoint or Excel file.";
  if (size != null && (!Number.isFinite(size) || size > MAX_PROPOSAL_BYTES)) return "The proposal must be 50 MB or smaller.";
  return null;
}

// "100,000", "100 000" and "100000.50" are all accepted; anything else is NaN.
export function parseAmount(v: string | number): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[\s,]/g, "");
  return /^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : NaN;
}

export const MAX_DEAL_DAYS = 365;
export const MAX_VALUE_PER_DAY = 1_000_000_000;

export function dealValueError(valuePerDay: number, days: number) {
  if (!Number.isFinite(valuePerDay) || valuePerDay <= 0) return "Enter the value per training day (a number above 0).";
  if (valuePerDay > MAX_VALUE_PER_DAY) return "The value per day looks too large. Check the amount.";
  if (!Number.isInteger(days) || days < 1 || days > MAX_DEAL_DAYS) return `Enter how many days the deal covers (1 to ${MAX_DEAL_DAYS}).`;
  return null;
}

// value_per_day * days, rounded to the cent (e.g. 100,000 a day for 5 days = 500,000).
export const dealTotal = (valuePerDay: number, days: number) => Math.round(valuePerDay * days * 100) / 100;

export const fmtAmount = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/* ---------- The whole New deal request ---------- */

export type ProposalFile = { path: string; name: string; size: number };

// A New deal no longer asks for per-day content; bookings.content is saved as "" for these days.
export type NewRequestDay = { day_number: number; date: string; start: string; end: string; location: string; trainer_id?: string };

export type NewRequest = {
  program_name: string;
  industry_id: string;
  contact: ClientContact;
  participants: Participant[];
  proposal: ProposalFile;
  value_per_day: number;
  deal_days: number;
  same_trainer: boolean;
  days: NewRequestDay[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PAST_DATE = "Trainings can't be scheduled on a date that has already passed.";

// Proposals are uploaded under the uploader's own folder, so nobody can attach someone else's file.
export function proposalPathError(p: ProposalFile | undefined, userId: string) {
  if (!p || typeof p.path !== "string" || typeof p.name !== "string") return "Upload the proposal.";
  if (!p.path.startsWith(`${userId}/`) || p.path.includes("..") || p.path.split("/").length !== 2) return "Upload the proposal again.";
  return proposalFileError(p.path) ?? proposalFileError(p.name, Number(p.size));
}

// Every check createRequest makes before touching the database, in the order the form shows the steps.
export function requestError(input: NewRequest, who: { role: string; userId: string; today: string }): string | null {
  if (!input || typeof input !== "object") return "Fill in the request.";
  // Step 1: the client & program
  if (typeof input.program_name !== "string" || !input.program_name.trim()) return "Enter the program name.";
  if (input.program_name.trim().length > 200) return "The program name is too long.";
  if (typeof input.industry_id !== "string" || !UUID.test(input.industry_id)) return "Pick the industry.";
  const ce = contactError(input.contact);
  if (ce) return ce;
  // Step 2: participants
  const pe = participantsError(input.participants);
  if (pe) return pe;
  // Step 3: proposal and value
  const fe = proposalPathError(input.proposal, who.userId);
  if (fe) return fe;
  const ve = dealValueError(Number(input.value_per_day), Number(input.deal_days));
  if (ve) return ve;
  // Step 4: training days
  if (!Array.isArray(input.days) || !input.days.length) return "Add at least one training day.";
  if (input.days.length > MAX_DEAL_DAYS) return "Too many training days.";
  for (const d of input.days) {
    if (!Number.isInteger(d.day_number) || d.day_number < 1) return "Each day needs a day number of 1 or more.";
    const e = dayError(d);
    if (e) return e;
    if (d.date < who.today) return `Day ${d.day_number}: ${PAST_DATE}`;
    if (d.trainer_id && !UUID.test(d.trainer_id)) return `Day ${d.day_number}: pick the trainer again.`;
    if (typeof d.location !== "string") return `Check the location for Day ${d.day_number}.`;
  }
  // Growth must choose the trainer for every day; admins and booking managers may leave days to assign later.
  const missing = input.days.find((d) => !d.trainer_id);
  if (who.role === "growth" && missing) return `Choose a trainer for Day ${missing.day_number}.`;
  return null;
}
