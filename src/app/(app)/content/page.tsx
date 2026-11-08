import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireAccess } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { db, fetchAll } from "@/lib/supabase";

type Deal = { id: string; company_name: string; content_submitted_at: string | null; created_at: string };
type Day = { deal_id: string; program_name: string; day_number: number; date: string };

// Every deal Growth sent, newest first, with the ones still waiting for content on top.
export default async function ContentPage() {
  await requireAccess("content.view");
  const [deals, days] = await Promise.all([
    fetchAll<Deal>((from, to) => db().from("deals").select("id, company_name, content_submitted_at, created_at").order("created_at", { ascending: false }).range(from, to)),
    fetchAll<Day>((from, to) => db().from("bookings").select("deal_id, program_name, day_number, date").not("deal_id", "is", null).neq("status", "cancelled").order("deal_id").order("day_number").range(from, to)),
  ]);
  const byDeal = new Map<string, Day[]>();
  for (const d of days.data) byDeal.set(d.deal_id, [...(byDeal.get(d.deal_id) ?? []), d]);
  const rows = deals.data
    .filter((d) => byDeal.has(d.id))
    .map((d) => ({ ...d, days: byDeal.get(d.id)! }))
    .sort((a, b) => Number(!!a.content_submitted_at) - Number(!!b.content_submitted_at));
  const waiting = rows.filter((r) => !r.content_submitted_at).length;
  return (
    <div className="space-y-5">
      <PageHeader kicker="Content" title={<>Content requests</>} lead={<>Every deal Growth sends lands here. Open one to read the audience and proposal, then write the content and submit it so the trainer can use it. {waiting ? `${waiting} waiting for content.` : "Nothing is waiting."}</>} />
      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>Company</th><th>Program</th><th>Training days</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted">No requests yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-medium"><Link href={`/content/${r.id}`} className="text-blue hover:underline">{r.company_name || "—"}</Link></td>
                <td>{r.days[0].program_name}</td>
                <td className="text-sm">
                  {r.days.length} {r.days.length === 1 ? "day" : "days"}
                  <div className="text-xs text-muted">{fmtDate(r.days[0].date, { day: "numeric", month: "short", year: "numeric" })}{r.days.length > 1 ? ` – ${fmtDate(r.days[r.days.length - 1].date, { day: "numeric", month: "short", year: "numeric" })}` : ""}</div>
                </td>
                <td>{r.content_submitted_at ? <span className="badge bg-good-bg text-good">Submitted</span> : <span className="badge bg-warn-bg text-warn">Needs content</span>}</td>
                <td className="text-right"><Link href={`/content/${r.id}`} className="btn-ghost btn-sm">{r.content_submitted_at ? "Open" : "Prepare content"}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
