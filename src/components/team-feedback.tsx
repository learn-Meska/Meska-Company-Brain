import { Form, Submit } from "@/components/form";
import { addTeamFeedback, deleteTeamFeedback } from "@/app/(app)/bookings/actions";
import { db } from "@/lib/supabase";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  FEEDBACK_SOURCES,
  FEEDBACK_SOURCE_LABEL,
  FEEDBACK_TEAM_LABEL,
  isFeedbackTeam,
  MAX_FEEDBACK_CHARS,
  mayDeleteFeedback,
  RATING_LABEL,
  type FeedbackSource,
} from "@/lib/team-feedback";

type Row = {
  id: string;
  booking_id: string;
  author_id: string | null;
  team: string;
  source: FeedbackSource;
  rating: number | null;
  body: string;
  created_at: string;
  author: { full_name: string } | null;
};
type Day = { id: string; day_number: number; date: string };

const TEAM_STYLE: Record<string, string> = { growth: "bg-[#E2EBFE] text-royal", approver: "bg-ice text-royal-deep", admin: "bg-surface2 text-muted" };

// Feedback Growth and Training Excellence add by hand on a training (every day of it), newest first, with the
// form to add one. Only render it for the Meska team: never on a trainer's or the content team's page.
export async function TeamFeedbackCard({
  booking,
  me,
}: {
  booking: { id: string; deal_id: string | null; batch_id: string | null };
  me: { id: string; role: string; real_role: string };
}) {
  let days: Day[] = [];
  if (booking.deal_id || booking.batch_id) {
    const q = db().from("bookings").select("id, day_number, date");
    const { data } = await (booking.deal_id ? q.eq("deal_id", booking.deal_id) : q.eq("batch_id", booking.batch_id!)).order("day_number");
    days = (data ?? []) as Day[];
  }
  const ids = days.length ? days.map((d) => d.id) : [booking.id];
  const { data } = await db()
    .from("training_feedback")
    .select("id, booking_id, author_id, team, source, rating, body, created_at, author:app_users!training_feedback_author_id_fkey(full_name)")
    .in("booking_id", ids)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];
  const dayOf = new Map(days.map((d) => [d.id, d]));
  const rated = rows.filter((r) => r.rating != null);
  const average = rated.length ? rated.reduce((n, r) => n + r.rating!, 0) / rated.length : null;

  return (
    <section className="ds-card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ds-border px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-base font-semibold text-ds-heading">Team feedback</h2>
          <p className="text-sm text-ds-text">What Growth and Training Excellence heard about this training, e.g. from the client. Optional. The trainer doesn&apos;t see it and it doesn&apos;t change their score.</p>
        </div>
        {average != null && (
          <div className="rounded-xl bg-ds-primary-soft px-4 py-2 text-center">
            <div className="text-xl font-bold tabular-nums text-ds-primary">{average.toFixed(1)}<span className="text-xs font-medium text-ds-text"> / 5</span></div>
            <div className="text-[11px] text-ds-text">{rated.length} {rated.length === 1 ? "rating" : "ratings"}</div>
          </div>
        )}
      </header>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ds-text sm:px-6">No feedback added yet.</p>
      ) : (
        <ul className="divide-y divide-ds-border">
          {rows.map((r) => {
            const day = dayOf.get(r.booking_id);
            return (
              <li key={r.id} className="space-y-2 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${TEAM_STYLE[r.team] ?? TEAM_STYLE.admin}`}>{isFeedbackTeam(r.team) ? FEEDBACK_TEAM_LABEL[r.team] : r.team}</span>
                  <span className="ds-badge">{FEEDBACK_SOURCE_LABEL[r.source] ?? r.source}</span>
                  {r.rating != null && (
                    <span className="badge bg-good-bg text-good" title={RATING_LABEL[r.rating]}>
                      <span aria-hidden>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                      <span className="sr-only">{r.rating} of 5</span>
                    </span>
                  )}
                  <span className="text-xs text-ds-text">
                    <b className="font-medium text-ds-heading">{r.author?.full_name ?? "Former member"}</b> · {fmtDateTime(r.created_at)}
                    {day && days.length > 1 ? ` · Day ${day.day_number} (${fmtDate(day.date, { day: "numeric", month: "short" })})` : ""}
                  </span>
                  {mayDeleteFeedback(me, r.author_id) && (
                    <Form action={deleteTeamFeedback} className="ml-auto">
                      <input type="hidden" name="id" value={r.id} />
                      <Submit className="btn-quiet btn-sm text-bad" pending="Removing…">Remove</Submit>
                    </Form>
                  )}
                </div>
                <p className="whitespace-pre-line text-sm text-ds-heading">{r.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-ds-border bg-ds-subtle/40 px-5 py-4 sm:px-6">
        <Form action={addTeamFeedback} reset className="space-y-3">
          <input type="hidden" name="id" value={booking.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="tf-source">Who is the feedback from?</label>
              <select id="tf-source" name="source" defaultValue="client" className="input">
                {FEEDBACK_SOURCES.map((s) => (
                  <option key={s} value={s}>{FEEDBACK_SOURCE_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="tf-rating">Rating <span className="text-xs font-normal text-ds-text">(optional)</span></label>
              <select id="tf-rating" name="rating" defaultValue="" className="input">
                <option value="">No rating</option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{n} · {RATING_LABEL[n]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="tf-body">Feedback</label>
            <textarea id="tf-body" name="body" rows={3} required maxLength={MAX_FEEDBACK_CHARS} className="input" placeholder="e.g. The client's HR head called: the team loved the practical exercises and asked for a follow-up session." />
          </div>
          <Submit className="ds-btn ds-btn-primary" pending="Adding…">Add feedback</Submit>
        </Form>
      </div>
    </section>
  );
}
