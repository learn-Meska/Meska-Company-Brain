import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { buildTrainings, CONTENT_LABEL, isStage, STAGE_LABEL, type CycleDay, type CycleDeal, type Stage, type Training } from "@/lib/cycle";
import { isAudioPath } from "@/lib/files";
import { fmtDate, fmtTime, isUuid, todayISO } from "@/lib/format";
import { db, fetchAll } from "@/lib/supabase";
import { fmtNps } from "@/lib/survey";
import { CONTENT_STYLE, STAGE_STYLE } from "./styles";

const TILES: Stage[] = ["needs_trainer", "waiting_trainer", "scheduled", "in_delivery", "report_due", "delivered", "cancelled"];

// Every training for every trainer, and where each one stands. Click a training for its details, reassign or cancel.
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  await requireRole("approver", "admin");
  const params = await searchParams;
  const stage = isStage(params.stage) ? params.stage : null;
  const growth = isUuid(params.growth) ? params.growth : "";
  const trainer = isUuid(params.trainer) ? params.trainer : "";

  const [days, deals, files, feedback, audio, users] = await Promise.all([
    fetchAll<CycleDay>((from, to) => db().from("bookings").select("id, deal_id, batch_id, program_name, day_number, date, start_time, end_time, status, trainer_id, created_by, created_at, trainer_comment, trainer_responded_at, finished_at, brief_submitted_at, trainers(full_name), industry:lookups!bookings_industry_id_fkey(name)").order("id").range(from, to)),
    fetchAll<CycleDeal>((from, to) => db().from("deals").select("id, company_name, content_guide, content_submitted_at, created_at").order("id").range(from, to)),
    fetchAll<{ deal_id: string }>((from, to) => db().from("deal_content").select("deal_id").order("id").range(from, to)),
    fetchAll<{ booking_id: string; recommend: number | null }>((from, to) => db().from("feedback_responses").select("booking_id, recommend").order("id").range(from, to)),
    fetchAll<{ booking_id: string; file_path: string }>((from, to) => db().from("booking_materials").select("booking_id, file_path").eq("kind", "brief").order("id").range(from, to)),
    fetchAll<{ id: string; full_name: string }>((from, to) => db().from("app_users").select("id, full_name").order("id").range(from, to)),
  ]);
  const failed = [days, deals, files, feedback, audio, users].find((r) => r.error);
  if (failed) {
    console.error("[dashboard]", failed.error);
    return (
      <div className="space-y-5">
        <PageHeader kicker="Training Excellence" title={<>Dashboard</>} />
        <p className="rounded-xl bg-bad-bg px-4 py-3 text-sm text-bad">The dashboard couldn&apos;t load. Please refresh and try again.</p>
      </div>
    );
  }

  const trainings = buildTrainings({
    days: days.data,
    deals: deals.data,
    contentFileDealIds: files.data.map((f) => f.deal_id),
    feedback: feedback.data,
    audioBookingIds: audio.data.filter((a) => isAudioPath(a.file_path)).map((a) => a.booking_id),
    names: new Map(users.data.map((u) => [u.id, u.full_name])),
    today: todayISO(),
  });

  const requesters = new Map<string, string>();
  const trainerOptions = new Map<string, string>();
  for (const t of trainings) {
    if (t.requestedBy && t.requestedByName) requesters.set(t.requestedBy, t.requestedByName);
    for (const x of t.trainers) trainerOptions.set(x.id, x.name);
  }
  const byName = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1]);

  // Each training has one status, so the status tiles always add up to "All trainings".
  const scoped = trainings.filter((t) => (!growth || t.requestedBy === growth) && (!trainer || t.trainers.some((x) => x.id === trainer)));
  const rows = stage ? scoped.filter((t) => t.stage === stage) : scoped;

  const link = (p: Record<string, string>) => {
    const q = new URLSearchParams({ ...(growth ? { growth } : {}), ...(trainer ? { trainer } : {}), ...p }).toString();
    return q ? `/dashboard?${q}` : "/dashboard";
  };
  const tile = (key: Stage | null, label: string, n: number) => (
    <Link key={key ?? "all"} href={key ? link({ stage: key }) : link({})} className={`rounded-xl p-3 transition hover:brightness-95 ${key ? "border border-ice2 bg-ice" : "stat-hot text-white"} ${stage === key ? "ring-2 ring-royal ring-offset-2" : ""}`}>
      <div className={`text-2xl font-bold tabular-nums ${key ? "text-royal-deep" : ""}`}>{n}</div>
      <div className={`text-[10.5px] font-medium uppercase tracking-wider ${key ? "text-[#3B82F6]" : "text-[#93C5FD]"}`}>{label}</div>
    </Link>
  );

  return (
    <div className="space-y-5">
      <PageHeader kicker="Training Excellence" title={<>Dashboard</>} lead={<>Every training for every trainer. Click a training to see its details, reassign the trainer or cancel it.</>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {tile(null, "All trainings", scoped.length)}
        {TILES.map((s) => tile(s, STAGE_LABEL[s], scoped.filter((t) => t.stage === s).length))}
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/dashboard">
        {stage && <input type="hidden" name="stage" value={stage} />}
        <select name="growth" defaultValue={growth} className="input w-44 py-1.5" aria-label="Growth lead">
          <option value="">All Growth leads</option>
          {[...requesters.entries()].sort(byName).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select name="trainer" defaultValue={trainer} className="input w-44 py-1.5" aria-label="Trainer">
          <option value="">All trainers</option>
          {[...trainerOptions.entries()].sort(byName).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <button className="btn-ghost btn-sm">Filter</button>
        {(stage || growth || trainer) && <Link href="/dashboard" className="text-sm text-blue hover:underline">Clear</Link>}
      </form>

      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>Date</th><th>Company</th><th>Training</th><th>Industry</th><th>Growth lead</th><th>Trainer</th><th>Trainer confirmation</th><th>Content</th><th>Training status</th><th>Feedback score</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-muted">No trainings here.</td></tr>}
            {rows.map((t) => <TrainingRow key={t.key} t={t} />)}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const confirmStyle = (label: string) => (label === "Confirmed" ? "bg-good-bg text-good" : label === "Declined" ? "bg-bad-bg text-bad" : label === "No trainer yet" ? "bg-[#FDE2EC] text-[#B4235A]" : label === "—" ? "bg-surface2 text-muted" : "bg-[#E2EBFE] text-royal");

function TrainingRow({ t }: { t: Training }) {
  const dayCount = t.live || t.days.length;
  return (
    <tr>
      <td className="whitespace-nowrap">
        {fmtDate(t.firstDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        <div className="text-xs text-muted">{dayCount > 1 ? `Until ${fmtDate(t.lastDate, { day: "numeric", month: "short", year: "numeric" })}` : `${fmtTime(t.firstDay.start_time)} – ${fmtTime(t.firstDay.end_time)}`}</div>
      </td>
      <td className="text-sm">{t.company ?? <span className="text-muted">—</span>}</td>
      <td>
        <Link href={`/dashboard/${t.linkId}`} className="font-medium text-blue hover:underline">{t.program}</Link>
        <div className="text-xs text-muted">{dayCount} {dayCount === 1 ? "day" : "days"}</div>
      </td>
      <td className="text-xs text-muted">{t.industry ?? "—"}</td>
      <td className="text-sm">{t.requestedByName ?? "—"}</td>
      <td className="text-sm">{t.trainers.length ? t.trainers.map((x) => x.name).join(", ") : <span className="text-[#B4235A]">Not assigned</span>}</td>
      <td><span className={`badge whitespace-nowrap ${confirmStyle(t.confirmation)}`}>{t.confirmation}</span></td>
      <td>{t.content === "none" ? <span className="text-muted">—</span> : <span className={`badge whitespace-nowrap ${CONTENT_STYLE[t.content]}`}>{CONTENT_LABEL[t.content]}</span>}</td>
      <td>
        <span className={`badge whitespace-nowrap ${STAGE_STYLE[t.stage]}`}>{STAGE_LABEL[t.stage]}</span>
        {t.attention && <div className="mt-1"><span className="badge whitespace-nowrap bg-bad-bg text-bad">Needs attention</span></div>}
        {t.started && t.live > 0 && <div className="mt-1 whitespace-nowrap text-xs text-muted">Brief {t.briefs}/{t.live} · Audio {t.audios}/{t.live}</div>}
      </td>
      <td className="text-sm">
        {t.responses ? <><b className="tabular-nums">{fmtNps(t.score)}</b><div className="whitespace-nowrap text-xs text-muted">{t.responses} {t.responses === 1 ? "response" : "responses"}</div></> : <span className="text-muted">—</span>}
      </td>
    </tr>
  );
}
