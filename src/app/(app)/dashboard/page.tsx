import Link from "next/link";
import { DashboardFilters } from "@/components/dashboard-filters";
import { requireRole } from "@/lib/auth";
import { buildTrainings, cycleSteps, isDeclined, isStage, matchesWhen, STAGE_LABEL, WHEN_OPTIONS, type CycleDay, type CycleDeal, type Stage, type Step, type StepState, type Training, type When } from "@/lib/cycle";
import { fmtDate, isUuid, STATUS_LABEL, todayISO } from "@/lib/format";
import { db, fetchAll } from "@/lib/supabase";

const WHEN_LABEL: Record<When, string> = { active: "Active", past: "Past", all: "All" };
const TILES: Stage[] = ["needs_trainer", "waiting_trainer", "needs_content", "ready", "delivered"];
const ROW_GRID = "grid md:grid-cols-5 xl:grid-cols-[minmax(0,1.35fr)_repeat(5,minmax(0,1fr))]";

const DOT: Record<StepState, string> = {
  done: "bg-royal",
  active: "border-2 border-royal bg-surface",
  waiting: "bg-[#E9A23B]",
  blocked: "bg-bad",
  upcoming: "border-2 border-[#CBD5E1] bg-surface",
  none: "bg-[#E2E8F0]",
};
const TITLE: Record<StepState, string> = { done: "text-ink", active: "text-royal", waiting: "text-warn", blocked: "text-bad", upcoming: "text-ink", none: "text-faint" };
const DAY_STATE: Record<string, StepState> = { confirmed: "done", awaiting_trainer: "waiting", pending_approval: "waiting", needs_trainer: "blocked" };

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
        <h1 className="text-[28px] font-semibold tracking-tight text-ink">Dashboard</h1>
        <p className="rounded-xl bg-bad-bg px-4 py-3 text-sm text-bad">The dashboard couldn&apos;t load. Refresh the page to try again.</p>
      </div>
    );
  }

  const today = todayISO();
  const trainings = buildTrainings({
    days: days.data,
    deals: deals.data,
    contentFileDealIds: files.data.map((f) => f.deal_id),
    feedbackBookingIds: feedback.data.map((f) => f.booking_id),
    names: new Map(users.data.map((u) => [u.id, u.full_name])),
    today,
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
  const rows = stage ? scoped.filter((t) => (stage === "attention" ? t.attention : t.stage === stage)) : scoped.filter((t) => matchesWhen(t, when));
  const attention = rows.filter((t) => t.attention);
  const others = rows.filter((t) => !t.attention);

  const link = (p: Record<string, string>) => {
    const q = new URLSearchParams({ ...(growth ? { growth } : {}), ...(trainer ? { trainer } : {}), ...p }).toString();
    return q ? `/dashboard?${q}` : "/dashboard";
  };
  const tile = (key: string, label: string, n: number, alert = false) => (
    <Link key={key} href={stage === key ? link({}) : link({ stage: key })} aria-current={stage === key ? "true" : undefined} className={`relative bg-surface px-4 py-4 transition hover:bg-[#F8FAFF] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-blue ${stage === key ? "shadow-[inset_0_-2px_0_var(--blue)]" : ""}`}>
      <div className={`text-[26px] font-semibold leading-none tabular-nums ${n === 0 ? "text-faint" : alert ? "text-bad" : "text-ink"}`}>{n}</div>
      <div className="mt-2 text-xs text-muted">{label}</div>
    </Link>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-ink">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted">Every training, from request to feedback.</p>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {tile("attention", "Needs attention", scoped.filter((t) => t.attention).length, true)}
        {TILES.map((s) => tile(s, STAGE_LABEL[s], scoped.filter((t) => t.stage === s).length))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <nav className="flex items-center gap-5" aria-label="Filter by date">
            {WHEN_OPTIONS.map((w) => {
              const on = !stage && when === w;
              return <Link key={w} href={link(w === "active" ? {} : { when: w })} aria-current={on ? "true" : undefined} className={`text-sm transition ${on ? "font-semibold text-ink" : "text-muted hover:text-ink"}`}>{WHEN_LABEL[w]}</Link>;
            })}
            {(stage || growth || trainer) && <Link href="/dashboard" className="text-sm text-blue hover:underline">Clear filters</Link>}
          </nav>
          <DashboardFilters stage={stage} when={when} growth={growth} trainer={trainer} requesters={[...requesters.entries()].sort(byName)} trainers={[...trainerOptions.entries()].sort(byName)} />
        </div>

        <div className={`${ROW_GRID} hidden border-b border-line py-2.5 pl-5 pr-10 text-xs text-muted xl:grid`}>
          <span>Training</span><span>Requested</span><span>Content</span><span>Trainer</span><span>Delivery</span><span>Feedback</span>
        </div>

        {rows.length === 0 && <p className="px-5 py-12 text-center text-sm text-muted">No trainings match these filters.</p>}
        {attention.length > 0 && <Group label="Needs attention" count={attention.length} alert />}
        {attention.map((t) => <TrainingRow key={t.key} t={t} today={today} />)}
        {attention.length > 0 && others.length > 0 && <Group label="Other trainings" count={others.length} />}
        {others.map((t) => <TrainingRow key={t.key} t={t} today={today} />)}
      </section>
    </div>
  );
}

function Group({ label, count, alert }: { label: string; count: number; alert?: boolean }) {
  return (
    <div className="border-b border-line bg-[#FAFBFE] px-5 py-2 text-xs font-medium">
      <span className={alert ? "text-bad" : "text-muted"}>{label}</span> <span className="tabular-nums text-faint">{count}</span>
    </div>
  );
}

function TrainingRow({ t, today }: { t: Training; today: string }) {
  const dayCount = t.live || t.days.length;
  const steps = cycleSteps(t, today);
  return (
    <details className="group border-b border-line last:border-b-0">
      <summary className="relative cursor-pointer list-none py-4 pl-5 pr-10 transition hover:bg-[#F8FAFF] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue [&::-webkit-details-marker]:hidden">
        <span className={`${ROW_GRID} gap-y-3 ${t.live ? "" : "opacity-60"}`}>
          <span className="min-w-0 pr-4 md:col-span-5 xl:col-span-1">
            <Link href={`/bookings/${t.linkId}`} className="block text-[15px] font-semibold leading-snug text-ink hover:text-blue">{t.company ?? t.program}</Link>
            <span className="mt-0.5 block text-xs text-muted">{t.company ? `${t.program} · ` : ""}{dayCount} {dayCount === 1 ? "day" : "days"}</span>
          </span>
          {steps.map((s, i) => <StepCell key={s.key} step={s} last={i === steps.length - 1} next={steps[i + 1]?.state} />)}
        </span>
        <svg aria-hidden viewBox="0 0 16 16" className="absolute right-4 top-5 h-4 w-4 text-faint transition group-open:rotate-90 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
      </summary>
      <ul className="border-t border-line bg-[#FAFBFE] py-1">
        {t.days.map((d) => <DayRow key={d.id} d={d} />)}
      </ul>
    </details>
  );
}

function StepCell({ step, last, next }: { step: Step; last: boolean; next?: StepState }) {
  const reached = step.state === "done" && next !== "none";
  return (
    <span className="flex min-w-0 gap-3 md:block">
      <span className="flex items-center pt-1 md:pt-0">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[step.state]}`} />
        {!last && <span className={`ml-1.5 mr-1.5 hidden h-px flex-1 md:block ${reached ? "bg-royal/40" : "bg-line"}`} />}
      </span>
      <span className="block min-w-0 pr-3 md:mt-2">
        <span className="block text-[11px] text-faint xl:hidden">{step.label}</span>
        <span className={`block text-[13px] font-medium leading-snug ${TITLE[step.state]}`}>{step.title}</span>
        {step.detail && <span className="mt-0.5 block text-xs leading-snug text-muted">{step.detail}</span>}
      </span>
    </span>
  );
}

function DayRow({ d }: { d: CycleDay }) {
  const state = DAY_STATE[d.status] ?? "none";
  const declined = isDeclined(d);
  return (
    <li className="px-5 py-2 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href={`/bookings/${d.id}`} className="w-44 font-medium text-blue hover:underline">Day {d.day_number} · {fmtDate(d.date, { weekday: "short", day: "numeric", month: "short" })}</Link>
        <span className="w-40 text-ink">{d.trainers?.full_name ?? <span className="text-muted">No trainer</span>}</span>
        <span className={`flex items-center gap-2 ${d.status === "cancelled" ? "text-faint line-through" : TITLE[state]}`}>
          <span className={`h-2 w-2 rounded-full ${DOT[state]}`} />
          {declined ? "Declined, needs a new trainer" : STATUS_LABEL[d.status] ?? d.status}
        </span>
      </div>
      {declined && d.trainer_comment && <p className="mt-1 text-xs text-muted">{d.trainer_comment}</p>}
    </li>
  );
}
