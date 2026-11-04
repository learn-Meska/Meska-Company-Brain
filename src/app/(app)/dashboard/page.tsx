import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status";
import { requireRole } from "@/lib/auth";
import { buildTrainings, CONTENT_LABEL, isDeclined, isStage, matchesWhen, STAGE_LABEL, WHEN_OPTIONS, type ContentState, type CycleDay, type CycleDeal, type Stage, type Training, type When } from "@/lib/cycle";
import { fmtDate, fmtDateTime, isUuid, todayISO } from "@/lib/format";
import { db, fetchAll } from "@/lib/supabase";

const STAGE_STYLE: Record<Stage, string> = {
  needs_trainer: "bg-[#FDE2EC] text-[#B4235A]",
  waiting_trainer: "bg-[#E2EBFE] text-royal",
  needs_content: "bg-warn-bg text-warn",
  ready: "bg-good-bg text-good",
  in_delivery: "bg-ice text-royal-deep",
  delivered: "bg-surface2",
  cancelled: "bg-surface2 text-muted line-through",
};
const CONTENT_STYLE: Record<Exclude<ContentState, "none">, string> = { needs_content: "bg-warn-bg text-warn", in_progress: "bg-[#E2EBFE] text-royal", submitted: "bg-good-bg text-good" };
const WHEN_LABEL: Record<When, string> = { active: "Active", past: "Past", all: "All" };
const TILES: Stage[] = ["needs_trainer", "waiting_trainer", "needs_content", "ready", "delivered"];
const shortDate = (d: string) => fmtDate(d, { day: "numeric", month: "short", year: "numeric" });

// Every training for every trainer, and where each one stands in the cycle. Read-only: rows open the booking page.
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  await requireRole("approver", "admin");
  const params = await searchParams;
  const stage = params.stage === "attention" || isStage(params.stage) ? params.stage : null;
  const when = WHEN_OPTIONS.find((w) => w === params.when) ?? "active";
  const growth = isUuid(params.growth) ? params.growth : "";
  const trainer = isUuid(params.trainer) ? params.trainer : "";

  // The deal's value is left out on purpose.
  const [days, deals, files, feedback, users] = await Promise.all([
    fetchAll<CycleDay>((from, to) => db().from("bookings").select("id, deal_id, batch_id, program_name, day_number, date, status, trainer_id, created_by, created_at, trainer_comment, trainer_responded_at, finished_at, trainers(full_name)").order("id").range(from, to)),
    fetchAll<CycleDeal>((from, to) => db().from("deals").select("id, company_name, content_guide, content_submitted_at, created_at").order("id").range(from, to)),
    fetchAll<{ deal_id: string }>((from, to) => db().from("deal_content").select("deal_id").order("id").range(from, to)),
    fetchAll<{ booking_id: string }>((from, to) => db().from("feedback_responses").select("booking_id").order("id").range(from, to)),
    fetchAll<{ id: string; full_name: string }>((from, to) => db().from("app_users").select("id, full_name").order("id").range(from, to)),
  ]);
  const failed = [days, deals, files, feedback, users].find((r) => r.error);
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
    feedbackBookingIds: feedback.data.map((f) => f.booking_id),
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

  // Tiles count across all dates, so a tile and the list it opens always agree.
  const scoped = trainings.filter((t) => (!growth || t.requestedBy === growth) && (!trainer || t.trainers.some((x) => x.id === trainer)));
  const count = (s: Stage) => scoped.filter((t) => t.stage === s).length;
  const rows = stage
    ? scoped.filter((t) => (stage === "attention" ? t.attention : t.stage === stage))
    : scoped.filter((t) => matchesWhen(t, when));

  const link = (p: Record<string, string>) => {
    const q = new URLSearchParams({ ...(growth ? { growth } : {}), ...(trainer ? { trainer } : {}), ...p });
    return `/dashboard?${q.toString()}`;
  };
  const tile = (key: string, label: string, n: number, hot = false) => (
    <Link key={key} href={stage === key ? link({}) : link({ stage: key })} className={`rounded-xl p-3 transition hover:brightness-95 ${hot ? "stat-hot text-white" : "border border-ice2 bg-ice"} ${stage === key ? "ring-2 ring-royal ring-offset-2" : ""}`}>
      <div className={`text-2xl font-bold tabular-nums ${hot ? "" : "text-royal-deep"}`}>{n}</div>
      <div className={`text-[10.5px] font-medium uppercase tracking-wider ${hot ? "text-[#93C5FD]" : "text-[#3B82F6]"}`}>{label}</div>
    </Link>
  );

  return (
    <div className="space-y-5">
      <PageHeader kicker="Training Excellence" title={<>Dashboard</>} lead={<>Every training for every trainer: who requested it, whether the content is ready, whether the trainer confirmed, and how delivery went.</>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tile("attention", "Needs attention", scoped.filter((t) => t.attention).length, true)}
        {TILES.map((s) => tile(s, STAGE_LABEL[s], count(s)))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {WHEN_OPTIONS.map((w) => (
          <Link key={w} href={link({ when: w })} className={!stage && when === w ? "btn btn-sm" : "btn-ghost btn-sm"}>{WHEN_LABEL[w]}</Link>
        ))}
        <span className="mx-1 h-6 w-px bg-line" />
        <form className="flex flex-wrap gap-2" action="/dashboard">
          {stage && <input type="hidden" name="stage" value={stage} />}
          {!stage && when !== "active" && <input type="hidden" name="when" value={when} />}
          <select name="growth" defaultValue={growth} className="input w-44 py-1.5" aria-label="Requested by">
            <option value="">Anyone requesting</option>
            {[...requesters.entries()].sort(byName).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select name="trainer" defaultValue={trainer} className="input w-44 py-1.5" aria-label="Trainer">
            <option value="">All trainers</option>
            {[...trainerOptions.entries()].sort(byName).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <button className="btn-ghost btn-sm">Filter</button>
        </form>
        {(stage || growth || trainer || when !== "active") && <Link href="/dashboard" className="text-sm text-blue hover:underline">Clear</Link>}
      </div>

      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>Training</th><th>Requested by</th><th>Content</th><th>Trainer</th><th>Delivery</th><th>Feedback</th><th>Stage</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted">No trainings here.</td></tr>}
            {rows.map((t) => <TrainingRow key={t.key} t={t} />)}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function TrainingRow({ t }: { t: Training }) {
  // A fully cancelled training has no live days, so it counts the days it was booked for.
  const dayCount = t.live || t.days.length;
  return (
    <tr>
      <td className="align-top">
        <Link href={`/bookings/${t.linkId}`} className="font-medium text-blue hover:underline">{t.company ?? t.program}</Link>
        <div className="text-xs text-muted">{t.company ? `${t.program} · ` : ""}{dayCount} {dayCount === 1 ? "day" : "days"}</div>
      </td>
      <td className="align-top text-sm">
        {t.requestedByName ?? "—"}
        <div className="whitespace-nowrap text-xs text-muted">{fmtDateTime(t.requestedAt)}</div>
      </td>
      <td className="align-top">
        {t.content === "none" ? <span className="text-muted">—</span> : <span className={`badge ${CONTENT_STYLE[t.content]}`}>{CONTENT_LABEL[t.content]}</span>}
        {t.contentSubmittedAt && <div className="mt-1 whitespace-nowrap text-xs text-muted">{fmtDateTime(t.contentSubmittedAt)}</div>}
      </td>
      <td className="min-w-52 align-top text-sm">
        <details>
          <summary className="cursor-pointer font-medium">{t.live ? `${t.confirmed} of ${t.live} confirmed` : "All days cancelled"}</summary>
          <ul className="mt-2 space-y-2">
            {t.days.map((d) => (
              <li key={d.id} className="text-xs">
                <Link href={`/bookings/${d.id}`} className="text-blue hover:underline">Day {d.day_number} · {shortDate(d.date)}</Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {d.trainers?.full_name && <span>{d.trainers.full_name}</span>}
                  <StatusBadge status={d.status} />
                </div>
                {isDeclined(d) && d.trainer_comment && <div className="mt-0.5 text-[#B4235A]">{d.trainer_comment}</div>}
              </li>
            ))}
          </ul>
        </details>
        {t.trainers.length > 0 && <div className="text-xs text-muted">{t.trainers.map((x) => x.name).join(", ")}</div>}
      </td>
      <td className="whitespace-nowrap align-top text-sm">
        {t.nextDate ? <>Next: {shortDate(t.nextDate)}</> : t.live ? null : <span className="text-muted">—</span>}
        {t.started && t.live > 0 && <div className="text-xs text-muted">{t.finished} of {t.live} finished</div>}
      </td>
      <td className="align-top text-sm tabular-nums">{t.started ? t.feedback : <span className="text-muted">—</span>}</td>
      <td className="align-top">
        <span className={`badge whitespace-nowrap ${STAGE_STYLE[t.stage]}`}>{STAGE_LABEL[t.stage]}</span>
        {t.attention && <div className="mt-1"><span className="badge whitespace-nowrap bg-bad-bg text-bad">Needs attention</span></div>}
      </td>
    </tr>
  );
}
