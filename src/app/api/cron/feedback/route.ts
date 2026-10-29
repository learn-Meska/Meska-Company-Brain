import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";
import { cronAuthorized } from "@/lib/cron";
import { esc, retryFailedEmails } from "@/lib/email";
import { feedbackWindow, fmtDate, trainerTitle } from "@/lib/format";
import { summarize, type Response } from "@/lib/feedback";
import { BOOKING_SELECT, notify, trainerRecipient, usersWithRoles, type BookingRow } from "@/lib/notify";

const list = (items: string[]) =>
  items.length
    ? `<ul style="margin:6px 0 0;padding-left:18px">${items.map((c) => `<li style="margin:0 0 6px;font-size:13.5px;line-height:1.5">“${esc(c)}”</li>`).join("")}</ul>`
    : `<p style="margin:6px 0 0;font-size:13px;color:#97A3B8">No comments.</p>`;

// Runs hourly (Supabase pg_cron). Once a day's feedback form closes (6h after the session),
// emails the trainer their averages and the participants' comments.
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await db().from("bookings").select(BOOKING_SELECT).eq("status", "confirmed").is("feedback_summary_sent_at", null).gte("date", since);
  const due = ((data ?? []) as BookingRow[]).filter((b) => Date.now() > feedbackWindow(b).closes.getTime());
  let sent = 0;
  for (const b of due) {
    // Claim first so overlapping runs (pg_cron + a manual call) don't both email the trainer.
    const { data: claimed } = await db().from("bookings").update({ feedback_summary_sent_at: new Date().toISOString() }).eq("id", b.id).is("feedback_summary_sent_at", null).select("id");
    if (!claimed?.length) continue;
    const { data: rows, error } = await db().from("feedback_responses").select("*").eq("booking_id", b.id);
    if (error) {
      await db().from("bookings").update({ feedback_summary_sent_at: null }).eq("id", b.id);
      continue;
    }
    const s = summarize((rows ?? []) as Response[]);
    if (s.count > 0) {
      const scores = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>
<td style="background:linear-gradient(160deg,#1D4ED8,#1E3A8A);border-radius:12px;padding:14px 18px;color:#fff"><div style="font-size:26px;font-weight:700">${s.trainer?.toFixed(2)}</div><div style="font-size:10.5px;letter-spacing:1.4px;text-transform:uppercase;color:#93C5FD">Trainer / 5</div></td>
<td style="width:10px"></td>
<td style="background:#EFF6FF;border:1px solid #DBEAFE;border-radius:12px;padding:14px 18px"><div style="font-size:26px;font-weight:700;color:#1E3A8A">${s.content?.toFixed(2)}</div><div style="font-size:10.5px;letter-spacing:1.4px;text-transform:uppercase;color:#3B82F6">Content / 5</div></td>
</tr></table>
<div style="margin:0 0 14px"><b style="color:#0E7C55;font-size:13px">What participants liked</b>${list(s.liked)}</div>
<div style="margin:0 0 18px"><b style="color:#A8650E;font-size:13px">What could be improved</b>${list(s.improve)}</div>`;
      // Sent once; if Gmail rejects the email, retryFailedEmails() re-sends just the email later.
      await notify([await trainerRecipient(b)], {
        title: `Your evaluation: ${trainerTitle(b)} — ${s.trainer?.toFixed(2)}/5`,
        body: `${s.count} participants · trainer ${s.trainer?.toFixed(2)} · content ${s.content?.toFixed(2)}`,
        link: `/me/bookings/${b.id}`,
        email: {
          subject: `Your training evaluation — ${fmtDate(b.date, { weekday: "long", day: "numeric", month: "long" })}`,
          intro: `Here is the participants' feedback for your training on <b>${esc(fmtDate(b.date))}</b>, based on <b>${s.count}</b> ${s.count === 1 ? "response" : "responses"}.`,
          extra: scores,
          button: "View the details",
        },
      });
      await notify(await usersWithRoles("admin", "approver"), {
        title: `Feedback in: ${b.program_name} — Day ${b.day_number} (${b.trainers?.full_name})`,
        body: `${s.count} responses · trainer ${s.trainer?.toFixed(2)}/5 · content ${s.content?.toFixed(2)}/5`,
        link: `/bookings/${b.id}`,
      });
      sent++;
    }
  }
  const retried = await retryFailedEmails();
  return NextResponse.json({ checked: due.length, sent, retried });
}
