import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { AUDIT_LABEL as ACTION_LABEL, fmtDateTime } from "@/lib/format";

type Log = { id: string; action: string; booking_id: string | null; details: Record<string, unknown> | null; created_at: string; app_users: { full_name: string } | null };


export default async function LogsPage({ searchParams }: PageProps<"/admin/logs">) {
  await requireRole("admin");
  const { only } = await searchParams;
  let q = db().from("audit_log").select("*, app_users(full_name)").order("created_at", { ascending: false }).limit(300);
  if (only === "cancellations") q = q.eq("action", "booking_cancelled");
  const { data } = await q;
  const logs = (data ?? []) as Log[];
  return (
    <div className="space-y-6">
      <PageHeader kicker="Audit" title={<>Activity log</>} lead={<>Every booking action, including cancellation reasons.</>} actions={<>
          <Link href="/admin/logs" className={only ? "btn-ghost" : "btn"}>Everything</Link>
          <Link href="/admin/logs?only=cancellations" className={only ? "btn" : "btn-ghost"}>Cancellations</Link>
          <a href={`/admin/logs/export${only ? "?only=cancellations" : ""}`} className="btn-ghost">⬇ Download (Excel / CSV)</a>
        </>} />
      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-xs">{fmtDateTime(l.created_at)}</td>
                <td className="whitespace-nowrap">{l.app_users?.full_name ?? "System"}</td>
                <td className="whitespace-nowrap">
                  {l.booking_id ? (
                    <Link className="text-blue hover:underline" href={`/bookings/${l.booking_id}`}>{ACTION_LABEL[l.action] ?? l.action}</Link>
                  ) : (
                    ACTION_LABEL[l.action] ?? l.action
                  )}
                </td>
                <td className="max-w-xl text-xs text-muted">
                  {l.details && typeof l.details.reason === "string" && (
                    <div className="mb-1 whitespace-pre-wrap text-ink">
                      <b>Reason:</b> {l.details.reason}
                    </div>
                  )}
                  {l.details && Array.isArray(l.details.changes) &&
                    (l.details.changes as { field: string; from: string; to: string }[]).map((c) => (
                      <div key={c.field}>
                        {c.field}: <s>{c.from}</s> → <b>{c.to}</b>
                      </div>
                    ))}
                  {l.details && typeof l.details.comment === "string" && l.details.comment && <div>Comment: {l.details.comment}</div>}
                  {l.details && typeof l.details.program === "string" && <div>{l.details.program}</div>}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-muted">Nothing logged yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
