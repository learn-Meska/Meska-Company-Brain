import Link from "next/link";
import { ProfileView } from "@/components/profile";
import { requireTrainer } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { getTrainerProfiles } from "@/lib/scoring";
import { fmtDate, fmtTime, todayISO, trainerTitle } from "@/lib/format";

export default async function MePage() {
  const me = await requireTrainer();
  if (!me.trainer_id) return <p className="card">Your login isn&apos;t linked to a trainer profile yet. Please contact the admin.</p>;
  const [[t], { data: waiting }] = await Promise.all([
    getTrainerProfiles([me.trainer_id]),
    db().from("bookings").select("id, program_name, day_number, date, start_time, end_time").eq("trainer_id", me.trainer_id).eq("status", "awaiting_trainer").gte("date", todayISO()).order("date"),
  ]);
  if (!t) return <p className="card">Your trainer profile couldn&apos;t be loaded. Please refresh the page, or contact the admin if it keeps happening.</p>;
  const pending = (waiting ?? []) as { id: string; program_name: string; day_number: number; date: string; start_time: string; end_time: string }[];
  return (
    <div className="space-y-5">
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
      <ProfileView t={t} />
    </div>
  );
}
