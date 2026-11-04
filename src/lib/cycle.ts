// The training cycle on the Training Excellence dashboard: one row per training, worked out from its days.
// No database here and `today` is an argument, so every rule can be tested with plain data.

import { ACTIVE_STATUSES } from "@/lib/format";

export type CycleDay = {
  id: string;
  deal_id: string | null;
  batch_id: string | null;
  program_name: string;
  day_number: number;
  date: string;
  status: string;
  trainer_id: string | null;
  created_by: string | null;
  created_at: string;
  trainer_comment: string | null;
  trainer_responded_at: string | null;
  finished_at: string | null;
  trainers: { full_name: string } | null;
};
export type CycleDeal = { id: string; company_name: string | null; content_guide: string | null; content_submitted_at: string | null; created_at: string };

export type ContentState = "none" | "needs_content" | "in_progress" | "submitted";
export type Stage = "cancelled" | "needs_trainer" | "waiting_trainer" | "needs_content" | "ready" | "in_delivery" | "delivered";

export const STAGE_LABEL: Record<Stage, string> = {
  needs_trainer: "Needs a trainer",
  waiting_trainer: "Waiting on trainer",
  needs_content: "Needs content",
  ready: "Ready",
  in_delivery: "In delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
export const CONTENT_LABEL: Record<Exclude<ContentState, "none">, string> = { needs_content: "Needs content", in_progress: "In progress", submitted: "Submitted" };

export const ATTENTION_DAYS = 7;

export type Training = {
  key: string;
  company: string | null;
  program: string;
  linkId: string;
  requestedBy: string | null;
  requestedByName: string | null;
  requestedAt: string;
  content: ContentState;
  contentSubmittedAt: string | null;
  days: CycleDay[];
  live: number;
  confirmed: number;
  finished: number;
  trainers: { id: string; name: string }[];
  nextDate: string | null;
  lastDate: string;
  started: boolean;
  feedback: number;
  stage: Stage;
  attention: boolean;
};

const isLive = (d: Pick<CycleDay, "status">) => ACTIVE_STATUSES.includes(d.status);
const hasNoTrainer = (d: Pick<CycleDay, "status" | "trainer_id">) => !d.trainer_id || d.status === "needs_trainer";
const isWaiting = (d: Pick<CycleDay, "status">) => d.status === "awaiting_trainer" || d.status === "pending_approval";

// A decline clears the trainer and sends the day back to needs_trainer, keeping when they answered.
export const isDeclined = (d: Pick<CycleDay, "status" | "trainer_id" | "trainer_responded_at">) => d.status === "needs_trainer" && !d.trainer_id && !!d.trainer_responded_at;

export function contentState(deal: Pick<CycleDeal, "content_guide" | "content_submitted_at"> | null | undefined, hasFiles: boolean): ContentState {
  if (!deal) return "none";
  if (deal.content_submitted_at) return "submitted";
  return deal.content_guide?.trim() || hasFiles ? "in_progress" : "needs_content";
}

// First match wins. `days` are the live days. A training running today counts as in delivery.
export function cycleStage(days: Pick<CycleDay, "date" | "status" | "trainer_id">[], content: ContentState, today: string): Stage {
  if (!days.length) return "cancelled";
  if (days.some(hasNoTrainer)) return "needs_trainer";
  if (days.some(isWaiting)) return "waiting_trainer";
  const passed = days.filter((d) => d.date < today).length;
  if ((content === "needs_content" || content === "in_progress") && passed === 0) return "needs_content";
  if (days.every((d) => d.date > today)) return "ready";
  return passed === days.length ? "delivered" : "in_delivery";
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// A declined day not yet reassigned, or the open step's earliest day is within a week (or already gone by).
export function needsAttention(days: Pick<CycleDay, "date" | "status" | "trainer_id" | "trainer_responded_at">[], stage: Stage, today: string) {
  if (days.some(isDeclined)) return true;
  const open = stage === "needs_trainer" ? days.filter(hasNoTrainer) : stage === "waiting_trainer" ? days.filter(isWaiting) : stage === "needs_content" ? days : [];
  const limit = addDays(today, ATTENTION_DAYS);
  return open.some((d) => d.date <= limit);
}

function compareTrainings(a: Training, b: Training) {
  if (a.attention !== b.attention) return a.attention ? -1 : 1;
  if (a.nextDate && b.nextDate) return a.nextDate.localeCompare(b.nextDate);
  if (a.nextDate || b.nextDate) return a.nextDate ? -1 : 1;
  return b.lastDate.localeCompare(a.lastDate);
}

// One training = a deal, else a multi-day batch, else a single booking. Attention first, then the nearest date.
export function buildTrainings(input: { days: CycleDay[]; deals: CycleDeal[]; contentFileDealIds: string[]; feedbackBookingIds: string[]; names: Map<string, string>; today: string }): Training[] {
  const { days, deals, contentFileDealIds, feedbackBookingIds, names, today } = input;
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const withFiles = new Set(contentFileDealIds);
  const feedbackByBooking = new Map<string, number>();
  for (const id of feedbackBookingIds) feedbackByBooking.set(id, (feedbackByBooking.get(id) ?? 0) + 1);

  const groups = new Map<string, CycleDay[]>();
  for (const d of days) {
    const key = d.deal_id ? `deal:${d.deal_id}` : d.batch_id ? `batch:${d.batch_id}` : `booking:${d.id}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }

  const out = [...groups.entries()].map(([key, group]): Training => {
    const sorted = [...group].sort((a, b) => a.day_number - b.day_number || a.date.localeCompare(b.date));
    const live = sorted.filter(isLive);
    const first = live[0] ?? sorted[0];
    const deal = first.deal_id ? dealById.get(first.deal_id) : undefined;
    const content = contentState(deal, !!first.deal_id && withFiles.has(first.deal_id));
    const stage = cycleStage(live, content, today);
    const trainers = new Map<string, string>();
    for (const d of live) if (d.trainer_id && d.trainers) trainers.set(d.trainer_id, d.trainers.full_name);
    const dates = live.map((d) => d.date).sort();
    const allDates = sorted.map((d) => d.date).sort();
    return {
      key,
      company: deal?.company_name || null,
      program: first.program_name,
      linkId: first.id,
      requestedBy: first.created_by,
      requestedByName: first.created_by ? names.get(first.created_by) ?? null : null,
      requestedAt: deal?.created_at ?? first.created_at,
      content,
      contentSubmittedAt: deal?.content_submitted_at ?? null,
      days: sorted,
      live: live.length,
      confirmed: live.filter((d) => d.status === "confirmed").length,
      finished: live.filter((d) => d.finished_at).length,
      trainers: [...trainers.entries()].map(([id, name]) => ({ id, name })),
      nextDate: dates.find((d) => d >= today) ?? null,
      lastDate: allDates[allDates.length - 1],
      started: dates.some((d) => d <= today),
      feedback: sorted.reduce((n, d) => n + (feedbackByBooking.get(d.id) ?? 0), 0),
      stage,
      attention: needsAttention(live, stage, today),
    };
  });
  return out.sort(compareTrainings);
}

export const WHEN_OPTIONS = ["active", "past", "all"] as const;
export type When = (typeof WHEN_OPTIONS)[number];
export const isStage = (s: unknown): s is Stage => typeof s === "string" && Object.hasOwn(STAGE_LABEL, s);

const isClosed = (t: Pick<Training, "stage">) => t.stage === "delivered" || t.stage === "cancelled";

export function matchesWhen(t: Pick<Training, "stage">, when: When) {
  return when === "all" || (when === "past") === isClosed(t);
}
