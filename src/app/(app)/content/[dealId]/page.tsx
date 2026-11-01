import Link from "next/link";
import { notFound } from "next/navigation";
import { DownloadButton } from "@/components/booking-ui";
import { ContentEditor } from "@/components/content-editor";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { fmtDate, fmtTime, isUuid } from "@/lib/format";
import { db } from "@/lib/supabase";

type Deal = { id: string; company_name: string; proposal_name: string; proposal_size: number | null; content_guide: string | null; content_submitted_at: string | null };
type Day = { id: string; program_name: string; day_number: number; date: string; start_time: string; end_time: string; location: string | null; industry: { name: string } | null };
type Person = { name: string; title: string | null; department: string | null };
type ContentFile = { id: string; file_name: string; size_bytes: number | null };

// One deal for the content team: the audience and the proposal to read, and where to put the content.
// The deal's value is left out on purpose.
export default async function ContentRequestPage({ params }: PageProps<"/content/[dealId]">) {
  await requireRole("content", "admin");
  const { dealId } = await params;
  if (!isUuid(dealId)) notFound();
  const [{ data: deal }, { data: days }, { data: people }, { data: files }] = await Promise.all([
    db().from("deals").select("id, company_name, proposal_name, proposal_size, content_guide, content_submitted_at").eq("id", dealId).maybeSingle(),
    db().from("bookings").select("id, program_name, day_number, date, start_time, end_time, location, industry:lookups!bookings_industry_id_fkey(name)").eq("deal_id", dealId).neq("status", "cancelled").order("day_number"),
    db().from("deal_participants").select("name, title, department").eq("deal_id", dealId).order("position").range(0, 999),
    db().from("deal_content").select("id, file_name, size_bytes").eq("deal_id", dealId).order("created_at"),
  ]);
  const d = deal as Deal | null;
  const dayRows = (days ?? []) as unknown as Day[];
  if (!d || !dayRows.length) notFound();
  const list = (people ?? []) as Person[];
  const departments = new Map<string, number>();
  for (const p of list) if (p.department?.trim()) departments.set(p.department.trim(), (departments.get(p.department.trim()) ?? 0) + 1);
  return (
    <div className="space-y-5">
      <Link href="/content" className="text-sm text-blue hover:underline">← Content requests</Link>
      <PageHeader kicker={d.company_name || "Content request"} title={<>{dayRows[0].program_name}</>} lead={<>{dayRows.length} training {dayRows.length === 1 ? "day" : "days"}{dayRows[0].industry?.name ? ` · ${dayRows[0].industry.name}` : ""} · {list.length} participants</>} />

      <section className="card space-y-4">
        <div>
          <div className="eyebrow">Read first</div>
          <h2 className="h2">Proposal</h2>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface2 px-3 py-2">
          <DownloadButton id={d.id} name={d.proposal_name} kind="proposal" />
          <span className="text-xs text-muted">{d.proposal_size ? `${(d.proposal_size / 1048576).toFixed(1)} MB` : ""}</span>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="eyebrow">Read first</div>
            <h2 className="h2">Audience ({list.length})</h2>
          </div>
          <a href={`/bookings/${dayRows[0].id}/participants`} className="btn-ghost btn-sm">⬇ Download CSV</a>
        </div>
        {departments.size > 0 && (
          <div className="flex flex-wrap gap-2">
            {[...departments.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => (
              <span key={name} className="badge bg-surface2">{name} · {n}</span>
            ))}
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-medium">Show the participants</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted"><th className="py-1 pr-3">#</th><th className="py-1 pr-3">Name</th><th className="py-1 pr-3">Title</th><th className="py-1">Department</th></tr>
              </thead>
              <tbody>
                {list.map((p, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1 pr-3 text-muted tabular-nums">{i + 1}</td>
                    <td className="py-1 pr-3">{p.name}</td>
                    <td className="py-1 pr-3">{p.title ?? "—"}</td>
                    <td className="py-1">{p.department ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="card space-y-3">
        <h2 className="h2">Training days</h2>
        <ul className="space-y-1.5">
          {dayRows.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface2 px-3 py-2 text-sm">
              <span className="font-medium">Day {x.day_number} · {fmtDate(x.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
              <span className="text-muted">{fmtTime(x.start_time)} – {fmtTime(x.end_time)}{x.location && !/^https?:\/\//.test(x.location) ? ` · ${x.location}` : ""}</span>
            </li>
          ))}
        </ul>
      </section>

      <ContentEditor dealId={d.id} initialGuide={d.content_guide ?? ""} submittedAt={d.content_submitted_at} files={(files ?? []) as ContentFile[]} />
    </div>
  );
}
