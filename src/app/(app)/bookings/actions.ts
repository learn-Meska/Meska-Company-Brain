"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { can, requireAccess, requireRole, requireTrainer, requireUser, type CurrentUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { esc, siteUrl } from "@/lib/email";
import { trainingIcs } from "@/lib/ics";
import { cairoStart, fmtDate, fmtTime, friendlyError, isUuid, programVisible, slotsFor, todayISO, trainerTitle } from "@/lib/format";
import { searchTrainers } from "@/lib/search";
import { getSetting } from "@/lib/scoring";
import { checkAudioFile, checkFile, isAudioPath, safeName } from "@/lib/files";
import { audit, BOOKING_SELECT, bookingRows, notify, trainerRecipient, usersWithRoles, type BookingRow } from "@/lib/notify";
import { trainingTeam } from "@/lib/team";
import {
  contactError,
  contactFields,
  DATE,
  dayError,
  dealTotal,
  fmtAmount,
  PAST_DATE,
  participantRows,
  proposalFileError,
  requestError,
  TIME,
  type NewRequest,
} from "@/lib/deal";

async function loadBookings(ids: string[]) {
  const valid = ids.filter(isUuid);
  if (!valid.length) return [];
  const { data } = await db().from("bookings").select(BOOKING_SELECT).in("id", valid);
  return (data ?? []) as BookingRow[];
}

const ACTIVE = ["needs_trainer", "pending_approval", "awaiting_trainer", "confirmed"];


function refresh() {
  for (const p of ["/bookings", "/calendar", "/dashboard", "/me", "/me/bookings", "/me/availability"]) revalidatePath(p);
}

const title = (b: BookingRow) => `${b.program_name} — Day ${b.day_number}`;
const when = (b: BookingRow) => `${fmtDate(b.date, { weekday: "short", day: "numeric", month: "short" })}, ${fmtTime(b.start_time)}–${fmtTime(b.end_time)}`;

/* ---------- Search ---------- */

export type DayQuery = { date: string; start: string; end: string; skillIds: string[] };

// Growth: check availability for several days at once, each with its own content (skills).
// With sameTrainer, only trainers free and matching on every day are returned.
export async function findForDays(input: { audienceId: string; industryId: string; sameTrainer: boolean; days: DayQuery[] }) {
  await requireAccess("te.find", "te.assign");
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

/* ---------- New deal: request a training (trainer optional for the booking team) ---------- */

// Active trainers free at that day and time. For now a New deal matches on availability only: no industry,
// audience level, function or skill filter (the audience is the uploaded participant list).
async function freeTrainers(d: { date: string; start: string; end: string }) {
  const r = await searchTrainers({ date: d.date, start: d.start, end: d.end, audienceId: "", functionId: "", industryId: "", skillIds: [] });
  return r.matches.map((t) => ({ id: t.id, full_name: t.full_name, title: t.title }));
}

// Request page: the trainers Growth may pick for each day (only names, never the availability calendar).
export async function requestTrainerOptions(input: { days: { day_number: number; date: string; start: string; end: string }[] }) {
  await requireAccess("growth.new_deal", "te.assign");
  if (!Array.isArray(input?.days)) return { error: "Add at least one training day." };
  for (const d of input.days) {
    const e = dayError(d);
    if (e) return { error: e };
  }
  return { days: await Promise.all(input.days.map((d) => freeTrainers(d))) };
}

// Step 3: a one-time URL to upload the proposal straight to storage, under the uploader's own folder.
export async function createProposalUpload(fileName: string, size: number) {
  const me = await requireAccess("growth.new_deal", "te.assign");
  const bad = proposalFileError(fileName, size);
  if (bad) return { error: bad };
  const path = `${me.id}/${randomUUID()}-${safeName(fileName)}`;
  const { data, error } = await db().storage.from("proposals").createSignedUploadUrl(path);
  if (error) return { error: error.message };
  return { path, token: data.token };
}

export async function createRequest(input: NewRequest) {
  const me = await requireAccess("growth.new_deal", "te.assign");
  const invalid = requestError(input, { role: me.role, userId: me.id, today: todayISO() });
  if (invalid) return { error: invalid };
  // A picked trainer must still be free and matching when the request is sent, and the proposal must really be
  // in storage (the browser uploads it first). All days are checked at once.
  const picked = input.days.filter((d) => d.trainer_id);
  const [free, { error: missingFile }] = await Promise.all([
    Promise.all(picked.map((d) => freeTrainers(d))),
    db().storage.from("proposals").createSignedUrl(input.proposal.path, 60),
  ]);
  const gone = picked.find((d, i) => !free[i].some((t) => t.id === d.trainer_id));
  if (gone) return { error: `Day ${gone.day_number}: that trainer is no longer available. Pick another or leave it to Training Excellence.` };
  if (missingFile) return { error: "The proposal didn't finish uploading. Upload it again." };

  const programName = input.program_name.trim();
  const valuePerDay = Number(input.value_per_day);
  const dealDays = Number(input.deal_days);
  const { data: deal, error: dealErr } = await db()
    .from("deals")
    .insert({
      company_name: input.company_name.trim(),
      value_per_day: valuePerDay,
      days: dealDays,
      proposal_path: input.proposal.path,
      proposal_name: String(input.proposal.name).slice(0, 200),
      proposal_size: Number.isFinite(Number(input.proposal.size)) ? Number(input.proposal.size) : null,
      created_by: me.id,
    })
    .select("id")
    .single();
  if (dealErr || !deal) return { error: friendlyError(dealErr?.message ?? "Could not save the deal.") };
  const dealId = (deal as { id: string }).id;
  // Anything that fails after this point removes the deal again (its participants go with it).
  const undo = () => db().from("deals").delete().eq("id", dealId);
  const { error: partErr } = await db().from("deal_participants").insert(participantRows(dealId, input.participants));
  if (partErr) {
    await undo();
    return { error: friendlyError(partErr.message) };
  }

  const batch = input.days.length > 1 ? randomUUID() : null;
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("bookings")
    .insert(
      input.days.map((d) => ({
        batch_id: batch,
        deal_id: dealId,
        program_name: programName,
        day_number: d.day_number,
        trainer_id: d.trainer_id || null,
        date: d.date,
        start_time: d.start,
        end_time: d.end,
        location: d.location.trim() || null,
        ...contactFields(input.contact),
        audience_id: null,
        function_id: null,
        industry_id: input.industry_id,
        // the column is NOT NULL; a New deal has no per-day content (the booking team can add it when editing a day)
        content: "",
        status: d.trainer_id ? "awaiting_trainer" : "needs_trainer",
        decided_at: d.trainer_id ? now : null,
        same_trainer_pref: input.same_trainer && input.days.length > 1,
        created_by: me.id,
      })),
    )
    .select("id");
  if (error) {
    await undo();
    return { error: friendlyError(error.message) };
  }
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  const rows = (await loadBookings(ids)).sort((a, b) => a.day_number - b.day_number);
  // The request is saved; if it can't be re-read, don't report a failure (that would invite a duplicate).
  if (!rows.length) {
    refresh();
    return { ok: "Request sent. It's on the calendar.", ids };
  }
  const total = dealTotal(valuePerDay, dealDays);
  // The request is saved. Audit, bell and emails run after the answer goes back, so sending through Gmail
  // (about a second per email) never keeps Growth waiting. sendEmail still logs every message to email_outbox.
  after(async () => {
    try {
      for (const b of rows) {
        await audit(me.id, "training_requested", b.id, { program: title(b), trainer: b.trainers?.full_name ?? null, deal: dealId, value_per_day: valuePerDay, days: dealDays, participants: input.participants.length });
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
            ["Company", esc(input.company_name.trim())],
            ["Program", esc(input.program_name)],
            ["Client contact", `${esc(input.contact.name)} · ${esc(input.contact.email)} · ${esc(input.contact.mobile)}`],
            ...rows.map((b) => [`Day ${b.day_number}`, `${esc(when(b))}${b.location ? ` · ${esc(b.location)}` : ""} · ${b.trainers ? esc(b.trainers.full_name) : "<i>needs a trainer</i>"}`] as [string, string]),
            ["Industry", esc(rows[0].industry?.name ?? "")],
            ["Participants", String(input.participants.length)],
            ["Deal value", `${fmtAmount(valuePerDay)} per day × ${dealDays} ${dealDays === 1 ? "day" : "days"} = <b>${fmtAmount(total)}</b>`],
            ["Proposal", esc(input.proposal.name)],
          ],
          button: open.length ? "Assign a trainer" : "View the training",
        },
      });
      // The content team gets the request too: they read the audience and proposal, then write the content.
      await notify(await usersWithRoles("content"), {
        title: `New content request: ${input.company_name.trim()} — ${input.program_name}`,
        body: `${me.full_name} sent a deal of ${rows.length} ${rows.length === 1 ? "day" : "days"}. Open it to see the audience and proposal.`,
        link: `/content/${dealId}`,
        email: {
          subject: `Content request: ${input.company_name.trim()} — ${input.program_name}`,
          intro: `<b>${esc(me.full_name)}</b> sent a new deal. Please read the audience and proposal, prepare the content and upload it, then submit it so the trainer can use it.`,
          rows: [
            ["Company", esc(input.company_name.trim())],
            ["Program", esc(input.program_name)],
            ["Days", String(rows.length)],
            ["Participants", String(input.participants.length)],
          ],
          button: "Open the request",
        },
      });
    } catch (e) {
      console.error("[createRequest notify]", e instanceof Error ? e.message : e);
    }
  });
  refresh();
  return { ok: "Request sent. It's on the calendar and Training Excellence was notified.", ids: rows.map((b) => b.id) };
}

/* ---------- Assign a trainer to a request ---------- */

// Free, matching trainers for every day of a request (and, for multi-day requests, those free on all days).
export async function requestCandidates(bookingId: string) {
  await requireAccess("te.assign");
  const [b] = await loadBookings([bookingId]);
  if (!b) return { error: "Request not found." };
  // Days that already went by can't be assigned, so a training reassigned partway only asks for the days left.
  const days = b.batch_id ? (await loadBatch(b.batch_id)).filter((d) => d.status === "needs_trainer" && d.date >= todayISO()) : [b];
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
  const me = await requireAccess("te.assign");
  if (!assignments.length) return { error: "Choose a trainer." };
  if (!assignments.every((a) => isUuid(a.bookingId) && isUuid(a.trainerId))) return { error: "Choose a trainer." };
  if (new Set(assignments.map((a) => a.bookingId)).size !== assignments.length) return { error: "Each day can only get one trainer." };
  const targets = await loadBookings(assignments.map((a) => a.bookingId));
  if (targets.some((b) => b.date < todayISO())) return { error: PAST_DATE + " Change the date first." };
  const done: string[] = [];
  for (const a of assignments) {
    // A fresh assignment starts clean: no reminder sent yet and no comment from a previous trainer.
    const { data, error } = await db()
      .from("bookings")
      .update({ trainer_id: a.trainerId, status: "awaiting_trainer", approver_id: me.id, decided_at: new Date().toISOString(), reminder_sent_at: null, trainer_comment: null, trainer_responded_at: null })
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
  const names = [...new Set(rows.map((b) => b.trainers?.full_name))].join(", ");
  await notify(await trainingTeam(rows[0], me.id), {
    title: `${me.full_name} assigned ${names} to ${rows[0].program_name}`,
    body: rows.map((b) => `Day ${b.day_number}: ${b.trainers?.full_name}`).join(" · "),
    link: `/bookings/${rows[0].id}`,
    email: {
      subject: `Trainer assigned: ${rows[0].program_name}`,
      intro: `<b>${esc(me.full_name)}</b> assigned <b>${esc(names)}</b>. The trainer was emailed to confirm.`,
      rows: rows.map((b) => [`Day ${b.day_number}`, `${esc(when(b))}${b.location ? ` · ${esc(b.location)}` : ""} · ${esc(b.trainers?.full_name ?? "")}`] as [string, string]),
      button: "View the training",
    },
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
      content: b.content || undefined,
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
  if (comment.length > 2000) return { error: "Please keep the comment under 2,000 characters." };
  // A decline puts the training back to "Needs a trainer" so the booking team can reassign it.
  // The status/trainer guard makes a second click, or a cancellation in between, a no-op.
  const { data: changed, error } = await db()
    .from("bookings")
    .update(
      accept
        ? { status: "confirmed", trainer_comment: comment.trim() || null, trainer_responded_at: new Date().toISOString() }
        : { status: "needs_trainer", trainer_id: null, approver_id: null, decided_at: null, reminder_sent_at: null, trainer_comment: `${me.full_name} declined: ${comment.trim()}`, trainer_responded_at: new Date().toISOString() },
    )
    .eq("id", id)
    .eq("status", "awaiting_trainer")
    .eq("trainer_id", me.trainer_id)
    .select("id");
  if (error) return { error: friendlyError(error.message) };
  if (!changed?.length) return { error: "This booking no longer needs a response." };
  await audit(me.id, accept ? "booking_confirmed" : "booking_declined", id, { comment, program: title(b) });
  // Everyone on the training hears the answer: Training Excellence, admins, the Growth requester and the content team.
  const status = accept ? "confirmed" : "needs_trainer";
  await notify(await trainingTeam(b, me.id), {
    title: accept ? `${me.full_name} confirmed ${title(b)}` : `${me.full_name} declined ${title(b)} — trainer needed`,
    body: accept ? when(b) : `Reason: ${comment.trim()}. It's back to “Needs a trainer”.`,
    link: `/bookings/${id}`,
    email: accept
      ? {
          subject: `Trainer confirmed: ${title(b)}`,
          intro: `<b>${esc(me.full_name)}</b> confirmed this training.`,
          rows: [...bookingRows({ ...b, status }), ...(comment.trim() ? [["Comment", esc(comment.trim())] as [string, string]] : [])],
          button: "View the training",
        }
      : {
          subject: `Trainer declined: ${title(b)}`,
          intro: `<b>${esc(me.full_name)}</b> can't deliver this training. It's back to <b>Needs a trainer</b>; Training Excellence will assign someone else.`,
          rows: [...bookingRows({ ...b, status }), ["Reason", esc(comment.trim())]],
          button: "View the training",
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

// Training Excellence with the access can change (or cancel) any active training; Growth with "Send new deals"
// only their own requests until the trainer confirms.
const GROWTH_EDITABLE = ["needs_trainer", "awaiting_trainer"];
function mayChange(me: CurrentUser, b: BookingRow, access: "te.edit" | "te.cancel") {
  if (can(me, access)) return true;
  return can(me, "growth.new_deal") && GROWTH_EDITABLE.includes(b.status) && b.created_by === me.id;
}

export async function editBooking(fd: FormData) {
  const me = await requireRole("admin", "approver", "growth");
  const id = String(fd.get("id"));
  const [b] = await loadBookings([id]);
  if (!b || !mayChange(me, b, "te.edit")) return { error: "Booking not found." };
  if (!ACTIVE.includes(b.status)) return { error: "Only active bookings can be edited." };
  const next = {
    program_name: String(fd.get("program_name") ?? "").trim(),
    day_number: Number(fd.get("day_number")),
    date: String(fd.get("date")),
    start_time: String(fd.get("start")),
    end_time: String(fd.get("end")),
    location: String(fd.get("location") ?? "").trim() || null,
    content: String(fd.get("content") ?? "").replace(/\r\n/g, "\n").trim(),
  };
  if (!next.program_name) return { error: "The program name can't be empty." };
  if (!Number.isInteger(next.day_number) || next.day_number < 1) return { error: "The day number must be 1 or more." };
  if (!DATE.test(next.date) || !TIME.test(next.start_time) || !TIME.test(next.end_time) || next.end_time <= next.start_time) return { error: "Check the date and time." };
  if (!slotsFor(next.start_time, next.end_time).length) return { error: "The time must fall within Morning (9 AM – 5 PM) or Evening (6 PM – 11 PM)." };
  if (next.date !== b.date && next.date < todayISO()) return { error: PAST_DATE };

  const fields: [string, string, string][] = [
    ["Program", b.program_name, next.program_name],
    ["Day", String(b.day_number), String(next.day_number)],
    ["Date", fmtDate(b.date), fmtDate(next.date)],
    ["Time", `${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`, `${fmtTime(next.start_time)} – ${fmtTime(next.end_time)}`],
    ["Location", b.location ?? "—", next.location ?? "—"],
    ["Content", b.content || "—", next.content || "—"],
  ];
  const changes = fields.filter(([, a, c]) => a !== c).map(([field, from, to]) => ({ field, from, to }));
  if (!changes.length) return { ok: "Nothing changed." };

  // Only if nothing changed underneath (e.g. a trainer was assigned while Growth was editing).
  let q = db().from("bookings").update(next).eq("id", id).eq("status", b.status);
  q = b.trainer_id ? q.eq("trainer_id", b.trainer_id) : q.is("trainer_id", null);
  const { data: saved, error } = await q.select("id");
  if (error) return { error: friendlyError(error.message) };
  if (!saved?.length) return { error: "This booking changed while you were editing. Refresh the page and try again." };
  await audit(me.id, "booking_edited", id, { changes, program: title(b) });
  const [fresh] = await loadBookings([id]);
  if (!fresh) return { ok: "Saved." };

  const summary = changes.map((c) => `${c.field}: ${c.from} → ${c.to}`).join(" · ");
  const email = { subject: `Training updated: ${title(fresh)}`, intro: `<b>${esc(me.full_name)}</b> changed this training. Here's what's different:`, extra: changeTable(changes), rows: bookingRows(fresh) };
  // The trainer's copy leaves out the program name while it's still hidden from them.
  const forTrainer = programVisible(fresh) ? changes : changes.filter((c) => c.field !== "Program");
  if (fresh.trainer_id && forTrainer.length) {
    await notify([await trainerRecipient(fresh)], {
      title: `Training updated: ${trainerTitle(fresh)}`,
      body: forTrainer.map((c) => `${c.field}: ${c.from} → ${c.to}`).join(" · "),
      link: `/me/bookings/${id}`,
      email: {
        subject: `Training updated — ${fmtDate(fresh.date, { weekday: "long", day: "numeric", month: "long" })}`,
        intro: email.intro,
        extra: changeTable(forTrainer),
        rows: bookingRows(fresh, true),
        // the updated invite replaces the one they already added to their calendar
        attachments: [{ filename: "meska-training.ics", content: trainingIcs(fresh, `${siteUrl()}/me/bookings/${id}`), contentType: "text/calendar; charset=utf-8; method=PUBLISH" }],
      },
    });
  }
  await notify(await trainingTeam(fresh, me.id), { title: `Training updated: ${title(fresh)}`, body: summary, link: `/bookings/${id}`, email });
  refresh();
  revalidatePath(`/bookings/${id}`);
  return { ok: fresh.trainer_id ? "Saved. The trainer and the team were notified of the changes." : "Saved. The team was notified of the changes." };
}

/* ---------- Client contact (whole request) ---------- */

// The booking team, or the Growth member who made the request, can correct the client contact for every day of it.
export async function updateContact(fd: FormData) {
  const me = await requireRole("admin", "approver", "growth");
  const id = String(fd.get("id"));
  const [b] = await loadBookings([id]);
  if (!b || !(can(me, "te.edit") || (can(me, "growth.new_deal") && b.created_by === me.id))) return { error: "Booking not found." };
  const c = { name: String(fd.get("contact_name") ?? ""), email: String(fd.get("contact_email") ?? ""), mobile: String(fd.get("contact_mobile") ?? "") };
  const ce = contactError(c);
  if (ce) return { error: ce };
  const q = db().from("bookings").update(contactFields(c));
  const { error } = await (b.batch_id ? q.eq("batch_id", b.batch_id) : q.eq("id", id));
  if (error) return { error: friendlyError(error.message) };
  await audit(me.id, "client_contact_updated", id, { program: b.program_name, contact: contactFields(c) });
  const contactLine = `${esc(c.name.trim())} · ${esc(c.email.trim())} · ${esc(c.mobile.trim())}`;
  await notify(await trainingTeam(b, me.id), {
    title: `Client contact updated: ${b.program_name}`,
    body: `${c.name.trim()} · ${c.email.trim()} · ${c.mobile.trim()}`,
    link: `/bookings/${id}`,
    email: {
      subject: `Client contact updated: ${b.program_name}`,
      intro: `<b>${esc(me.full_name)}</b> updated the client contact for this training.`,
      rows: [["Program", esc(b.program_name)], ["Client contact", contactLine]],
      button: "View the training",
    },
  });
  revalidatePath(`/bookings/${id}`);
  return { ok: b.batch_id ? "Client contact saved for every day of this request." : "Client contact saved." };
}

/* ---------- Cancel ---------- */

export async function cancelBooking(fd: FormData) {
  const me = await requireRole("admin", "approver", "growth");
  const id = String(fd.get("id"));
  const reason = String(fd.get("reason") ?? "").replace(/\r\n/g, "\n").trim();
  const [b] = await loadBookings([id]);
  if (!b || !mayChange(me, b, "te.cancel")) return { error: "Booking not found." };
  const r = await cancelDay(me, b, reason);
  if ("error" in r) return r;
  await notifyCancelled(me, [r]);
  refresh();
  revalidatePath(`/bookings/${id}`);
  return { ok: "Cancelled. The trainer and the team were notified, and the reason is in the activity log." };
}

type Canceller = { id: string; full_name: string };
type CancelledDay = { b: BookingRow; reason: string; shortNotice: boolean };

// Cancels one day and tells its trainer. The team is told once for all the days (notifyCancelled).
async function cancelDay(me: Canceller, b: BookingRow, reason: string): Promise<CancelledDay | { error: string }> {
  const id = b.id;
  if (!ACTIVE.includes(b.status)) return { error: "This booking is not active." };
  const rule = await getSetting("cancellation", { notice_hours: 48, min_reason_chars: 150 });
  const hoursLeft = (cairoStart(b.date, b.start_time).getTime() - Date.now()) / 3_600_000;
  const shortNotice = hoursLeft < rule.notice_hours;
  if (shortNotice && reason.length < rule.min_reason_chars)
    return { error: `This training starts in under ${rule.notice_hours} hours, so a detailed reason is required (at least ${rule.min_reason_chars} characters; you wrote ${reason.length}).` };
  if (!shortNotice && reason.length < 10) return { error: "Please add a short reason for the cancellation." };
  // Guarded on the state that was checked, so a double submit or a concurrent assignment can't slip through.
  let q = db().from("bookings").update({ status: "cancelled", cancel_reason: reason, cancelled_by: me.id, cancelled_at: new Date().toISOString() }).eq("id", id).eq("status", b.status);
  q = b.trainer_id ? q.eq("trainer_id", b.trainer_id) : q.is("trainer_id", null);
  const { data: cancelled, error } = await q.select("id");
  if (error) return { error: friendlyError(error.message) };
  if (!cancelled?.length) return { error: "This booking changed in the meantime. Refresh the page and try again." };
  await audit(me.id, "booking_cancelled", id, { reason, short_notice: shortNotice, hours_before: Math.round(hoursLeft), program: title(b) });
  // The trainer only hears that it was cancelled; the reason goes to the team and the log.
  if (b.trainer_id) {
    await notify([await trainerRecipient(b)], {
      title: `Training cancelled: ${trainerTitle(b)}`,
      body: when(b),
      link: `/me/bookings`,
      email: {
        subject: `Training cancelled — ${fmtDate(b.date, { weekday: "long", day: "numeric", month: "long" })}`,
        intro: "The following training has been cancelled. The slot is free again in your calendar.",
        rows: bookingRows({ ...b, status: "cancelled" }, true),
        // opening it removes the event from their calendar
        attachments: [{ filename: "meska-training-cancelled.ics", content: trainingIcs(b, `${siteUrl()}/me/bookings`, true), contentType: "text/calendar; charset=utf-8; method=CANCEL" }],
      },
    });
  }
  return { b, reason, shortNotice };
}

// One message to everyone on the training (admins, Training Excellence, the Growth requester, the content team),
// with the reason, however many days were cancelled.
async function notifyCancelled(me: Canceller, days: CancelledDay[]) {
  if (!days.length) return;
  const first = days[0].b;
  const shortNotice = days.some((d) => d.shortNotice);
  const label = days.length > 1 ? `${first.program_name} (${days.length} days)` : title(first);
  const hadTrainer = days.some((d) => d.b.trainer_id);
  await notify(await trainingTeam(first, me.id), {
    title: `${shortNotice ? "Short-notice cancellation" : "Training cancelled"}: ${label}`,
    body: `${me.full_name}: ${days[0].reason}`,
    link: `/bookings/${first.id}`,
    email: {
      subject: `Training cancelled: ${label}`,
      intro: `<b>${esc(me.full_name)}</b> cancelled ${days.length > 1 ? `${days.length} days of this training` : "this training"}${shortNotice ? " at short notice" : ""}.${hadTrainer ? " The trainer was told." : ""}`,
      rows: [
        ["Program", esc(first.program_name)],
        ...days.map((d) => [`Day ${d.b.day_number}`, `${esc(when(d.b))}${d.b.trainers ? ` · ${esc(d.b.trainers.full_name)}` : ""}`] as [string, string]),
        ["Reason", esc(days[0].reason)],
      ],
      button: "View the training",
    },
  });
}

/* ---------- Materials ---------- */

export async function createMaterialUpload(bookingId: string, fileName: string) {
  await requireRole("admin");
  if (!(await loadBookings([bookingId])).length) return { error: "Booking not found." };
  const bad = checkFile(fileName);
  if (bad) return { error: bad };
  const safe = safeName(fileName);
  const path = `${bookingId}/${Date.now()}-${safe}`;
  const { data, error } = await db().storage.from("materials").createSignedUploadUrl(path);
  if (error) return { error: error.message };
  return { path, token: data.token };
}

export async function recordMaterial(bookingId: string, path: string, fileName: string, size: number) {
  const me = await requireRole("admin");
  const [b] = await loadBookings([bookingId]);
  if (!b) return { error: "Booking not found." };
  if (!path.startsWith(bookingId + "/") || path.includes("..") || path.slice(bookingId.length + 1).startsWith("brief-")) return { error: "Invalid upload." };
  if (checkFile(path)) return { error: "Invalid upload." };
  const { error } = await db().from("booking_materials").insert({ booking_id: bookingId, file_path: path, file_name: fileName.slice(0, 200), size_bytes: Number.isFinite(size) ? size : null, uploaded_by: me.id });
  if (error) return { error: friendlyError(error.message) };
  await audit(me.id, "material_uploaded", bookingId, { file: fileName, program: title(b) });
  if (["awaiting_trainer", "confirmed"].includes(b.status)) {
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
  if (!isUuid(id)) return;
  const { data } = await db().from("booking_materials").select("*").eq("id", id).maybeSingle();
  const m = data as { file_path: string; booking_id: string } | null;
  if (!m) return;
  const { error } = await db().from("booking_materials").delete().eq("id", id);
  if (error) throw new Error(friendlyError(error.message));
  await db().storage.from("materials").remove([m.file_path]);
  revalidatePath(`/bookings/${m.booking_id}`);
  revalidatePath(`/me/bookings/${m.booking_id}`);
}

export async function materialLink(id: string) {
  const me = await requireUser();
  if (!isUuid(id)) return { error: "File not found." };
  const { data } = await db().from("booking_materials").select("file_path, file_name, bookings(trainer_id)").eq("id", id).maybeSingle();
  const m = data as unknown as { file_path: string; file_name: string; bookings: { trainer_id: string | null } | null } | null;
  if (!m) return { error: "File not found." };
  if (me.role === "trainer" && (!me.trainer_id || m.bookings?.trainer_id !== me.trainer_id)) return { error: "File not found." };
  // the saved name only if it is a plain, allowed name; otherwise the stored object's own name
  // Keeps non-Latin names (e.g. Arabic) and drops only characters that are unsafe in a file name.
  const name = checkFile(m.file_name) ? m.file_path.split("/").pop()! : m.file_name.replace(/[\x00-\x1f\x7f/\\:*?"<>|]+/g, "_").trim() || m.file_path.split("/").pop()!;
  const { data: s, error } = await db().storage.from("materials").createSignedUrl(m.file_path, 300, { download: name });
  if (error) return { error: error.message };
  return { url: s.signedUrl };
}

/* ---------- Deal proposal ---------- */

// The Meska team only (the content team reads the proposal to write the content); trainers never see the commercial side of a deal.
// preview opens the file in the browser (PDFs show inline) instead of downloading it.
export async function proposalLink(dealId: string, preview = false) {
  await requireAccess("te.deal_value", "growth.deal_value", "content.view");
  if (!isUuid(dealId)) return { error: "File not found." };
  const { data } = await db().from("deals").select("proposal_path, proposal_name").eq("id", dealId).maybeSingle();
  const d = data as { proposal_path: string; proposal_name: string } | null;
  if (!d) return { error: "File not found." };
  const stored = d.proposal_path.split("/").pop()!;
  const name = proposalFileError(d.proposal_name) ? stored : d.proposal_name.replace(/[\x00-\x1f\x7f/\\:*?"<>|]+/g, "_").trim() || stored;
  const { data: s, error } = await db().storage.from("proposals").createSignedUrl(d.proposal_path, 300, preview === true ? undefined : { download: name });
  if (error) return { error: error.message };
  return { url: s.signedUrl };
}

/* ---------- A whole training: reassign or cancel ---------- */

// Every day of the training this booking belongs to: its deal, else its batch, else just itself.
async function trainingDays(b: BookingRow) {
  if (!b.deal_id && !b.batch_id) return [b];
  const q = db().from("bookings").select(BOOKING_SELECT);
  const { data } = await (b.deal_id ? q.eq("deal_id", b.deal_id) : q.eq("batch_id", b.batch_id!)).order("day_number");
  return (data ?? []) as BookingRow[];
}

function refreshTraining() {
  refresh();
  revalidatePath("/dashboard", "layout");
  revalidatePath("/bookings", "layout");
}

// Takes the trainer off the days still to come. The days go back to "Needs a trainer", ready for assignTrainer.
export async function reassignTraining(fd: FormData) {
  const me = await requireAccess("te.assign");
  const [b] = await loadBookings([String(fd.get("id"))]);
  if (!b) return { error: "Training not found." };
  const today = todayISO();
  const targets = (await trainingDays(b)).filter((d) => d.trainer_id && !d.finished_at && d.date >= today && ["awaiting_trainer", "confirmed"].includes(d.status));
  if (!targets.length) return { error: "No upcoming day has a trainer to replace." };
  const released: BookingRow[] = [];
  let failure: string | null = null;
  for (const d of targets) {
    const { data, error } = await db()
      .from("bookings")
      .update({ status: "needs_trainer", trainer_id: null, approver_id: null, decided_at: null, reminder_sent_at: null, trainer_comment: null, trainer_responded_at: null })
      .eq("id", d.id)
      .eq("status", d.status)
      .eq("trainer_id", d.trainer_id!)
      .select("id");
    if (error) {
      failure = friendlyError(error.message);
      break;
    }
    if (data?.length) released.push(d);
  }
  for (const d of released) {
    await audit(me.id, "trainer_removed", d.id, { program: title(d), trainer: d.trainers?.full_name });
    await notify([await trainerRecipient(d)], {
      title: `You are no longer assigned: ${trainerTitle(d)}`,
      body: when(d),
      link: "/me/bookings",
      email: {
        subject: `Training reassigned — ${fmtDate(d.date, { weekday: "long", day: "numeric", month: "long" })}`,
        intro: "You are no longer assigned to the following training. The slot is free again in your calendar.",
        rows: bookingRows(d, true),
        attachments: [{ filename: "meska-training-cancelled.ics", content: trainingIcs(d, `${siteUrl()}/me/bookings`, true), contentType: "text/calendar; charset=utf-8; method=CANCEL" }],
      },
    });
  }
  if (released.length) {
    await notify(await trainingTeam(b, me.id), {
      title: `${me.full_name} is reassigning ${b.program_name}`,
      body: `${released.length} ${released.length === 1 ? "day needs" : "days need"} a trainer.`,
      link: `/dashboard/${b.id}`,
      email: {
        subject: `Trainer removed: ${b.program_name}`,
        intro: `<b>${esc(me.full_name)}</b> took the trainer off ${released.length === 1 ? "one day" : `${released.length} days`} of this training, so ${released.length === 1 ? "it needs" : "they need"} a new trainer. The previous trainer was told.`,
        rows: [["Program", esc(b.program_name)], ...released.map((d) => [`Day ${d.day_number}`, `${esc(when(d))} · was ${esc(d.trainers?.full_name ?? "")}`] as [string, string])],
        button: "View the training",
      },
    });
  }
  refreshTraining();
  if (failure) return { error: released.length ? `${released.length} of ${targets.length} days were released. ${failure}` : failure };
  if (!released.length) return { error: "This training changed in the meantime. Refresh the page and try again." };
  return { ok: "Trainer removed and told. Choose the new trainer above." };
}

// Cancels what is left of a training. Delivered days, and past days the trainer had confirmed, stay on record.
export async function cancelTraining(fd: FormData) {
  const me = await requireAccess("te.cancel");
  const [b] = await loadBookings([String(fd.get("id"))]);
  if (!b) return { error: "Training not found." };
  const today = todayISO();
  // Earliest first: that day has the strictest reason rule, so a reason too short stops before anything changes.
  const targets = (await trainingDays(b))
    .filter((d) => ACTIVE.includes(d.status) && !d.finished_at && (d.date >= today || d.status !== "confirmed"))
    .sort((x, y) => x.date.localeCompare(y.date));
  if (!targets.length) return { error: "No day of this training can be cancelled." };
  const reason = String(fd.get("reason") ?? "").replace(/\r\n/g, "\n").trim();
  const done: CancelledDay[] = [];
  let failure: string | null = null;
  for (const d of targets) {
    const r = await cancelDay(me, d, reason);
    if ("error" in r) {
      failure = r.error;
      break;
    }
    done.push(r);
  }
  // The team hears once about every day that was cancelled, even if a later day stopped the rest.
  await notifyCancelled(me, done);
  refreshTraining();
  if (failure) return { error: done.length ? `${done.length} of ${targets.length} days were cancelled. ${failure}` : failure };
  return { ok: "Training cancelled. The trainer and the team were notified, and the reason is in the activity log." };
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
  const bad = checkFile(fileName);
  if (bad) return { error: bad };
  const safe = safeName(fileName);
  const path = `${bookingId}/brief-${Date.now()}-${safe}`;
  const { data, error } = await db().storage.from("materials").createSignedUploadUrl(path);
  if (error) return { error: error.message };
  return { path, token: data.token };
}

export async function recordBriefFile(bookingId: string, path: string, fileName: string, size: number) {
  const r = await ownConfirmedPast(bookingId);
  if ("error" in r) return { error: r.error };
  if (!path.startsWith(`${bookingId}/brief-`) || path.includes("..")) return { error: "Invalid upload." };
  if (checkFile(path)) return { error: "Invalid upload." };
  const { error } = await db().from("booking_materials").insert({ booking_id: bookingId, file_path: path, file_name: fileName.slice(0, 200), size_bytes: Number.isFinite(size) ? size : null, uploaded_by: r.me.id, kind: "brief" });
  if (error) return { error: friendlyError(error.message) };
  revalidatePath(`/me/bookings/${bookingId}`);
  return { ok: `Attached ${fileName}.` };
}

export async function createAudioUpload(bookingId: string, fileName: string) {
  const r = await ownConfirmedPast(bookingId);
  if ("error" in r) return { error: r.error };
  const bad = checkAudioFile(fileName);
  if (bad) return { error: bad };
  const path = `${bookingId}/audio-${Date.now()}-${safeName(fileName)}`;
  const { data, error } = await db().storage.from("materials").createSignedUploadUrl(path);
  if (error) return { error: error.message };
  return { path, token: data.token };
}

export async function recordAudioFile(bookingId: string, path: string, fileName: string, size: number) {
  const r = await ownConfirmedPast(bookingId);
  if ("error" in r) return { error: r.error };
  if (!path.startsWith(`${bookingId}/audio-`) || path.includes("..") || !isAudioPath(path) || checkAudioFile(path)) return { error: "Invalid upload." };
  const { error } = await db().from("booking_materials").insert({ booking_id: bookingId, file_path: path, file_name: fileName.slice(0, 200), size_bytes: Number.isFinite(size) ? size : null, uploaded_by: r.me.id, kind: "brief" });
  if (error) return { error: friendlyError(error.message) };
  await audit(r.me.id, "audio_uploaded", bookingId, { program: title(r.b) });
  revalidatePath(`/me/bookings/${bookingId}`);
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/dashboard", "layout");
  return { ok: `Added ${fileName}.` };
}

export async function submitBrief(bookingId: string, text: string) {
  const r = await ownConfirmedPast(bookingId);
  if ("error" in r) return { error: r.error };
  const brief = text.replace(/\r\n/g, "\n").trim();
  const { data: attached } = await db().from("booking_materials").select("file_path").eq("booking_id", bookingId).eq("kind", "brief");
  const paths = ((attached ?? []) as { file_path: string }[]).map((m) => m.file_path);
  const audioCount = paths.filter(isAudioPath).length;
  const count = paths.length - audioCount;
  if (!brief && !count) return { error: "The brief is required: write it or attach a document before marking the training as delivered." };
  const first = !r.b.finished_at;
  // Days delivered before audio was required can still update their brief without it.
  if (first && !audioCount) return { error: "The training audio is required: add it before marking the training as delivered." };
  const now = new Date().toISOString();
  // Submitting the brief and audio is what marks the training day as delivered (finished_at).
  const { error } = await db().from("bookings").update({ brief: brief || null, brief_submitted_at: now, finished_at: r.b.finished_at ?? now }).eq("id", bookingId);
  if (error) return { error: friendlyError(error.message) };
  await audit(r.me.id, "brief_submitted", bookingId, { program: title(r.b) });
  await notify(await trainingTeam(r.b, r.me.id), {
    title: `${first ? "Training delivered" : "Brief updated"}: ${title(r.b)}`,
    body: `${r.me.full_name}${brief ? `: ${brief.slice(0, 140)}${brief.length > 140 ? "…" : ""}` : " attached a document."}`,
    link: `/dashboard/${bookingId}`,
    email: {
      subject: `${first ? "Training delivered" : "Brief updated"}: ${title(r.b)}`,
      intro: `<b>${esc(r.me.full_name)}</b> ${first ? "marked this training as delivered and added the brief and audio" : "updated the brief"}.`,
      rows: [...bookingRows(r.b), ...(count ? [["Attachments", `${count} document${count > 1 ? "s" : ""}`] as [string, string]] : []), ...(audioCount ? [["Audio", `${audioCount} file${audioCount > 1 ? "s" : ""}`] as [string, string]] : [])],
      content: brief || undefined,
      button: "Read the brief",
    },
  });
  revalidatePath(`/me/bookings/${bookingId}`);
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/dashboard", "layout");
  return { ok: first ? "Training marked as delivered. Thank you, your brief and audio were sent to the team." : "Brief updated and the team was notified." };
}

/* ---------- Delete a whole training (company admins) ---------- */

// Removes a training for good: its deal, every day, and everything hanging off them (participants, content,
// materials, briefs, feedback, locks, notifications, stored files). Compensation lines and the activity log keep
// their rows, unlinked. Nobody is emailed. The admin types DELETE to confirm.
export async function deleteTraining(fd: FormData) {
  const me = await requireRole("admin");
  if (me.real_role !== "admin") return { error: "Only company admins can delete trainings." };
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") return { error: "Type DELETE to confirm." };
  const [b] = await loadBookings([String(fd.get("id") ?? "")]);
  if (!b) return { error: "Training not found." };
  const days = await trainingDays(b);
  const ids = days.map((d) => d.id);
  const dealId = b.deal_id;

  // Files first, while the rows that point at them still exist.
  const [{ data: mats }, { data: contentFiles }, { data: deal }] = await Promise.all([
    db().from("booking_materials").select("file_path").in("booking_id", ids),
    dealId ? db().from("deal_content").select("file_path").eq("deal_id", dealId) : Promise.resolve({ data: [] }),
    dealId ? db().from("deals").select("company_name, proposal_path").eq("id", dealId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const materialPaths = [...((mats ?? []) as { file_path: string }[]), ...((contentFiles ?? []) as { file_path: string }[])].map((m) => m.file_path);
  const proposal = (deal as { company_name: string | null; proposal_path: string } | null)?.proposal_path;

  const steps = [
    db().from("feedback_responses").delete().in("booking_id", ids),
    db().from("booking_materials").delete().in("booking_id", ids),
    db().from("booking_locks").delete().in("booking_id", ids),
    db().from("compensation_lines").update({ booking_id: null }).in("booking_id", ids),
    db().from("audit_log").update({ booking_id: null }).in("booking_id", ids),
  ];
  for (const s of steps) {
    const { error } = await s;
    if (error) return { error: friendlyError(error.message) };
  }
  const { error: dayErr } = await db().from("bookings").delete().in("id", ids);
  if (dayErr) return { error: friendlyError(dayErr.message) };
  if (dealId) {
    await db().from("deal_content").delete().eq("deal_id", dealId);
    await db().from("deal_participants").delete().eq("deal_id", dealId);
    const { error } = await db().from("deals").delete().eq("id", dealId);
    if (error) return { error: friendlyError(error.message) };
  }
  // Bell items that would now open a missing page.
  const links = [...ids.flatMap((id) => [`/bookings/${id}`, `/dashboard/${id}`, `/me/bookings/${id}`]), ...(dealId ? [`/content/${dealId}`] : [])];
  await db().from("notifications").delete().in("link", links);
  if (materialPaths.length) await db().storage.from("materials").remove(materialPaths);
  if (proposal) await db().storage.from("proposals").remove([proposal]);

  await audit(me.id, "training_deleted", null, { program: b.program_name, company: (deal as { company_name: string | null } | null)?.company_name ?? null, deal: dealId, days: ids.length });
  refreshTraining();
  revalidatePath("/content", "layout");
  revalidatePath("/calendar");
  redirect("/dashboard?deleted=1");
}
