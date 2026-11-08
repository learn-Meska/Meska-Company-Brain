import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";
import { cronAuthorized } from "@/lib/cron";
import { esc, retryFailedEmails } from "@/lib/email";
import { feedbackWindow, fmtDate, trainerTitle } from "@/lib/format";
import { summarize, type Response } from "@/lib/feedback";
import type { QuestionSummary } from "@/lib/feedback-form";
import { fmtNps } from "@/lib/survey";
import { BOOKING_SELECT, notify, trainerRecipient, usersWithRoles, type BookingRow } from "@/lib/notify";

const list = (items: string[]) =>
  items.length
    ? `<ul style="margin:6px 0 0;padding-left:18px">${items.map((c) => `<li style="margin:0 0 6px;font-size:13.5px;line-height:1.5">“${esc(c)}”</li>`).join("")}</ul>`
    : `<p style="margin:6px 0 0;font-size:13px;color:#97A3B8">No comments.</p>`;

// Runs hourly (Supabase pg_cron). Once a day's feedback form closes (6h after the session),
// emails the trainer their NPS, Yes/No results and the participants' reasons.
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
<td style="background:linear-gradient(160deg,#1D4ED8,#1E3A8A);border-radius:12px;padding:12px 16px;color:#fff;vertical-align:top"><div style="font-size:26px;font-weight:700">${fmtNps(s.nps)}</div><div style="font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#93C5FD">NPS</div><div style="font-size:11px;color:#C7D7F5;margin-top:4px">${s.promoters} promoters · ${s.passives} passives · ${s.detractors} detractors</div></td>
</tr></table>
${s.questions.map(questionHtml).join("")}`;
      // Sent once; if Gmail rejects the email, retryFailedEmails() re-sends just the email later.
      await notify([await trainerRecipient(b)], {
        title: `Your evaluation: ${trainerTitle(b)} — NPS ${fmtNps(s.nps)}`,
        body: `${s.count} participants · NPS ${fmtNps(s.nps)}`,
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
        body: `${s.count} responses · NPS ${fmtNps(s.nps)}`,
        link: `/bookings/${b.id}`,
      });
      sent++;
    }
  }
  const retried = await retryFailedEmails();
  return NextResponse.json({ checked: due.length, sent, retried });
}

// One question of the form, summed up for the email.
function questionHtml(q: QuestionSummary) {
  const head = `<div style="font-size:13px;font-weight:600;color:#1E3A8A;margin:0 0 6px">${esc(q.label)} <span style="font-weight:400;color:#5E6B82">· ${q.answered} ${q.answered === 1 ? "answer" : "answers"}</span></div>`;
  let body = "";
  if (q.type === "yes_no") body = `<div style="font-size:20px;font-weight:700;color:#1E3A8A">${q.yesPercent != null ? `${q.yesPercent}% yes` : "—"}</div>`;
  else if (q.type === "rating") body = `<div style="font-size:20px;font-weight:700;color:#1E3A8A">${q.average ?? "—"} <span style="font-size:12px;font-weight:400;color:#5E6B82">/ 5</span></div>`;
  else if (q.type === "choice") body = (q.choices ?? []).map((c) => `<div style="font-size:13px;color:#33415C">${esc(c.option)}: <b>${c.count}</b></div>`).join("");
  else body = list(q.texts ?? []);
  return `<div style="margin:0 0 16px;padding:12px 14px;border:1px solid #E1E7F1;border-radius:12px">${head}${body}</div>`;
}
