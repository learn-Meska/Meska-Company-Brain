import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { BuildingIcon, ChevronRightIcon } from "@/components/icons";
import { requireAccess } from "@/lib/auth";
import { fmtDate, todayISO } from "@/lib/format";
import { db, fetchAll } from "@/lib/supabase";

type Deal = { id: string; company_name: string; content_guide: string | null; content_submitted_at: string | null; created_at: string };
type Day = { deal_id: string; program_name: string; day_number: number; date: string };
type Filter = "waiting" | "submitted" | "all";

const FILTERS: [Filter, string][] = [
  ["waiting", "Needs content"],
  ["submitted", "Submitted"],
  ["all", "All"],
];

// Every deal Growth sent, the ones still waiting for content first (soonest training on top).
export default async function ContentPage({ searchParams }: PageProps<"/content">) {
  await requireAccess("content.view");
  const { show } = await searchParams;
  const filter: Filter = show === "submitted" || show === "all" ? show : "waiting";
  const [deals, days, files] = await Promise.all([
    fetchAll<Deal>((from, to) => db().from("deals").select("id, company_name, content_guide, content_submitted_at, created_at").order("created_at", { ascending: false }).range(from, to)),
    fetchAll<Day>((from, to) => db().from("bookings").select("deal_id, program_name, day_number, date").not("deal_id", "is", null).neq("status", "cancelled").order("deal_id").order("day_number").range(from, to)),
    fetchAll<{ deal_id: string }>((from, to) => db().from("deal_content").select("deal_id").order("id").range(from, to)),
  ]);
  const withFiles = new Set(files.data.map((f) => f.deal_id));
  const byDeal = new Map<string, Day[]>();
  for (const d of days.data) byDeal.set(d.deal_id, [...(byDeal.get(d.deal_id) ?? []), d]);
  const today = todayISO();
  const all = deals.data
    .filter((d) => byDeal.has(d.id))
    .map((d) => {
      const ds = byDeal.get(d.id)!;
      const state = d.content_submitted_at ? "submitted" : d.content_guide?.trim() || withFiles.has(d.id) ? "in_progress" : "not_started";
      return { ...d, days: ds, first: ds[0], last: ds[ds.length - 1], state };
    })
    .sort((a, b) => Number(!!a.content_submitted_at) - Number(!!b.content_submitted_at) || a.first.date.localeCompare(b.first.date));
  const waiting = all.filter((r) => !r.content_submitted_at);
  const rows = filter === "waiting" ? waiting : filter === "submitted" ? all.filter((r) => r.content_submitted_at) : all;
  const soon = waiting.filter((r) => r.first.date >= today && r.first.date <= addDays(today, 7)).length;

  return (
    <div className="space-y-5">
      <PageHeader kicker="Content" title={<>Content requests</>} lead={<>Every deal Growth sends lands here. Open one to read the brief, prepare the guide and files, then submit them to the trainer.</>} />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Needs content", waiting.length, "text-warn"],
          ["Starting within 7 days", soon, soon ? "text-bad" : "text-ds-heading"],
          ["Submitted", all.length - waiting.length, "text-good"],
        ].map(([label, n, tone]) => (
          <div key={label as string} className="ds-card px-5 py-4">
            <div className={`text-2xl font-semibold tabular-nums ${tone}`}>{n}</div>
            <div className="text-xs font-medium uppercase tracking-wider text-ds-text">{label}</div>
          </div>
        ))}
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Filter">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={k === "waiting" ? "/content" : `/content?show=${k}`} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${filter === k ? "bg-ds-primary text-white" : "border border-ds-border bg-ds-surface text-ds-heading hover:border-ds-primary/50"}`}>
            {label}
          </Link>
        ))}
      </nav>

      <section className="ds-card overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-ds-text">{filter === "waiting" ? "Nothing is waiting for content." : "No requests here yet."}</p>
        ) : (
          <ul className="divide-y divide-ds-border">
            {rows.map((r) => {
              const startsSoon = !r.content_submitted_at && r.first.date >= today && r.first.date <= addDays(today, 7);
              return (
                <li key={r.id}>
                  <Link href={`/content/${r.id}`} className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-ds-primary-soft/50">
                    <span className="ds-icon-soft"><BuildingIcon size={18} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ds-heading">{r.first.program_name}</span>
                      <span className="block truncate text-sm text-ds-text">{r.company_name || "Company not set"}</span>
                    </span>
                    <span className="w-44 text-sm">
                      <span className="block text-ds-heading">
                        {fmtDate(r.first.date, { day: "numeric", month: "short", year: "numeric" })}
                        {r.days.length > 1 ? ` – ${fmtDate(r.last.date, { day: "numeric", month: "short" })}` : ""}
                      </span>
                      <span className={`block text-xs ${startsSoon ? "font-medium text-bad" : "text-ds-text"}`}>
                        {r.days.length} {r.days.length === 1 ? "day" : "days"}
                        {startsSoon ? " · starts soon" : ""}
                      </span>
                    </span>
                    <span className="w-32">
                      {r.state === "submitted" ? (
                        <span className="badge bg-good-bg text-good">Submitted</span>
                      ) : r.state === "in_progress" ? (
                        <span className="badge bg-[#E2EBFE] text-royal">In progress</span>
                      ) : (
                        <span className="badge bg-warn-bg text-warn">Not started</span>
                      )}
                    </span>
                    <ChevronRightIcon className="hidden text-ds-text sm:block" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
