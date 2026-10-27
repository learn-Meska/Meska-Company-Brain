import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { TierBadge } from "@/components/profile";
import { fmtNps } from "@/lib/survey";
import { canManageTrainers, requireRole } from "@/lib/auth";
import { getTrainerProfiles } from "@/lib/scoring";

export default async function TrainersPage() {
  const me = await requireRole("admin", "approver", "growth");
  const trainers = (await getTrainerProfiles()).sort((a, b) => b.total - a.total);
  return (
    <div className="space-y-6">
      <PageHeader kicker="People" title={<>Trainers</>} lead={<>{trainers.length} trainers, ranked by total score.</>} actions={<>{canManageTrainers(me) && <Link href="/trainers/new" className="btn">+ New trainer profile</Link>}</>} />
      <div className="grid gap-3 md:grid-cols-2">
        {trainers.map((t, i) => (
          <Link key={t.id} href={`/trainers/${t.id}`} className="card flex gap-4 transition hover:border-blue">
            <div className={`grid h-10 w-10 flex-none place-items-center rounded-full text-sm font-bold ${i === 0 ? "bg-gradient-to-br from-blue to-navy text-white" : "bg-surface2"}`}>{i + 1}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-[15px]">{t.full_name}</b>
                <TierBadge tier={t.tier} />
                {!t.active && <span className="badge bg-bad-bg text-bad">Inactive</span>}
                {!t.user_id && <span className="badge bg-warn-bg text-warn">Not invited</span>}
              </div>
              <div className="mt-1 truncate text-xs text-muted">{t.skills.map((s) => s.name).join(" · ") || "No skills yet"}</div>
              <div className="mt-2 flex gap-4 text-xs text-muted">
                <span><b className="text-ink">{t.total}</b> score</span>
                <span><b className="text-ink">{t.feedback.average?.toFixed(2) ?? "—"}</b> feedback</span>
                {t.feedback.nps != null && <span><b className="text-ink">{fmtNps(t.feedback.nps)}</b> NPS</span>}
                <span><b className="text-ink">{t.delivered}</b> delivered</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
