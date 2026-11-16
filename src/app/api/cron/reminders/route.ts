import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";
import { cronAuthorized } from "@/lib/cron";
import { esc, retryFailedEmails } from "@/lib/email";
import { deadlineDay, fmtDate, fmtTime, ordinal, todayISO, trainerTitle } from "@/lib/format";
import { getSetting } from "@/lib/scoring";
import { BOOKING_SELECT, bookingRows, notify, trainerRecipient, userById, usersWithRoles, userWithRole, type BookingRow } from "@/lib/notify";

// Runs daily (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const out = { unconfirmed: 0, availabilityReminders: 0, unassignedDays: 0, deliveryReminders: 0 };

  // 1. Trainers who haven't confirmed a booking in time → tell the booking managers and admins.
  const { hours } = await getSetting("trainer_response", { hours: 48 });
  const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();
  const { data } = await db().from("bookings").select(BOOKING_SELECT).eq("status", "awaiting_trainer").lt("decided_at", cutoff).is("reminder_sent_at", null);
  for (const b of (data ?? []) as BookingRow[]) {
    // Claim the row first so an overlapping run can't send the same reminder twice.
    const { data: claimed } = await db().from("bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", b.id).eq("status", "awaiting_trainer").is("reminder_sent_at", null).select("id");
    if (!claimed?.length) continue;
    const title = `${b.trainers?.full_name} hasn't confirmed ${b.program_name} — Day ${b.day_number}`;
    // the requester only while they still have Growth access (removed members get nothing)
    await notify([await userWithRole(b.created_by, "growth"), ...(await usersWithRoles("approver", "admin"))], {
      title,
      body: `No response after ${hours} hours. Follow up or book another trainer.`,
      link: `/bookings/${b.id}`,
      email: {
        subject: `Action needed: ${b.trainers?.full_name} hasn't confirmed ${b.program_name} — Day ${b.day_number} after ${hours} hours`,
        heading: "The trainer hasn't confirmed yet",
        step: "assigned",
        intro: `<b>${esc(b.trainers?.full_name ?? "The trainer")}</b> hasn't confirmed this assignment within ${hours} hours. The trainer was sent a reminder too.`,
        rows: bookingRows(b),
        next: ["Follow up with the trainer, or open the training and assign someone else if they can't take it."],
        button: "View the training",
      },
    });
    // Sent once; an email Gmail rejects is re-sent on its own by retryFailedEmails().
    await notify([await trainerRecipient(b)], {
      title: `Reminder: please confirm ${trainerTitle(b)}`,
      link: `/me/bookings/${b.id}`,
      email: {
        subject: `Reminder — action needed: confirm ${trainerTitle(b)} on ${fmtDate(b.date, { weekday: "long", day: "numeric", month: "long" })}`,
        heading: "Please confirm your training",
        step: "assigned",
        intro: `You were assigned this training more than ${hours} hours ago and haven't confirmed it yet.`,
        rows: bookingRows(b, true),
        content: b.content || undefined,
        next: ["Open the training and <b>confirm</b> it, or decline with a short reason so the team can find another trainer."],
        button: "Confirm the assignment",
      },
    });
    out.unconfirmed++;
  }

  const today = todayISO();

  // 2. Upcoming days that have waited more than a day for a trainer → one digest to Training Excellence and
  // admins. Growth no longer picks the trainer, so every New deal waits here until someone assigns one.
  const dayAgo = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: waiting } = await db().from("bookings").select(BOOKING_SELECT).eq("status", "needs_trainer").gte("date", today).lt("created_at", dayAgo).order("date").limit(200);
  const unassigned = (waiting ?? []) as BookingRow[];
  if (unassigned.length) {
    const n = unassigned.length;
    const shown = unassigned.slice(0, 15);
    await notify(await usersWithRoles("approver", "admin"), {
      title: `${n} training ${n === 1 ? "day still needs" : "days still need"} a trainer`,
      body: `The nearest is ${unassigned[0].program_name} on ${fmtDate(unassigned[0].date, { day: "numeric", month: "short" })}.`,
      link: "/dashboard?stage=needs_trainer",
      email: {
        subject: `Action needed: ${n} training ${n === 1 ? "day" : "days"} without a trainer (nearest ${fmtDate(unassigned[0].date, { weekday: "short", day: "numeric", month: "short" })})`,
        heading: `${n} training ${n === 1 ? "day needs" : "days need"} a trainer`,
        step: "requested",
        intro: `${n === 1 ? "This upcoming training day has" : "These upcoming training days have"} been waiting for a trainer for more than a day. Growth sends deals without a trainer, so they stay here until one is assigned.`,
        rows: [
          ...shown.map((b) => [esc(fmtDate(b.date, { weekday: "short", day: "numeric", month: "short" })), `${esc(b.program_name)} — Day ${b.day_number} · ${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`] as [string, string]),
          ...(n > shown.length ? [["More", `${n - shown.length} more on the dashboard`] as [string, string]] : []),
        ],
        next: ["Open each training and assign a trainer. If nobody is free, ask a trainer to add the slot to their availability, or agree another date with Growth."],
        button: "Open the dashboard",
      },
    });
    out.unassignedDays = n;
  }

  // 3. A confirmed day that went by without a delivery report → remind its trainer, once. Only the last week,
  // so switching this on doesn't chase old trainings.
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const { data: undelivered } = await db().from("bookings").select(BOOKING_SELECT).eq("status", "confirmed").is("finished_at", null).is("delivery_reminder_sent_at", null).lt("date", today).gte("date", weekAgo);
  for (const b of (undelivered ?? []) as BookingRow[]) {
    const { data: claimed } = await db().from("bookings").update({ delivery_reminder_sent_at: new Date().toISOString() }).eq("id", b.id).eq("status", "confirmed").is("finished_at", null).is("delivery_reminder_sent_at", null).select("id");
    if (!claimed?.length) continue;
    await notify([await trainerRecipient(b)], {
      title: `Reminder: mark ${trainerTitle(b)} as delivered`,
      body: `${fmtDate(b.date, { weekday: "short", day: "numeric", month: "short" })} · send your short delivery report.`,
      link: `/me/bookings/${b.id}`,
      email: {
        subject: `Reminder — action needed: mark ${trainerTitle(b)} (${fmtDate(b.date, { day: "numeric", month: "long" })}) as delivered`,
        heading: "Please mark your training as delivered",
        step: "confirmed",
        intro: `Your training on <b>${esc(fmtDate(b.date))}</b> isn't marked as delivered yet.`,
        rows: bookingRows(b, true),
        next: ["Open the training and press <b>Mark as delivered</b> at the top of the page.", "Fill in the short report: how many attended, the topics you covered and the engagement. Notes, documents and audio are optional."],
        button: "Mark as delivered",
      },
    });
    out.deliveryReminders++;
  }

  // 4. Monthly availability: remind trainers 3 days before the deadline and on the day.
  const setting = await getSetting("availability_deadline", { day_of_month: 25 });
  const day_of_month = deadlineDay(setting.day_of_month);
  const day = Number(today.slice(8));
  // The early reminder is 3 calendar days before the deadline, which can fall in the previous month.
  const deadline = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, day_of_month));
  const nextDeadline = day > day_of_month ? new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), day_of_month)) : deadline;
  const early = new Date(nextDeadline.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
  const isEarly = early === today;
  if (day === day_of_month || isEarly) {
    // The reminder is about the month after the deadline's month.
    const deadlineMonth = isEarly ? nextDeadline : deadline;
    const nextMonth = new Date(Date.UTC(deadlineMonth.getUTCFullYear(), deadlineMonth.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
    const label = new Date(nextMonth).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    const [{ data: trainers }, { data: done }] = await Promise.all([
      db().from("trainers").select("id, full_name, email, user_id").eq("active", true).not("user_id", "is", null),
      db().from("availability_months").select("trainer_id").eq("month", nextMonth),
    ]);
    const submitted = new Set(((done ?? []) as { trainer_id: string }[]).map((d) => d.trainer_id));
    for (const t of (trainers ?? []) as { id: string; full_name: string; user_id: string }[]) {
      if (submitted.has(t.id)) continue;
      await notify([await userById(t.user_id)], {
        title: `Please confirm your availability for ${label}`,
        link: `/me/availability?m=${nextMonth.slice(0, 7)}`,
        email: {
          subject: `Your availability for ${label} is due${day === day_of_month ? " today" : ` on the ${ordinal(day_of_month)}`}`,
          heading: `Your availability for ${label}`,
          intro: `Please mark the days and slots you're available in <b>${esc(label)}</b> and confirm the month, so Growth can book you.`,
          next: ["Open My availability, tick the mornings and evenings you're free, then confirm the month."],
          button: "Update my availability",
        },
      });
      out.availabilityReminders++;
    }
  }
  return NextResponse.json({ ...out, retried: await retryFailedEmails() });
}
