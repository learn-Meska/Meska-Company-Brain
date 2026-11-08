// The training cycle on the Training Excellence dashboard: one row per training, worked out from its days.
// No database here and `today` is an argument, so every rule can be tested with plain data.

import { ACTIVE_STATUSES } from "@/lib/format";
import { nps } from "@/lib/survey";

export type CycleDay = {
  id: string;
  deal_id: string | null;
  batch_id: string | null;
  program_name: string;
  day_number: number;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  trainer_id: string | null;
  industry: { name: string } | null;
  created_by: string | null;
  created_at: string;
  trainer_comment: string | null;
  trainer_responded_at: string | null;
  finished_at: string | null;
  brief_submitted_at: string | null;
  trainers: { full_name: string } | null;
};
export type CycleDeal = { id: string; company_name: string | null; content_guide: string | null; content_submitted_at: string | null; created_at: string };

export type ContentState = "none" | "needs_content" | "in_progress" | "submitted";
export type Stage = "cancelled" | "needs_trainer" | "waiting_trainer" | "scheduled" | "in_delivery" | "report_due" | "delivered";

export const STAGE_LABEL: Record<Stage, string> = {
  needs_trainer: "Needs a trainer",
  waiting_trainer: "Waiting on trainer",
  scheduled: "Scheduled",
  in_delivery: "In delivery",
  report_due: "Report due",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
export const CONTENT_LABEL: Record<Exclude<ContentState, "none">, string> = { needs_content: "Not added", in_progress: "In progress", submitted: "Added" };

export const ATTENTION_DAYS = 7;

export type Training = {
  key: string;
  company: string | null;
  program: string;
  industry: string | null;
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
  briefs: number;
  audios: number;
  trainers: { id: string; name: string }[];
  nextDate: string | null;
  firstDate: string;
  lastDate: string;
  firstDay: CycleDay;
  started: boolean;
  responses: number;
  score: number | null;
  stage: Stage;
  confirmation: string;
  attention: boolean;
};

export const isLive = (d: Pick<CycleDay, "status">) => ACTIVE_STATUSES.includes(d.status);
const hasNoTrainer = (d: Pick<CycleDay, "status" | "trainer_id">) => !d.trainer_id || d.status === "needs_trainer";
const isWaiting = (d: Pick<CycleDay, "status">) => d.status === "awaiting_trainer" || d.status === "pending_approval";

// A decline clears the trainer and sends the day back to needs_trainer, keeping when they answered.
export const isDeclined = (d: Pick<CycleDay, "status" | "trainer_id" | "trainer_responded_at">) => d.status === "needs_trainer" && !d.trainer_id && !!d.trainer_responded_at;

export function contentState(deal: Pick<CycleDeal, "content_guide" | "content_submitted_at"> | null | undefined, hasFiles: boolean): ContentState {
  if (!deal) return "none";
  if (deal.content_submitted_at) return "submitted";
  return deal.content_guide?.trim() || hasFiles ? "in_progress" : "needs_content";
}

// First match wins. `days` are the live days. Delivered only once the trainer marked every day as delivered.
export function cycleStage(days: Pick<CycleDay, "date" | "status" | "trainer_id" | "finished_at">[], today: string): Stage {
  if (!days.length) return "cancelled";
  if (days.some(hasNoTrainer)) return "needs_trainer";
  if (days.some(isWaiting)) return "waiting_trainer";
  if (days.every((d) => d.finished_at)) return "delivered";
  if (days.every((d) => d.date > today)) return "scheduled";
  return days.every((d) => d.date < today) ? "report_due" : "in_delivery";
}

// The trainer's answer across the days of a training.
export function confirmationLabel(days: Pick<CycleDay, "status" | "trainer_id" | "trainer_responded_at">[]) {
  if (!days.length) return "—";
  if (days.some(isDeclined)) return "Declined";
  const confirmed = days.filter((d) => d.status === "confirmed").length;
  if (confirmed === days.length) return "Confirmed";
  if (confirmed) return `${confirmed} of ${days.length} confirmed`;
  return days.some(isWaiting) ? "Pending" : "No trainer yet";
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Content is still expected: it isn't submitted and no day has gone by yet.
export const contentOpen = (content: ContentState, days: Pick<CycleDay, "date">[], today: string) =>
  (content === "needs_content" || content === "in_progress") && days.length > 0 && days.every((d) => d.date >= today);

// A declined day not yet reassigned, or a missing trainer, confirmation or content for a day within a week (or already gone by).
export function needsAttention(days: Pick<CycleDay, "date" | "status" | "trainer_id" | "trainer_responded_at">[], stage: Stage, content: ContentState, today: string) {
  if (days.some(isDeclined)) return true;
  const open = stage === "needs_trainer" ? days.filter(hasNoTrainer) : stage === "waiting_trainer" ? days.filter(isWaiting) : [];
  const limit = addDays(today, ATTENTION_DAYS);
  return [...open, ...(contentOpen(content, days, today) ? days : [])].some((d) => d.date <= limit);
}

function compareTrainings(a: Training, b: Training) {
  if (a.attention !== b.attention) return a.attention ? -1 : 1;
  if (a.nextDate && b.nextDate) return a.nextDate.localeCompare(b.nextDate);
  if (a.nextDate || b.nextDate) return a.nextDate ? -1 : 1;
  return b.lastDate.localeCompare(a.lastDate);
}

// One training = a deal, else a multi-day batch, else a single booking. Attention first, then the nearest date.
export function buildTrainings(input: {
  days: CycleDay[];
  deals: CycleDeal[];
  contentFileDealIds: string[];
  feedback: { booking_id: string; recommend: number | null }[];
  audioBookingIds: string[];
  names: Map<string, string>;
  today: string;
}): Training[] {
  const { days, deals, contentFileDealIds, feedback, audioBookingIds, names, today } = input;
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const withFiles = new Set(contentFileDealIds);
  const withAudio = new Set(audioBookingIds);

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
    const stage = cycleStage(live, today);
    const trainers = new Map<string, string>();
    for (const d of live) if (d.trainer_id && d.trainers) trainers.set(d.trainer_id, d.trainers.full_name);
    const dates = live.map((d) => d.date).sort();
    // A fully cancelled training still shows the dates it was booked for.
    const shown = [...(live.length ? live : sorted)].sort((a, b) => a.date.localeCompare(b.date));
    const allDates = sorted.map((d) => d.date).sort();
    const ids = new Set(sorted.map((d) => d.id));
    const responses = feedback.filter((f) => ids.has(f.booking_id));
    return {
      key,
      company: deal?.company_name || null,
      program: first.program_name,
      industry: first.industry?.name ?? null,
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
      briefs: live.filter((d) => d.brief_submitted_at).length,
      audios: live.filter((d) => withAudio.has(d.id)).length,
      trainers: [...trainers.entries()].map(([id, name]) => ({ id, name })),
      nextDate: dates.find((d) => d >= today) ?? null,
      firstDate: shown[0].date,
      lastDate: allDates[allDates.length - 1],
      firstDay: shown[0],
      started: dates.some((d) => d <= today),
      responses: responses.length,
      score: nps(responses.map((f) => f.recommend).filter((x): x is number => x != null)),
      stage,
      confirmation: confirmationLabel(live),
      attention: needsAttention(live, stage, content, today),
    };
  });
  return out.sort(compareTrainings);
}

export const isStage = (s: unknown): s is Stage => typeof s === "string" && Object.hasOwn(STAGE_LABEL, s);

// Dashboard filters for the Trainer confirmation and Content columns.
export const CONFIRMATION_FILTERS = { pending: "Pending", confirmed: "Confirmed", partly: "Partly confirmed", declined: "Declined", no_trainer: "No trainer yet" } as const;
export type ConfirmationFilter = keyof typeof CONFIRMATION_FILTERS;
export const isConfirmationFilter = (s: unknown): s is ConfirmationFilter => typeof s === "string" && Object.hasOwn(CONFIRMATION_FILTERS, s);

export function confirmationFilter(label: string): ConfirmationFilter | null {
  if (label === "Pending") return "pending";
  if (label === "Confirmed") return "confirmed";
  if (label === "Declined") return "declined";
  if (label === "No trainer yet") return "no_trainer";
  if (/ of \d+ confirmed$/.test(label)) return "partly";
  return null;
}

export const isContentFilter = (s: unknown): s is Exclude<ContentState, "none"> => typeof s === "string" && Object.hasOwn(CONTENT_LABEL, s);
