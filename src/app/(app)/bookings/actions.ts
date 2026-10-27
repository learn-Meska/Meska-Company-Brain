"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireRole, requireTrainer, requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { esc, siteUrl } from "@/lib/email";
import { trainingIcs } from "@/lib/ics";
import { cairoStart, fmtDate, fmtTime, friendlyError, programVisible, slotsFor, trainerTitle } from "@/lib/format";
import { searchTrainers } from "@/lib/search";
import { getSetting } from "@/lib/scoring";
import { audit, BOOKING_SELECT, bookingRows, notify, trainerRecipient, usersWithRoles, userWithRole, type BookingRow } from "@/lib/notify";

const TIME = /^\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function loadBookings(ids: string[]) {
  const { data } = await db().from("bookings").select(BOOKING_SELECT).in("id", ids);
  return (data ?? []) as BookingRow[];
}

function refresh() {
  for (const p of ["/bookings", "/calendar", "/me", "/me/bookings", "/me/availability"]) revalidatePath(p);
}

const title = (b: BookingRow) => `${b.program_name} — Day ${b.day_number}`;
const when = (b: BookingRow) => `${fmtDate(b.date, { weekday: "short", day: "numeric", month: "short" })}, ${fmtTime(b.start_time)}–${fmtTime(b.end_time)}`;

/* ---------- Search ---------- */

export type DayQuery = { date: string; start: string; end: string; skillIds: string[] };

// Growth: check availability for several days at once, each with its own content (skills).
// With sameTrainer, only trainers free and matching on every day are returned.
export async function findForDays(input: { audienceId: string; industryId: string; sameTrainer: boolean; days: DayQuery[] }) {
  await requireRole("admin", "approver");
  if (!input.days.length) return { error: "Add at least one day." };
  for (const [i, d] of input.days.entries()) {
    if (!DATE.test(d.date)) return { error: `Pick a date for Day ${i + 1}.` };
    if (!TIME.test(d.start) || !TIME.test(d.end) || d.end <= d.start) return { error: `Check the time for Day ${i + 1}.` };
    if (!slotsFor(d.start, d.end).length) return { error: `Day ${i + 1}: the time must fall within Morning (9 AM – 5 PM) or Evening (6 PM – 11 PM).` };
  }
  const perDay = await Promise.all(
    input.days.map((d) => searchTrainers({ date: d.date, start: d.start, end: d.end, audienceId: input.audienceId, functionId: "", industryId: input.industryId, skillIds: d.skillIds })),
  );
  const slim = (t: Awaited<ReturnType<typeof searchTrainers>>["matches"][number]) => ({
    id: t.id,
    full_name: t.full_name,
    title: t.title,
    total: t.total,
    tier: t.tier ? { name: t.tier.name, color: t.tier.color } : null,
    feedback: t.feedback.average,
    delivered: t.delivered,
    skills: t.skills.map((s) => s.name),
  });
  const days = perDay.map((r) => r.matches.map(slim));
  const common = input.sameTrainer ? days[0].filter((t) => days.every((list) => list.some((x) => x.id === t.id))) : [];
  return { days, common };
}

/* ---------- Request a training (trainer optional) ---------- */

export type NewRequest = {
  program_name: string;
  audience_id: string;
  function_id: string;
  industry_id: string;
  same_trainer: boolean;
  days: { day_number: number; date: string; start: string; end: string; location: string; content: string; trainer_id?: string }[];
};

type Filters = { audience_id: string; function_id: string; industry_id: string };
const dayError = (d: { day_number: number; date: string; start: string; end: string }) =>
  !DATE.test(d.date)
    ? `Pick a date for Day ${d.day_number}.`
    : !TIME.test(d.start) || !TIME.test(d.end) || d.end <= d.start
      ? `Check the time for Day ${d.day_number}.`
      : !slotsFor(d.start, d.end).length
        ? `Day ${d.day_number}: the time must fall within Morning (9 AM – 5 PM) or Evening (6 PM – 11 PM).`
        : null;

// Trainers free at that day and time who match the audience, function and industry.
async function freeTrainers(f: Filters, d: { date: string; start: string; end: string }) {
  const r = await searchTrainers({ date: d.date, start: d.start, end: d.end, audienceId: f.audience_id, functionId: f.function_id, industryId: f.industry_id, skillIds: [] });
  return r.matches.map((t) => ({ id: t.id, full_name: t.full_name, title: t.title }));
}

// Request page: the trainers Growth may pick for each day (only names, never the availability calendar).
export async function requestTrainerOptions(input: Filters & { days: { day_number: number; date: string; start: string; end: string }[] }) {
  await requireRole("growth", "admin", "approver");
  if (!input.audience_id || !input.function_id || !input.industry_id) return { error: "Pick the audience level, function and industry first." };
  for (const d of input.days) {
    const e = dayError(d);
    if (e) return { error: e };
  }
  return { days: await Promise.all(input.days.map((d) => freeTrainers(input, d))) };
}

export async function createRequest(input: NewRequest) {
  const me = await requireRole("growth", "admin", "approver");
  if (!input.program_name.trim()) return { error: "Enter the program name." };
  if (!input.audience_id || !input.function_id || !input.industry_id) return { error: "Pick the audience level, function and industry." };
  if (!input.days.length) return { error: "Add at least one training day." };
  for (const d of input.days) {
    const e = dayError(d);
    if (e) return { error: e };
    if (!d.content.trim()) return { error: `Describe the content for Day ${d.day_number}.` };
  }
  // Growth must choose the trainer for every day; admins and booking managers may leave days to assign later.
  const missing = input.days.find((d) => !d.trainer_id);
  if (me.role === "growth" && missing) return { error: `Choose a trainer for Day ${missing.day_number}.` };
  // A picked trainer must still be free and matching when the request is sent.
  for (const d of input.days) {
    if (d.trainer_id && !(await freeTrainers(input, d)).some((t) => t.id === d.trainer_id))
      return { error: `Day ${d.day_number}: that trainer is no longer available. Pick another or leave it to the booking team.` };
  }
  const batch = input.days.length > 1 ? randomUUID() : null;
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("bookings")
    .insert(
      input.days.map((d) => ({
        batch_id: batch,
        program_name: input.program_name.trim(),
        day_number: d.day_number,
        trainer_id: d.trainer_id || null,
        date: d.date,
        start_time: d.start,
        end_time: d.end,
        location: d.location.trim() || null,
        audience_id: input.audience_id,
        function_id: input.function_id,
        industry_id: input.industry_id,
        content: d.content.replace(/\r\n/g, "\n").trim(),
        status: d.trainer_id ? "awaiting_trainer" : "needs_trainer",
        decided_at: d.trainer_id ? now : null,
        same_trainer_pref: input.same_trainer && input.days.length > 1,
        created_by: me.id,
      })),
    )
    .select("id");
  if (error) return { error: friendlyError(error.message) };
  const rows = (await loadBookings(((data ?? []) as { id: string }[]).map((r) => r.id))).sort((a, b) => a.day_number - b.day_number);
  for (const b of rows) {
    await audit(me.id, "training_requested", b.id, { program: title(b), trainer: b.trainers?.full_name ?? null });
    if (b.trainer_id) await emailAssignment(b);
  }
  const open = rows.filter((b) => !b.trainer_id);
  const sameNote = input.same_trainer && open.length > 1;
  await notify((await usersWithRoles("admin", "approver")).filter((u) => u.id !== me.id), {
    title: open.length ? `Trainer needed: ${input.program_name}${rows.length > 1 ? ` (${open.length} of ${rows.length} days)` : ""}` : `New booking: ${input.program_name} — trainer emailed`,
    body: `${me.full_name} requested ${rows.map((b) => `${when(b)}${b.trainers ? ` (${b.trainers.full_name})` : ""}`).join("; ")}${sameNote ? " · same trainer preferred" : ""}`,
    link: `/bookings/${rows[0].id}`,
    email: {
      subject: open.length ? `Trainer needed: ${input.program_name}` : `New booking: ${input.program_name}`,
      intro: `<b>${esc(me.full_name)}</b> requested ${rows.length > 1 ? `${rows.length} training days` : "a training"}. ${
        open.length ? `Please assign a trainer${rows.length > open.length ? " for the days without one" : ""}.` : "The chosen trainer was emailed to confirm."
      }${sameNote ? " <b>Same trainer preferred for all days.</b>" : ""}`,
      rows: [
        ["Program", esc(input.program_name)],
        ...rows.map((b) => [`Day ${b.day_number}`, `${esc(when(b))}${b.location ? ` · ${esc(b.location)}` : ""} · ${b.trainers ? esc(b.trainers.full_name) : "<i>needs a trainer</i>"}`] as [string, string]),
        ["Audience", esc(rows[0].audience?.name ?? "")],
        ["Function", esc(rows[0].func?.name ?? "")],
        ["Industry", esc(rows[0].industry?.name ?? "")],
      ],
      content: rows.map((b) => `Day ${b.day_number}: ${b.content}`).join("\n\n"),
      button: open.length ? "Assign a trainer" : "View the training",
    },
  });
  refresh();
  return { ok: "Request sent. It's on the calendar and the booking team was notified.", ids: rows.map((b) => b.id) };
}

/* ---------- Assign a trainer to a request ---------- */

// Free, matching trainers for every day of a request (and, for multi-day requests, those free on all days).
export async function requestCandidates(bookingId: string) {
  await requireRole("admin", "approver");
  const [b] = await loadBookings([bookingId]);
  if (!b) return { error: "Request not found." };
  const days = b.batch_id ? (await loadBatch(b.batch_id)).filter((d) => d.status === "needs_trainer") : [b];
  const lists = await Promise.all(
    days.map((d) => searchTrainers({ date: d.date, start: d.start_time.slice(0, 5), end: d.end_time.slice(0, 5), audienceId: d.audience_id ?? "", functionId: d.function_id ?? "", industryId: d.industry_id ?? "", skillIds: d.skill_ids })),
  );
  const slim = (t: Awaited<ReturnType<typeof searchTrainers>>["matches"][number]) => ({
    id: t.id,
    full_name: t.full_name,
    total: t.total,
    tier: t.tier ? { name: t.tier.name, color: t.tier.color } : null,
    feedback: t.feedback.average,
    delivered: t.delivered,
  });
  const perDay = lists.map((l) => l.matches.map(slim));
  const common = perDay.length > 1 ? perDay[0].filter((t) => perDay.every((list) => list.some((x) => x.id === t.id))) : [];
  return { days: days.map((d, i) => ({ id: d.id, day_number: d.day_number, date: d.date, start: d.start_time, end: d.end_time, matches: perDay[i] })), common };
}

async function loadBatch(batchId: string) {
  const { data } = await db().from("bookings").select(BOOKING_SELECT).eq("batch_id", batchId).order("day_number");
  return (data ?? []) as BookingRow[];
}

export async function assignTrainer(assignments: { bookingId: string; trainerId: string }[]) {
  const me = await requireRole("admin", "approver");
  if (!assignments.length) return { error: "Choose a trainer." };
  const done: string[] = [];
  for (const a of assignments) {
    const { data, error } = await db()
      .from("bookings")
      .update({ trainer_id: a.trainerId, status: "awaiting_trainer", approver_id: me.id, decided_at: new Date().toISOString() })
      .eq("id", a.bookingId)
      .eq("status", "needs_trainer")
      .select("id");
    if (error || !data?.length) {
      // all-or-nothing: put back the days already assigned in this request
      if (done.length) await db().from("bookings").update({ trainer_id: null, status: "needs_trainer", approver_id: null, decided_at: null }).in("id", done);
      return { error: error ? friendlyError(error.message) : "This request was already handled. Refresh the page." };
    }
    done.push(a.bookingId);
  }
  const rows = (await loadBookings(done)).sort((a, b) => a.day_number - b.day_number);
  for (const b of rows) {
    await audit(me.id, "trainer_assigned", b.id, { program: title(b), trainer: b.trainers?.full_name });
    await emailAssignment(b);
  }
  await notify((await usersWithRoles("admin", "approver")).filter((u) => u.id !== me.id), {
    title: `${me.full_name} assigned ${[...new Set(rows.map((b) => b.trainers?.full_name))].join(", ")} to ${rows[0].program_name}`,
    body: rows.map((b) => `Day ${b.day_number}: ${b.trainers?.full_name}`).join(" · "),
    link: `/bookings/${rows[0].id}`,
  });
  refresh();
  return { ok: rows.length > 1 ? `Assigned ${rows.length} days. The trainer${new Set(rows.map((b) => b.trainer_id)).size > 1 ? "s were" : " was"} emailed to confirm.` : "Assigned. The trainer was emailed to confirm." };
}

/* ---------- Assignment email to the trainer ---------- */

async function emailAssignment(b: BookingRow) {
  const hours = (await getSetting("trainer_response", { hours: 48 })).hours;
  await notify([await trainerRecipient(b)], {
    title: `New training assigned: ${trainerTitle(b)}`,
    body: `${when(b)} · ${b.industry?.name ?? ""}. Please confirm.`,
    link: `/me/bookings/${b.id}`,
    email: {
      subject: `Training assignment — ${fmtDate(b.date, { weekday: "long", day: "numeric", month: "long" })}`,
      intro: `You have been booked to deliver a training for a client in the <b>${esc(b.industry?.name ?? "")}</b> industry on <b>${esc(fmtDate(b.date))}</b>, ${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}. Please review the details below and <b>confirm that you received this assignment</b> within ${hours} hours.`,
      rows: bookingRows(b, true),
      content: b.content,
      button: "Confirm the assignment",
      extra: `<p style="margin:0 0 16px;font-size:13px;color:#33415C">The calendar invite is attached. Open it to add this training to your calendar.</p>`,
      attachments: [{ filename: "meska-training.ics", content: trainingIcs(b, `${siteUrl()}/me/bookings/${b.id}`), contentType: "text/calendar; charset=utf-8; method=PUBLISH" }],
    },
  });
}

/* ---------- Trainer confirms or declines ---------- */

export async function respondBooking(id: string, accept: boolean, comment: string) {
  const me = await requireTrainer();
  const [b] = await loadBookings([id]);
  if (!b || b.trainer_id !== me.trainer_id) return { error: "Booking not found." };
  if (b.status !== "awaiting_trainer") return { error: "This booking no longer needs a response." };
  if (!accept && !comment.trim()) return { error: "Please tell us why you can't take it." };
  // A decline puts the training back to "Needs a trainer" so the booking team can reassign it.
  const { error } = await db()
    .from("bookings")
    .update(
      accept
        ? { status: "confirmed", trainer_comment: comment.trim() || null, trainer_responded_at: new Date().toISOString() }
        : { status: "needs_trainer", trainer_id: null, approver_id: null, decided_at: null, trainer_comment: `${me.full_name} declined: ${comment.trim()}`, trainer_responded_at: new Date().toISOString() },
    )
    .eq("id", id);
  if (error) return { error: friendlyError(error.message) };
  await audit(me.id, accept ? "booking_confirmed" : "booking_declined", id, { comment, program: title(b) });
  // The Growth member who requested the training is emailed when the trainer confirms.
  const requester = accept ? await userWithRole(b.created_by, "growth") : null;
  const recipients = (await usersWithRoles("approver", "admin")).filter((r) => r.id !== me.id && r.id !== requester?.id);
  if (requester && requester.id !== me.id) {
    await notify([requester], {
      title: `${me.full_name} confirmed ${title(b)}`,
      body: when(b),
      link: `/bookings/${id}`,
      email: {
        subject: `Trainer confirmed: ${title(b)}`,
        intro: `<b>${esc(me.full_name)}</b> confirmed the training you requested.`,
        rows: bookingRows(b),
        button: "View the training",
      },
    });
  }
  await notify(recipients, {
    title: accept ? `${me.full_name} confirmed ${title(b)}` : `${me.full_name} declined ${title(b)} — trainer needed`,
    body: accept ? when(b) : `Reason: ${comment.trim()}. It's back to “Needs a trainer”.`,
    link: `/bookings/${id}`,
    email: accept
      ? undefined
      : {
          subject: `Trainer declined: ${title(b)}`,
          intro: `<b>${esc(me.full_name)}</b> can't deliver this training. It's back to <b>Needs a trainer</b>; please assign someone else.`,
          rows: [...bookingRows(b), ["Reason", esc(comment.trim())]],
          button: "Assign another trainer",
        },
  });
  refresh();
  return { ok: accept ? "Thank you, the assignment is confirmed." : "Your response was sent." };
}

/* ---------- Edit ---------- */

function changeTable(changes: { field: string; from: string; to: string }[]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E1E7F1;border-radius:10px;border-collapse:separate;margin-bottom:18px">
<tr><td style="padding:8px 12px;font-size:11px;color:#5E6B82;text-transform:uppercase">What</td><td style="padding:8px 12px;font-size:11px;color:#5E6B82;text-transform:uppercase">Before</td><td style="padding:8px 12px;font-size:11px;color:#5E6B82;text-transform:uppercase">Now</td></tr>
${changes.map((c) => `<tr><td style="padding:8px 12px;border-top:1px solid #E1E7F1;font-size:13px">${esc(c.field)}</td><td style="padding:8px 12px;border-top:1px solid #E1E7F1;font-size:13px;color:#B9362F;text-decoration:line-through;white-space:pre-wrap">${esc(c.from)}</td><td style="padding:8px 12px;border-top:1px solid #E1E7F1;font-size:13px;color:#0E7C55;font-weight:600;white-space:pre-wrap">${esc(c.to)}</td></tr>`).join("")}
</table>`;
}

// Admins and booking managers can change any active training; Growth only their own requests still waiting for a trainer.
function mayChange(me: { id: string; role: string }, b: BookingRow) {
  if (me.role === "admin" || me.role === "approver") return true;
  return me.role === "growth" && b.status === "needs_trainer" && b.created_by === me.id;
}

export async function editBooking(fd: FormData) {
  const me = await requireRole("admin", "approver", "growth");
  const id = String(fd.get("id"));
  const [b] = await loadBookings([id]);
  if (!b || !mayChange(me, b)) return { error: "Booking not found." };
  if (!["needs_trainer", "pending_approval", "awaiting_trainer", "confirmed"].includes(b.status)) return { error: "Only active bookings can be edited." };
  const next = {
    program_name: String(fd.get("program_name") ?? "").trim(),
    day_number: Number(fd.get("day_number")),
    date: String(fd.get("date")),
    start_time: String(fd.get("start")),
    end_time: String(fd.get("end")),
    location: String(fd.get("location") ?? "").trim() || null,
    content: String(fd.get("content") ?? "").replace(/\r\n/g, "\n").trim(),
  };
  if (!next.program_name || !next.content) return { error: "Program name and content can't be empty." };
  if (!DATE.test(next.date) || !TIME.test(next.start_time) || !TIME.test(next.end_time) || next.end_time <= next.start_time) return { error: "Check the date and time." };

  const fields: [string, string, string][] = [
    ["Program", b.program_name, next.program_name],
    ["Day", String(b.day_number), String(next.day_number)],
    ["Date", fmtDate(b.date), fmtDate(next.date)],
    ["Time", `${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`, `${fmtTime(next.start_time)} – ${fmtTime(next.end_time)}`],
    ["Location", b.location ?? "—", next.location ?? "—"],
    ["Content", b.content, next.content],
  ];
  const changes = fields.filter(([, a, c]) => a !== c).map(([field, from, to]) => ({ field, from, to }));
  if (!changes.length) return { ok: "Nothing changed." };

  const { error } = await db().from("bookings").update(next).eq("id", id);
  if (error) return { error: friendlyError(error.message) };
  await audit(me.id, "booking_edited", id, { changes, program: title(b) });
  const [fresh] = await loadBookings([id]);

  const summary = changes.map((c) => `${c.field}: ${c.from} → ${c.to}`).join(" · ");
  const email = { subject: `Training updated: ${title(fresh)}`, intro: `<b>${esc(me.full_name)}</b> changed this training. Here's what's different:`, extra: changeTable(changes), rows: bookingRows(fresh) };
  // The trainer's copy leaves out the program name while it's still hidden from them.
  const forTrainer = programVisible(fresh) ? changes : changes.filter((c) => c.field !== "Program");
  if (fresh.trainer_id && forTrainer.length) {
    await notify([await trainerRecipient(fresh)], {
      title: `Training updated: ${trainerTitle(fresh)}`,
      body: forTrainer.map((c) => `${c.field}: ${c.from} → ${c.to}`).join(" · "),
      link: `/me/bookings/${id}`,
      email: { subject: `Training updated — ${fmtDate(fresh.date, { weekday: "long", day: "numeric", month: "long" })}`, intro: email.intro, extra: changeTable(forTrainer), rows: bookingRows(fresh, true) },
    });
  }
  await notify((await usersWithRoles("admin", "approver")).filter((u) => u.id !== me.id), { title: `Training updated: ${title(fresh)}`, body: summary, link: `/bookings/${id}`, email });
  refresh();
  revalidatePath(`/bookings/${id}`);
  return { ok: fresh.trainer_id ? "Saved. The trainer, admins and booking managers were notified of the changes." : "Saved. Admins and booking managers were notified of the changes." };
}

/* ---------- Cancel ---------- */

export async function cancelBooking(fd: FormData) {
  const me = await requireRole("admin", "approver", "growth");
  const id = String(fd.get("id"));
  const reason = String(fd.get("reason") ?? "").replace(/\r\n/g, "\n").trim();
  const [b] = await loadBookings([id]);
  if (!b || !mayChange(me, b)) return { error: "Booking not found." };
  if (!["needs_trainer", "pending_approval", "awaiting_trainer", "confirmed"].includes(b.status)) return { error: "This booking is not active." };
  const rule = await getSetting("cancellation", { notice_hours: 48, min_reason_chars: 150 });
  const hoursLeft = (cairoStart(b.date, b.start_time).getTime() - Date.now()) / 3_600_000;
  const shortNotice = hoursLeft < rule.notice_hours;
  if (shortNotice && reason.length < rule.min_reason_chars)
    return { error: `This training starts in under ${rule.notice_hours} hours, so a detailed reason is required (at least ${rule.min_reason_chars} characters; you wrote ${reason.length}).` };
  if (!shortNotice && reason.length < 10) return { error: "Please add a short reason for the cancellation." };
  const { error } = await db().from("bookings").update({ status: "cancelled", cancel_reason: reason, cancelled_by: me.id, cancelled_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: friendlyError(error.message) };
  await audit(me.id, "booking_cancelled", id, { reason, short_notice: shortNotice, hours_before: Math.round(hoursLeft), program: title(b) });
  // The trainer only hears that it was cancelled; the reason goes to the admin and the log.
  if (b.trainer_id) {
    await notify([await trainerRecipient(b)], {
      title: `Training cancelled: ${trainerTitle(b)}`,
      body: when(b),
      link: `/me/bookings`,
      email: { subject: `Training cancelled — ${fmtDate(b.date, { weekday: "long", day: "numeric", month: "long" })}`, intro: "The following training has been cancelled. The slot is free again in your calendar.", rows: bookingRows({ ...b, status: "cancelled" }, true) },
    });
  }
  await notify(await usersWithRoles("admin"), {
    title: `${shortNotice ? "Short-notice cancellation" : "Cancelled"}: ${title(b)}`,
    body: `${me.full_name}: ${reason}`,
    link: `/admin/logs?only=cancellations`,
  });
  refresh();
  revalidatePath(`/bookings/${id}`);
  return { ok: "Cancelled. The trainer was notified and the reason is in the activity log." };
}

/* ---------- Materials ---------- */

export async function createMaterialUpload(bookingId: string, fileName: string) {
  await requireRole("admin");
  const safe = fileName.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const path = `${bookingId}/${Date.now()}-${safe}`;
  const { data, error } = await db().storage.from("materials").createSignedUploadUrl(path);
  if (error) return { error: error.message };
  return { path, token: data.token };
}

export async function recordMaterial(bookingId: string, path: string, fileName: string, size: number) {
  const me = await requireRole("admin");
  if (!path.startsWith(bookingId + "/")) return { error: "Invalid upload." };
  await db().from("booking_materials").insert({ booking_id: bookingId, file_path: path, file_name: fileName, size_bytes: size, uploaded_by: me.id });
  const [b] = await loadBookings([bookingId]);
  await audit(me.id, "material_uploaded", bookingId, { file: fileName, program: title(b) });
  if (b && ["awaiting_trainer", "confirmed"].includes(b.status)) {
    await notify([await trainerRecipient(b)], {
      title: `New material for ${trainerTitle(b)}`,
      body: fileName,
      link: `/me/bookings/${bookingId}`,
      email: { subject: `Training material uploaded — ${fmtDate(b.date, { day: "numeric", month: "long" })}`, intro: `New material is ready for your training on <b>${esc(fmtDate(b.date))}</b>: <b>${esc(fileName)}</b>.`, rows: bookingRows(b, true), button: "Download the material" },
    });
  }
  revalidatePath(`/bookings/${bookingId}`);
  return { ok: `Uploaded ${fileName}.` };
}

export async function deleteMaterial(fd: FormData) {
  await requireRole("admin");
  const id = String(fd.get("id"));
  const { data } = await db().from("booking_materials").select("*").eq("id", id).single();
  const m = data as { file_path: string; booking_id: string };
  await db().storage.from("materials").remove([m.file_path]);
  await db().from("booking_materials").delete().eq("id", id);
  revalidatePath(`/bookings/${m.booking_id}`);
}

export async function materialLink(id: string) {
  const me = await requireUser();
  const { data } = await db().from("booking_materials").select("file_path, file_name, bookings(trainer_id)").eq("id", id).single();
  const m = data as unknown as { file_path: string; file_name: string; bookings: { trainer_id: string } };
  if (!m) return { error: "File not found." };
  if (me.role === "trainer" && m.bookings.trainer_id !== me.trainer_id) return { error: "File not found." };
  const { data: s, error } = await db().storage.from("materials").createSignedUrl(m.file_path, 300, { download: m.file_name });
  if (error) return { error: error.message };
  return { url: s.signedUrl };
}

/* ---------- Trainer brief after the training ---------- */

async function ownConfirmedPast(bookingId: string) {
  const me = await requireTrainer();
  const [b] = await loadBookings([bookingId]);
  if (!b || b.trainer_id !== me.trainer_id) return { me, error: "Training not found." } as const;
  if (b.status !== "confirmed") return { me, error: "A brief can only be added to a confirmed training." } as const;
  if (b.date > new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" })) return { me, error: "You can add the brief once the training day has started." } as const;
  return { me, b } as const;
}

export async function createBriefUpload(bookingId: string, fileName: string) {
  const r = await ownConfirmedPast(bookingId);
  if ("error" in r) return { error: r.error };
  const safe = fileName.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const path = `${bookingId}/brief-${Date.now()}-${safe}`;
  const { data, error } = await db().storage.from("materials").createSignedUploadUrl(path);
  if (error) return { error: error.message };
  return { path, token: data.token };
}

export async function recordBriefFile(bookingId: string, path: string, fileName: string, size: number) {
  const r = await ownConfirmedPast(bookingId);
  if ("error" in r) return { error: r.error };
  if (!path.startsWith(`${bookingId}/brief-`)) return { error: "Invalid upload." };
  await db().from("booking_materials").insert({ booking_id: bookingId, file_path: path, file_name: fileName, size_bytes: size, uploaded_by: r.me.id, kind: "brief" });
  revalidatePath(`/me/bookings/${bookingId}`);
  return { ok: `Attached ${fileName}.` };
}

export async function submitBrief(bookingId: string, text: string) {
  const r = await ownConfirmedPast(bookingId);
  if ("error" in r) return { error: r.error };
  const brief = text.replace(/\r\n/g, "\n").trim();
  const { count } = await db().from("booking_materials").select("id", { count: "exact", head: true }).eq("booking_id", bookingId).eq("kind", "brief");
  if (!brief && !count) return { error: "The brief is required: write it or attach a document before marking the training as finished." };
  const first = !r.b.finished_at;
  const now = new Date().toISOString();
  // Submitting the brief is what marks the training day as finished.
  await db().from("bookings").update({ brief: brief || null, brief_submitted_at: now, finished_at: r.b.finished_at ?? now }).eq("id", bookingId);
  await audit(r.me.id, "brief_submitted", bookingId, { program: title(r.b) });
  await notify(await usersWithRoles("admin", "approver"), {
    title: `${first ? "Training finished" : "Brief updated"}: ${title(r.b)}`,
    body: `${r.me.full_name}${brief ? `: ${brief.slice(0, 140)}${brief.length > 140 ? "…" : ""}` : " attached a document."}`,
    link: `/bookings/${bookingId}`,
    email: {
      subject: `${first ? "Training finished" : "Brief updated"}: ${title(r.b)}`,
      intro: `<b>${esc(r.me.full_name)}</b> ${first ? "marked this training as finished and submitted the brief" : "updated the brief"}.`,
      rows: [...bookingRows(r.b), ...(count ? [["Attachments", `${count} document${count > 1 ? "s" : ""}`] as [string, string]] : [])],
      content: brief || undefined,
      button: "Read the brief",
    },
  });
  revalidatePath(`/me/bookings/${bookingId}`);
  revalidatePath(`/bookings/${bookingId}`);
  return { ok: first ? "Training marked as finished. Thank you, your brief was sent to the team." : "Brief updated and the team was notified." };
}
