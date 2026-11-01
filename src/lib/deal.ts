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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/* ---------- Audience: seniority levels, departments and headcount ---------- */

// Picked from the lists admins keep in Scoring & lists: lookups of kind "audience" (seniority) and "function" (departments).
export type Audience = { level_ids: string[]; department_ids: string[]; all_departments: boolean; participant_count: number };

export const MAX_PARTICIPANTS = 10_000;
// One-tap chips above the department search; names that aren't in the list are simply not shown.
export const COMMON_DEPARTMENTS = ["HR", "Sales", "Finance", "Marketing", "Operations", "IT", "Executive Office", "Customer Service"];

const isIdList = (v: unknown, max: number): v is string[] => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && UUID.test(x)) && new Set(v).size === v.length;

export function audienceError(a: Partial<Audience> | undefined): string | null {
  if (!a || typeof a !== "object") return "Pick the audience.";
  if (!isIdList(a.level_ids, 20) || !a.level_ids.length) return "Pick at least one seniority level.";
  if (typeof a.all_departments !== "boolean" || !isIdList(a.department_ids, 100)) return "Pick the departments again.";
  if (!a.all_departments && !a.department_ids.length) return "Pick at least one department, or “Mixed / all departments”.";
  if (a.all_departments && a.department_ids.length) return "Pick departments or “Mixed / all departments”, not both.";
  const n = Number(a.participant_count);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PARTICIPANTS) return `Enter the number of participants (1 to ${MAX_PARTICIPANTS.toLocaleString("en-US")}).`;
  return null;
}

// The rows saved in deal_audience: one per picked level and department.
export const audienceRows = (dealId: string, a: Audience) => [...a.level_ids, ...a.department_ids].map((lookup_id) => ({ deal_id: dealId, lookup_id }));

// "Junior Level (Entry-Level / Associates)" → { main: "Junior Level", sub: "Entry-Level / Associates" }, for compact chips.
export function splitLabel(name: string) {
  const m = name.match(/^(.*?)\s*\((.*)\)\s*$/);
  return m ? { main: m[1], sub: m[2] } : { main: name, sub: "" };
}

/* ---------- Matching trainers to the audience ---------- */

type Matchable = { lookups: { id: string }[]; tier: { audience_ids: string[] } | null };

// Seniority filters: the trainer must be tagged with every picked level, and their tier (if it has audience rules) must allow each.
export function fitsLevels(t: Matchable, levelIds: string[]) {
  const tags = new Set(t.lookups.map((l) => l.id));
  return levelIds.every((id) => tags.has(id) && (!t.tier || !t.tier.audience_ids.length || t.tier.audience_ids.includes(id)));
}

// Departments rank instead of filter: how many of the picked departments the trainer covers.
export function departmentMatches(t: Pick<Matchable, "lookups">, departmentIds: string[]) {
  const tags = new Set(t.lookups.map((l) => l.id));
  return departmentIds.filter((id) => tags.has(id)).length;
}

// More departments covered first; the existing score order (total) breaks ties.
export function rankByDepartments<T extends Pick<Matchable, "lookups"> & { total: number }>(list: T[], departmentIds: string[]) {
  return list
    .map((t) => ({ t, n: departmentMatches(t, departmentIds) }))
    .sort((a, b) => b.n - a.n || b.t.total - a.t.total)
    .map(({ t, n }) => ({ ...t, departments: n }));
}

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
  company_name: string;
  program_name: string;
  industry_id: string;
  contact: ClientContact;
  audience: Audience;
  proposal: ProposalFile;
  value_per_day: number;
  deal_days: number;
  same_trainer: boolean;
  days: NewRequestDay[];
};

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
  if (typeof input.company_name !== "string" || !input.company_name.trim()) return "Enter the company name.";
  if (input.company_name.trim().length > 200) return "The company name is too long.";
  if (typeof input.program_name !== "string" || !input.program_name.trim()) return "Enter the program name.";
  if (input.program_name.trim().length > 200) return "The program name is too long.";
  if (typeof input.industry_id !== "string" || !UUID.test(input.industry_id)) return "Pick the industry.";
  const ce = contactError(input.contact);
  if (ce) return ce;
  // Step 2: audience
  const ae = audienceError(input.audience);
  if (ae) return ae;
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
