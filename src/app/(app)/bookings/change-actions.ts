"use server";

import { revalidatePath } from "next/cache";
import { can, requireRole } from "@/lib/auth";
import { CHANGE_KIND_ASK, CHANGE_KIND_LABEL, readChangeRequest, readResolution, requestProblem, type ChangeKind } from "@/lib/change-request";
import { changeRequestsFor, trainingDayRows, type ChangeRequestRow } from "@/lib/change-requests";
import { esc } from "@/lib/email";
import { fmtDate, friendlyError, isUuid, todayISO } from "@/lib/format";
import { audit, notify, userById, usersWithRoles } from "@/lib/notify";
import { db } from "@/lib/supabase";
import { seesDealOf } from "@/lib/team-people";

type Day = { id: string; deal_id: string | null; batch_id: string | null; program_name: string; created_by: string | null };

async function loadDay(id: unknown) {
  if (!isUuid(id)) return null;
  const { data } = await db().from("bookings").select("id, deal_id, batch_id, program_name, created_by").eq("id", id).maybeSingle();
  return data as Day | null;
}

async function loadRequest(id: unknown) {
  if (!isUuid(id)) return null;
  const { data } = await db().from("training_change_requests").select("id, booking_id, kind, reason, requested_by, status, resolved_by, resolved_at, resolution_note, created_at").eq("id", id).maybeSingle();
  return data as ChangeRequestRow | null;
}

function refresh(bookingId: string) {
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/bookings", "layout");
  revalidatePath("/dashboard", "layout");
}

// Which Training Excellence access answers each kind of request.
const ANSWER_ACCESS: Record<ChangeKind, string> = { trainer: "te.assign", date: "te.edit", cancel: "te.cancel" };

// Growth asks Training Excellence for a change on a training it can open, with a reason. Growth never changes
// the trainer itself. One request is open per training at a time.
export async function requestChange(fd: FormData) {
  const me = await requireRole("growth");
  const b = await loadDay(fd.get("id"));
  if (!b || !(await seesDealOf(me, b.created_by))) return { error: "Training not found." };
  const read = readChangeRequest({ kind: fd.get("kind"), reason: fd.get("reason") });
  if ("error" in read) return read;
  const days = await trainingDayRows(b);
  const earlier = await changeRequestsFor(days.map((d) => d.id));
  const problem = requestProblem(read.kind, days, todayISO(), earlier.some((r) => r.status === "open"));
  if (problem) return { error: problem };

  const { error } = await db().from("training_change_requests").insert({ booking_id: b.id, kind: read.kind, reason: read.reason, requested_by: me.id, status: "open" });
  if (error) return { error: friendlyError(error.message) };
  await audit(me.id, "change_requested", b.id, { program: b.program_name, kind: read.kind, reason: read.reason });

  const upcoming = days.filter((d) => d.status !== "cancelled" && !d.finished_at && d.date >= todayISO());
  const ask = CHANGE_KIND_ASK[read.kind];
  const to = (await usersWithRoles("admin", "approver")).filter((u) => u.id !== me.id);
  await notify(to, {
    title: `${me.full_name} asked for ${ask}: ${b.program_name}`,
    body: read.reason.slice(0, 200),
    link: `/bookings/${b.id}`,
    email: {
      subject: `Action needed: ${me.full_name} asked for ${ask} — ${b.program_name}`,
      heading: `Growth asked for ${ask}`,
      intro: `<b>${esc(me.full_name)}</b> from Growth asked for <b>${esc(ask)}</b> on <b>${esc(b.program_name)}</b>. Their reason is below. The trainer is not told about the request.`,
      rows: [
        ["Program", esc(b.program_name)],
        ["Request", esc(CHANGE_KIND_LABEL[read.kind])],
        ...upcoming.map((d) => [`Day ${d.day_number}`, esc(fmtDate(d.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }))] as [string, string]),
      ],
      content: read.reason,
      next: [
        read.kind === "trainer"
          ? "<b>Training Excellence:</b> open the training. Reassign the trainer, or keep them and tell Growth why."
          : read.kind === "date"
            ? "<b>Training Excellence:</b> open the training. Move the days in Edit training and mark the request as done, or decline it with a note."
            : "<b>Training Excellence:</b> open the training. Cancel it, or decline the request with a note.",
        "Growth is notified of your answer.",
      ],
      button: "Open the request",
    },
  });
  refresh(b.id);
  return { ok: "Request sent to Training Excellence. You'll be notified when they answer." };
}

// Growth takes back a request that is still waiting.
export async function withdrawChangeRequest(fd: FormData) {
  const me = await requireRole("growth");
  const r = await loadRequest(fd.get("id"));
  const b = r ? await loadDay(r.booking_id) : null;
  if (!r || !b || !(await seesDealOf(me, b.created_by))) return { error: "Request not found." };
  const { data, error } = await db()
    .from("training_change_requests")
    .update({ status: "withdrawn", resolved_by: me.id, resolved_at: new Date().toISOString() })
    .eq("id", r.id)
    .eq("status", "open")
    .select("id");
  if (error) return { error: friendlyError(error.message) };
  if (!data?.length) return { error: "This request was already answered. Refresh the page." };
  await audit(me.id, "change_request_withdrawn", b.id, { program: b.program_name, kind: r.kind });
  await notify((await usersWithRoles("admin", "approver")).filter((u) => u.id !== me.id), {
    title: `Change request withdrawn: ${b.program_name}`,
    body: `${me.full_name} no longer asks for ${CHANGE_KIND_ASK[r.kind]}.`,
    link: `/bookings/${b.id}`,
  });
  refresh(b.id);
  return { ok: "Request withdrawn." };
}

// Training Excellence answers a request: done (the change was made) or declined, with a note for Growth.
// Reassigning or cancelling the training closes a matching request on its own (settleChangeRequests).
export async function resolveChangeRequest(fd: FormData) {
  const me = await requireRole("admin", "approver");
  const r = await loadRequest(fd.get("id"));
  const b = r ? await loadDay(r.booking_id) : null;
  if (!r || !b || !can(me, ANSWER_ACCESS[r.kind])) return { error: "Request not found." };
  const read = readResolution({ outcome: fd.get("outcome"), note: fd.get("note") });
  if ("error" in read) return read;
  const { data, error } = await db()
    .from("training_change_requests")
    .update({ status: read.outcome, resolved_by: me.id, resolved_at: new Date().toISOString(), resolution_note: read.note })
    .eq("id", r.id)
    .eq("status", "open")
    .select("id");
  if (error) return { error: friendlyError(error.message) };
  if (!data?.length) return { error: "This request was already answered or withdrawn. Refresh the page." };
  await audit(me.id, "change_request_resolved", b.id, { program: b.program_name, kind: r.kind, outcome: read.outcome, note: read.note });

  const done = read.outcome === "done";
  const requester = await userById(r.requested_by);
  if (requester && requester.id !== me.id) {
    await notify([requester], {
      title: `${done ? "Done" : "Declined"}: your request for ${CHANGE_KIND_ASK[r.kind]} — ${b.program_name}`,
      body: read.note ?? (done ? "Training Excellence made the change." : ""),
      link: `/bookings/${b.id}`,
      email: {
        subject: `${done ? "Done" : "Declined"}: your change request on ${b.program_name}`,
        heading: done ? "Your change request was done" : "Your change request was declined",
        intro: `<b>${esc(me.full_name)}</b> from Training Excellence ${done ? "made the change you asked for" : "decided to keep the training as it is"} on <b>${esc(b.program_name)}</b>.`,
        rows: [
          ["Program", esc(b.program_name)],
          ["You asked for", esc(CHANGE_KIND_LABEL[r.kind])],
          ["Your reason", esc(r.reason)],
        ],
        content: read.note ?? undefined,
        next: [done ? "Open the training to see the change. You'll be notified when the trainer confirms." : "If something new came up, you can send another request with the details."],
        button: "View the training",
      },
    });
  }
  refresh(b.id);
  return { ok: done ? "Marked as done. Growth was told." : "Declined. Growth was told why." };
}
