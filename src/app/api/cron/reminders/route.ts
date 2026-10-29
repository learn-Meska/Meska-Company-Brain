import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";
import { cronAuthorized } from "@/lib/cron";
import { esc, retryFailedEmails } from "@/lib/email";
import { deadlineDay, fmtDate, ordinal, todayISO, trainerTitle } from "@/lib/format";
import { getSetting } from "@/lib/scoring";
import { BOOKING_SELECT, bookingRows, notify, trainerRecipient, userById, usersWithRoles, userWithRole, type BookingRow } from "@/lib/notify";

// Runs daily (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const out = { unconfirmed: 0, availabilityReminders: 0 };

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
      email: { subject: title, intro: `The trainer hasn't confirmed this assignment within ${hours} hours. Please follow up or book someone else.`, rows: bookingRows(b) },
    });
    // Sent once; an email Gmail rejects is re-sent on its own by retryFailedEmails().
    await notify([await trainerRecipient(b)], {
      title: `Reminder: please confirm ${trainerTitle(b)}`,
      link: `/me/bookings/${b.id}`,
      email: { subject: `Reminder: please confirm your training on ${fmtDate(b.date, { day: "numeric", month: "long" })}`, intro: "You haven't confirmed this assignment yet.", rows: bookingRows(b, true), content: b.content || undefined, button: "Confirm the assignment" },
    });
    out.unconfirmed++;
  }

  // 2. Monthly availability: remind trainers 3 days before the deadline and on the day.
  const setting = await getSetting("availability_deadline", { day_of_month: 25 });
  const day_of_month = deadlineDay(setting.day_of_month);
  const today = todayISO();
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
          intro: `Please mark the days and slots you're available in <b>${esc(label)}</b> and confirm the month, so Growth can book you.`,
          button: "Update my availability",
        },
      });
      out.availabilityReminders++;
    }
  }
  return NextResponse.json({ ...out, retried: await retryFailedEmails() });
}
