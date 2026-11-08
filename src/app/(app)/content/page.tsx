import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AutoSelect } from "@/components/auto-select";
import { requireAccess } from "@/lib/auth";
import { buildTrainings, isContentFilter, type ContentState, type CycleDay, type CycleDeal, type Training } from "@/lib/cycle";
import { fmtDate, fmtTime, isUuid, todayISO } from "@/lib/format";
import { db, fetchAll } from "@/lib/supabase";
import { CONTENT_STYLE } from "../dashboard/styles";

type State = Exclude<ContentState, "none">;
const STATES: State[] = ["needs_content", "in_progress", "submitted"];
const LABEL: Record<State, string> = { needs_content: "Not started", in_progress: "In progress", submitted: "Submitted" };
const SOON_DAYS = 7;

// Every deal Growth sent, laid out like the Training Excellence dashboard. Waiting ones first, soonest training on top.
export default async function ContentPage({ searchParams }: PageProps<"/content">) {
  await requireAccess("content.view");
  const params = await searchParams;
  const state = isContentFilter(params.state) ? params.state : null;
  const soon = params.soon === "1";
  const review = params.review === "1";
  const growth = isUuid(params.growth) ? params.growth : "";
  const trainer = isUuid(params.trainer) ? params.trainer : "";

  const [days, deals, files, users, reviews] = await Promise.all([
    fetchAll<CycleDay>((from, to) => db().from("bookings").select("id, deal_id, batch_id, program_name, day_number, date, start_time, end_time, status, trainer_id, created_by, created_at, trainer_comment, trainer_responded_at, finished_at, brief_submitted_at, trainers(full_name), industry:lookups!bookings_industry_id_fkey(name)").not("deal_id", "is", null).order("id").range(from, to)),
    fetchAll<CycleDeal>((from, to) => db().from("deals").select("id, company_name, content_guide, content_submitted_at, created_at").order("id").range(from, to)),
    fetchAll<{ deal_id: string }>((from, to) => db().from("deal_content").select("deal_id").order("id").range(from, to)),
    fetchAll<{ id: string; full_name: string }>((from, to) => db().from("app_users").select("id, full_name").order("id").range(from, to)),
    fetchAll<{ id: string; content_review_requested_at: string | null; content_review_note: string | null }>((from, to) =>
      db().from("deals").select("id, content_review_requested_at, content_review_note").or("content_review_requested_at.not.is.null,content_review_note.not.is.null").order("id").range(from, to),
    ),
  ]);
  const failed = [days, deals, files, users, reviews].find((r) => r.error);
  if (failed) {
    console.error("[content]", failed.error);
    return (
      <div className="space-y-5">
        <PageHeader kicker="Content" title={<>Content requests</>} />
        <p className="rounded-xl bg-bad-bg px-4 py-3 text-sm text-bad">The content requests couldn&apos;t load. Please refresh and try again.</p>
      </div>
    );
  }

  const today = todayISO();
  const soonEnd = addDays(today, SOON_DAYS);
  // a member's content waiting for a content admin, or sent back with a note
  const awaiting = new Set(reviews.data.filter((r) => r.content_review_requested_at).map((r) => r.id));
  const returned = new Set(reviews.data.filter((r) => !r.content_review_requested_at && r.content_review_note).map((r) => r.id));
  const dealOf = (t: Training) => t.days[0].deal_id ?? "";
  const fileCount = new Map<string, number>();
  for (const f of files.data) fileCount.set(f.deal_id, (fileCount.get(f.deal_id) ?? 0) + 1);

  const trainings = buildTrainings({
    days: days.data,
    deals: deals.data,
    contentFileDealIds: files.data.map((f) => f.deal_id),
    feedback: [],
    audioBookingIds: [],
    names: new Map(users.data.map((u) => [u.id, u.full_name])),
    today,
  })
    .filter((t) => t.content !== "none" && t.stage !== "cancelled")
    .sort((a, b) => Number(a.content === "submitted") - Number(b.content === "submitted") || a.firstDate.localeCompare(b.firstDate));

  const startsSoon = (t: Training) => t.content !== "submitted" && t.firstDate >= today && t.firstDate <= soonEnd;

  const requesters = new Map<string, string>();
  const trainerOptions = new Map<string, string>();
  for (const t of trainings) {
    if (t.requestedBy && t.requestedByName) requesters.set(t.requestedBy, t.requestedByName);
    for (const x of t.trainers) trainerOptions.set(x.id, x.name);
  }
  const byName = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1]);

  const scoped = trainings.filter((t) => (!growth || t.requestedBy === growth) && (!trainer || t.trainers.some((x) => x.id === trainer)));
  const rows = scoped.filter((t) => (!state || t.content === state) && (!soon || startsSoon(t)) && (!review || awaiting.has(dealOf(t))));

  const link = (p: Record<string, string>) => {
    const q = new URLSearchParams({ ...(growth ? { growth } : {}), ...(trainer ? { trainer } : {}), ...p }).toString();
    return q ? `/content?${q}` : "/content";
  };
  const active = (key: string) => (key === "all" ? !state && !soon && !review : key === "soon" ? soon : key === "review" ? review : state === key);
  const tile = (key: string, label: string, n: number, href: string) => (
    <Link key={key} href={href} className={`rounded-xl p-3 transition hover:brightness-95 ${key === "all" ? "stat-hot text-white" : "border border-ice2 bg-ice"} ${active(key) ? "ring-2 ring-royal ring-offset-2" : ""}`}>
      <div className={`text-2xl font-bold tabular-nums ${key === "all" ? "" : key === "soon" && n ? "text-bad" : "text-royal-deep"}`}>{n}</div>
      <div className={`text-[10.5px] font-medium uppercase tracking-wider ${key === "all" ? "text-[#93C5FD]" : "text-[#3B82F6]"}`}>{label}</div>
    </Link>
  );

  return (
    <div className="space-y-5">
      <PageHeader kicker="Content" title={<>Content requests</>} lead={<>Every deal Growth sends lands here. Open a training to read the brief, prepare the guide and files, then submit them to the trainer.</>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tile("all", "All requests", scoped.length, link({}))}
        {STATES.map((s) => tile(s, LABEL[s], scoped.filter((t) => t.content === s).length, link({ state: s })))}
        {tile("review", "Awaiting approval", scoped.filter((t) => awaiting.has(dealOf(t))).length, link({ review: "1" }))}
        {tile("soon", `Starts within ${SOON_DAYS} days`, scoped.filter(startsSoon).length, link({ soon: "1" }))}
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/content">
        <AutoSelect name="growth" defaultValue={growth} className="input w-44 py-1.5" aria-label="Growth lead">
          <option value="">All Growth leads</option>
          {[...requesters.entries()].sort(byName).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </AutoSelect>
        <AutoSelect name="trainer" defaultValue={trainer} className="input w-44 py-1.5" aria-label="Trainer">
          <option value="">All trainers</option>
          {[...trainerOptions.entries()].sort(byName).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </AutoSelect>
        <AutoSelect name="state" defaultValue={state ?? ""} className="input w-44 py-1.5" aria-label="Content status">
          <option value="">Any content status</option>
          {STATES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
        </AutoSelect>
        {soon && <input type="hidden" name="soon" value="1" />}
        {review && <input type="hidden" name="review" value="1" />}
        <noscript><button className="btn-ghost btn-sm">Filter</button></noscript>
        {(state || soon || review || growth || trainer) && <Link href="/content" className="text-sm text-blue hover:underline">Clear filters</Link>}
      </form>

      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>Date</th><th>Company</th><th>Training</th><th>Industry</th><th>Growth lead</th><th>Trainer</th><th>Files</th><th>Content status</th><th>Submitted</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-muted">{!state && !soon && !review ? "No content requests yet." : "Nothing here."}</td></tr>}
            {rows.map((t) => <Row key={t.key} t={t} files={fileCount.get(dealOf(t)) ?? 0} soon={startsSoon(t)} review={awaiting.has(dealOf(t)) ? "awaiting" : returned.has(dealOf(t)) ? "returned" : null} />)}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Row({ t, files, soon, review }: { t: Training; files: number; soon: boolean; review: "awaiting" | "returned" | null }) {
  const dayCount = t.live || t.days.length;
  const state = t.content as State;
  return (
    <tr>
      <td className="whitespace-nowrap">
        {fmtDate(t.firstDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        <div className="text-xs text-muted">{dayCount > 1 ? `Until ${fmtDate(t.lastDate, { day: "numeric", month: "short", year: "numeric" })}` : `${fmtTime(t.firstDay.start_time)} – ${fmtTime(t.firstDay.end_time)}`}</div>
        {soon && <div className="mt-1"><span className="badge whitespace-nowrap bg-bad-bg text-bad">Starts soon</span></div>}
      </td>
      <td className="text-sm">{t.company ?? <span className="text-muted">—</span>}</td>
      <td>
        <Link href={`/content/${t.days[0].deal_id}`} className="font-medium text-blue hover:underline">{t.program}</Link>
        <div className="text-xs text-muted">{dayCount} {dayCount === 1 ? "day" : "days"}</div>
      </td>
      <td className="text-xs text-muted">{t.industry ?? "—"}</td>
      <td className="text-sm">{t.requestedByName ?? "—"}</td>
      <td className="text-sm">{t.trainers.length ? t.trainers.map((x) => x.name).join(", ") : <span className="text-muted">Not assigned yet</span>}</td>
      <td className="text-sm tabular-nums">{files || <span className="text-muted">—</span>}</td>
      <td>
        <span className={`badge whitespace-nowrap ${CONTENT_STYLE[state]}`}>{LABEL[state]}</span>
        {review === "awaiting" && <div className="mt-1"><span className="badge whitespace-nowrap bg-[#E2EBFE] text-royal">Awaiting approval</span></div>}
        {review === "returned" && <div className="mt-1"><span className="badge whitespace-nowrap bg-warn-bg text-warn">Changes requested</span></div>}
      </td>
      <td className="whitespace-nowrap text-sm">{t.contentSubmittedAt ? fmtDate(t.contentSubmittedAt.slice(0, 10), { day: "numeric", month: "short", year: "numeric" }) : <span className="text-muted">—</span>}</td>
    </tr>
  );
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
