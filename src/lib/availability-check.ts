// Growth's availability check: for each day, can a trainer take it? The answer is yes or no only,
// never who. Pure rules (no database), tested in tests/availability-check.test.ts.

import { dayError, PAST_DATE } from "./deal";

export const MAX_CHECK_DAYS = 31;

export type CheckDay = { date: string; start: string; end: string };
// sameTrainer: whether one trainer could take every day; null when only one day was asked about.
export type AvailabilityAnswer = { days: boolean[]; sameTrainer: boolean | null };

// What the browser sent, rebuilt from known fields. Matching is on time only for now, so nothing else is read.
export function readAvailabilityQuery(input: unknown, today: string): { days: CheckDay[] } | { error: string } {
  const q = (input ?? {}) as { days?: unknown };
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
  return { days };
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

// The assign screen: where a trainer stands for one day. "free" = marked available in every slot the time
// touches and not booked in any of them; "booked" = taken by another training in one of those slots;
// "unavailable" = hasn't marked every slot as available. Booked wins, since it is the clearer reason.
export type TrainerDayStatus = "free" | "booked" | "unavailable";
export function trainerDayStatus(slots: string[], available: Set<string> | undefined, booked: Set<string> | undefined): TrainerDayStatus {
  if (slots.some((s) => booked?.has(s))) return "booked";
  return slots.length && slots.every((s) => available?.has(s)) ? "free" : "unavailable";
}

// Two days of the same request on the same date and slot can't go to one trainer.
export function sameTimeClash(a: { date: string; slots: string[] }, b: { date: string; slots: string[] }) {
  return a.date === b.date && a.slots.some((s) => b.slots.includes(s));
}
