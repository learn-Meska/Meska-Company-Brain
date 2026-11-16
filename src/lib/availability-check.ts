// Growth's availability check: for each day, can a trainer take it? The answer is yes or no only,
// never who. Pure rules (no database), tested in tests/availability-check.test.ts.

import { dayError, PAST_DATE } from "./deal";

export const MAX_CHECK_DAYS = 31;

export type CheckDay = { date: string; start: string; end: string };
// sameTrainer: whether one trainer could take every day; null when only one day was asked about.
export type AvailabilityAnswer = { days: boolean[]; sameTrainer: boolean | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What the browser sent, rebuilt from known fields. The industry is optional (the checker works without one).
export function readAvailabilityQuery(input: unknown, today: string): { days: CheckDay[]; industryId: string | null } | { error: string } {
  const q = (input ?? {}) as { industry_id?: unknown; days?: unknown };
  if (!Array.isArray(q.days) || !q.days.length) return { error: "Add at least one day." };
  if (q.days.length > MAX_CHECK_DAYS) return { error: `Check at most ${MAX_CHECK_DAYS} days at a time.` };
  const days: CheckDay[] = [];
  for (const [i, raw] of q.days.entries()) {
    const d = (raw ?? {}) as Record<string, unknown>;
    const day = { day_number: i + 1, date: String(d.date ?? ""), start: String(d.start ?? ""), end: String(d.end ?? "") };
    const e = dayError(day);
    if (e) return { error: e };
    if (day.date < today) return { error: `Day ${i + 1}: ${PAST_DATE}` };
    days.push({ date: day.date, start: day.start, end: day.end });
  }
  const industry = q.industry_id == null || q.industry_id === "" ? null : String(q.industry_id);
  if (industry && !UUID.test(industry)) return { error: "Pick the industry again." };
  return { days, industryId: industry };
}

// From the ids of the trainers free on each day, the only thing Growth is told.
export function availabilityAnswer(freeIds: string[][]): AvailabilityAnswer {
  return {
    days: freeIds.map((ids) => ids.length > 0),
    sameTrainer: freeIds.length > 1 ? freeIds[0].some((id) => freeIds.every((ids) => ids.includes(id))) : null,
  };
}

// The checked days carried to the New deal form in the link: "2026-11-20T10:00-15:00,2026-11-21T10:00-15:00".
const DAY_PARAM = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})-(\d{2}:\d{2})$/;
export const daysToParam = (days: CheckDay[]) => days.map((d) => `${d.date}T${d.start}-${d.end}`).join(",");
export function daysFromParam(v: unknown): CheckDay[] {
  if (typeof v !== "string" || !v) return [];
  const out: CheckDay[] = [];
  for (const part of v.split(",").slice(0, MAX_CHECK_DAYS)) {
    const m = DAY_PARAM.exec(part);
    if (m && !dayError({ day_number: 1, date: m[1], start: m[2], end: m[3] })) out.push({ date: m[1], start: m[2], end: m[3] });
  }
  return out;
}
