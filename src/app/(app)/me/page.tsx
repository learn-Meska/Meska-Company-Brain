import Link from "next/link";
import { ProfileView } from "@/components/profile";
import { requireTrainer } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { getTrainerProfiles } from "@/lib/scoring";
import { deliveryState } from "@/lib/delivery";
import { deliveryAnyTime } from "@/lib/feedback-mode";
import { fmtDate, fmtTime, todayISO, trainerTitle } from "@/lib/format";

export default async function MePage() {
  const me = await requireTrainer();
  if (!me.trainer_id) return <p className="card">Your login isn&apos;t linked to a trainer profile yet. Please contact the admin.</p>;
  // What needs the trainer: assignments to confirm (also ones whose date already passed), and confirmed days
  // whose session has started but that aren't marked as delivered yet.
  const anyTime = await deliveryAnyTime();
  const [[t], { data: waiting }, { data: started }] = await Promise.all([
    getTrainerProfiles([me.trainer_id]),
    db().from("bookings").select("id, program_name, day_number, date, start_time, end_time").eq("trainer_id", me.trainer_id).eq("status", "awaiting_trainer").order("date"),
    db().from("bookings").select("id, program_name, day_number, date, start_time, end_time, status, finished_at").eq("trainer_id", me.trainer_id).eq("status", "confirmed").is("finished_at", null).lte("date", anyTime ? "9999-12-31" : todayISO()).order("date"),
  ]);
  if (!t) return <p className="card">Your trainer profile couldn&apos;t be loaded. Please refresh the page, or contact the admin if it keeps happening.</p>;
  type Day = { id: string; program_name: string; day_number: number; date: string; start_time: string; end_time: string };
  const pending = (waiting ?? []) as Day[];
  const toDeliver = ((started ?? []) as (Day & { status: string; finished_at: string | null })[]).filter((d) => deliveryState(d, undefined, anyTime) === "ready");
  return (
    <div className="space-y-5">
      {toDeliver.length > 0 && (
        <section className="ds-card relative overflow-hidden p-5">
          <div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-ds-primary" />
          <h2 className="text-base font-semibold text-ds-heading">{toDeliver.length === 1 ? "1 training day is" : `${toDeliver.length} training days are`} ready to mark as delivered</h2>
          <p className="text-sm text-ds-text">Open the day and press “Mark as delivered” to send your short delivery report.</p>
          <ul className="mt-3 divide-y divide-ds-border rounded-xl border border-ds-border">
            {toDeliver.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ds-heading">{trainerTitle(d)}</div>
                  <div className="text-xs text-ds-text">{fmtDate(d.date, { weekday: "short", day: "numeric", month: "short" })}, {fmtTime(d.start_time)} – {fmtTime(d.end_time)}</div>
                </div>
                <Link href={`/me/bookings/${d.id}`} className="ds-btn ds-btn-primary">Mark as delivered</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {pending.length > 0 && (
        <section className="rounded-2xl border-2 border-blue bg-[#F3F7FF] p-4">
          <h2 className="h2 mb-2">{pending.length === 1 ? "1 assignment needs" : `${pending.length} assignments need`} your confirmation</h2>
          <ul className="space-y-1 text-sm">
            {pending.map((p) => (
              <li key={p.id}>
                <Link href={`/me/bookings/${p.id}`} className="font-medium text-blue hover:underline">{trainerTitle(p)}</Link>{" "}
                <span className="text-muted">· {fmtDate(p.date, { weekday: "short", day: "numeric", month: "short" })}, {fmtTime(p.start_time)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {t.cv_path && <a href={`/trainers/${t.id}/cv`} className="btn-ghost">⬇ My CV</a>}
        <a href={`/trainers/${t.id}/bio`} className="btn-ghost">⬇ My profile PDF</a>
      </div>
      <ProfileView t={t} showTier={false} />
    </div>
  );
}
