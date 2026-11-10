import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireAccess } from "@/lib/auth";
import { buildTrainings, CONFIRMATION_FILTERS, CONTENT_LABEL, confirmationFilter, isConfirmationFilter, isContentFilter, isStage, STAGE_LABEL, type CycleDay, type CycleDeal, type Stage } from "@/lib/cycle";
import { isAudioPath } from "@/lib/files";
import { isUuid, todayISO } from "@/lib/format";
import { db, fetchAll } from "@/lib/supabase";
import { TrainingRow } from "@/components/training-row";
import { AutoSelect } from "@/components/auto-select";

const TILES: Stage[] = ["needs_trainer", "waiting_trainer", "scheduled", "in_delivery", "report_due", "delivered", "cancelled"];

// Every training for every trainer, and where each one stands. Click a training for its details, reassign or cancel.
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  await requireAccess("te.dashboard");
  const params = await searchParams;
  const stage = isStage(params.stage) ? params.stage : null;
  const growth = isUuid(params.growth) ? params.growth : "";
  const trainer = isUuid(params.trainer) ? params.trainer : "";
  const confirmation = isConfirmationFilter(params.confirmation) ? params.confirmation : "";
  const content = isContentFilter(params.content) ? params.content : "";

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
  const scoped = trainings.filter(
    (t) =>
      (!growth || t.requestedBy === growth) &&
      (!trainer || t.trainers.some((x) => x.id === trainer)) &&
      (!confirmation || confirmationFilter(t.confirmation) === confirmation) &&
      (!content || t.content === content),
  );
  const rows = stage ? scoped.filter((t) => t.stage === stage) : scoped;

  const link = (p: Record<string, string>) => {
    const q = new URLSearchParams({ ...(growth ? { growth } : {}), ...(trainer ? { trainer } : {}), ...(confirmation ? { confirmation } : {}), ...(content ? { content } : {}), ...p }).toString();
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
      {params.deleted && <p className="rounded-xl bg-good-bg px-4 py-3 text-sm text-good">The training and everything attached to it were deleted.</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {tile(null, "All trainings", scoped.length)}
        {TILES.map((s) => tile(s, STAGE_LABEL[s], scoped.filter((t) => t.stage === s).length))}
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/dashboard">
        <AutoSelect name="growth" defaultValue={growth} className="input w-44 py-1.5" aria-label="Growth lead">
          <option value="">All Growth leads</option>
          {[...requesters.entries()].sort(byName).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </AutoSelect>
        <AutoSelect name="trainer" defaultValue={trainer} className="input w-44 py-1.5" aria-label="Trainer">
          <option value="">All trainers</option>
          {[...trainerOptions.entries()].sort(byName).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </AutoSelect>
        <AutoSelect name="confirmation" defaultValue={confirmation} className="input w-48 py-1.5" aria-label="Trainer confirmation">
          <option value="">Any confirmation</option>
          {Object.entries(CONFIRMATION_FILTERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </AutoSelect>
        <AutoSelect name="content" defaultValue={content} className="input w-40 py-1.5" aria-label="Content">
          <option value="">Any content</option>
          {Object.entries(CONTENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </AutoSelect>
        <AutoSelect name="stage" defaultValue={stage ?? ""} className="input w-44 py-1.5" aria-label="Training status">
          <option value="">Any training status</option>
          {TILES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </AutoSelect>
        <noscript><button className="btn-ghost btn-sm">Filter</button></noscript>
        {(stage || growth || trainer || confirmation || content) && <Link href="/dashboard" className="text-sm text-blue hover:underline">Clear filters</Link>}
      </form>

      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>Date</th><th>Company</th><th>Training</th><th>Industry</th><th>Growth lead</th><th>Trainer</th><th>Trainer confirmation</th><th>Content</th><th>Training status</th><th>Feedback score</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-muted">No trainings here.</td></tr>}
            {rows.map((t) => <TrainingRow key={t.key} t={t} href={`/dashboard/${t.linkId}`} />)}
          </tbody>
        </table>
      </section>
    </div>
  );
}
