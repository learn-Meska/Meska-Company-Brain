import "server-only";
import { db } from "./supabase";
import { CHANGE_KIND_LABEL, stillApplies, type ChangeKind, type ChangeStatus } from "./change-request";
import { esc } from "./email";
import { todayISO } from "./format";
import { audit, notify, userById } from "./notify";

// Reads and housekeeping for change requests. No auth checks here, so never export these from a
// "use server" file.

export type ChangeRequestRow = {
  id: string;
  booking_id: string;
  kind: ChangeKind;
  reason: string;
  requested_by: string | null;
  status: ChangeStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
};
const REQUEST_SELECT = "id, booking_id, kind, reason, requested_by, status, resolved_by, resolved_at, resolution_note, created_at";

export type TrainingDay = {
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
  finished_at: string | null;
  industry_id: string | null;
  created_by: string | null;
};
const DAY_SELECT = "id, deal_id, batch_id, program_name, day_number, date, start_time, end_time, status, trainer_id, finished_at, industry_id, created_by";

type TrainingRef = { id: string; deal_id: string | null; batch_id: string | null };

// Every day of the training a booking belongs to: its deal, else its batch, else just itself.
export async function trainingDayRows(b: TrainingRef): Promise<TrainingDay[]> {
  const q = db().from("bookings").select(DAY_SELECT);
  const { data } = await (b.deal_id ? q.eq("deal_id", b.deal_id) : b.batch_id ? q.eq("batch_id", b.batch_id) : q.eq("id", b.id)).order("day_number");
  return (data ?? []) as TrainingDay[];
}

// The requests raised on any of these days, newest first. Empty when there are none (or the table isn't there yet).
export async function changeRequestsFor(dayIds: string[]): Promise<ChangeRequestRow[]> {
  if (!dayIds.length) return [];
  const { data } = await db().from("training_change_requests").select(REQUEST_SELECT).in("booking_id", dayIds).order("created_at", { ascending: false });
  return ((data ?? []) as ChangeRequestRow[]).slice().sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

// Everything the change-request cards on a training need: its days, its requests and the names on them.
export async function trainingChangeRequests(b: TrainingRef) {
  const days = await trainingDayRows(b);
  const requests = await changeRequestsFor(days.map((d) => d.id));
  const ids = [...new Set(requests.flatMap((r) => [r.requested_by, r.resolved_by]).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data } = await db().from("app_users").select("id, full_name").in("id", ids);
    for (const u of (data ?? []) as { id: string; full_name: string }[]) names.set(u.id, u.full_name);
  }
  return { days, requests, names };
}
export type TrainingChangeRequests = Awaited<ReturnType<typeof trainingChangeRequests>>;

const AUTO_NOTE: Record<ChangeKind, string> = {
  trainer: "The trainer is no longer on the upcoming days of this training, so Training Excellence can assign another one.",
  date: "No upcoming day of this training is left to move (it was cancelled or delivered).",
  cancel: "No upcoming day of this training is left (it was cancelled or delivered).",
};

// After a training changes (trainer removed or declined, days cancelled or delivered), closes the open requests
// that no longer make sense and tells whoever asked. Call it after the change is saved; it never throws.
export async function settleChangeRequests(b: TrainingRef, actor: { id: string; full_name: string } | null) {
  try {
    const days = await trainingDayRows(b);
    const open = (await changeRequestsFor(days.map((d) => d.id))).filter((r) => r.status === "open");
    const today = todayISO();
    for (const r of open) {
      if (stillApplies(r.kind, days, today)) continue;
      const note = AUTO_NOTE[r.kind];
      const { data } = await db()
        .from("training_change_requests")
        .update({ status: "done", resolved_by: actor?.id ?? null, resolved_at: new Date().toISOString(), resolution_note: note })
        .eq("id", r.id)
        .eq("status", "open")
        .select("id");
      if (!data?.length) continue;
      const program = days[0]?.program_name ?? "the training";
      await audit(actor?.id ?? null, "change_request_resolved", r.booking_id, { program, kind: r.kind, outcome: "done", automatic: true });
      const requester = await userById(r.requested_by);
      if (requester && requester.id !== actor?.id) {
        await notify([requester], {
          title: `Your change request was closed: ${program}`,
          body: note,
          link: `/bookings/${r.booking_id}`,
          email: {
            subject: `Your change request on ${program} was closed (${CHANGE_KIND_LABEL[r.kind].toLowerCase()})`,
            heading: "Your change request was closed",
            intro: `You asked for <b>${esc(CHANGE_KIND_LABEL[r.kind].toLowerCase())}</b> on <b>${esc(program)}</b>. ${esc(note)}`,
            rows: [["Program", esc(program)], ["Your reason", esc(r.reason)]],
            next: ["Open the training to see where it stands. You'll be notified when a trainer is assigned or confirms."],
            button: "View the training",
          },
        });
      }
    }
  } catch (e) {
    console.error("[settleChangeRequests]", e instanceof Error ? e.message : e);
  }
}

// The open requests across all trainings, for the "Change requested" flag on the dashboard and bookings list.
export async function openChangeRequests(): Promise<{ booking_id: string; kind: ChangeKind }[]> {
  const { data } = await db().from("training_change_requests").select("booking_id, kind").eq("status", "open").range(0, 999);
  return (data ?? []) as { booking_id: string; kind: ChangeKind }[];
}
