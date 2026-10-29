import { DownloadButton } from "@/components/booking-ui";
import { db } from "@/lib/supabase";
import { dealTotal, fmtAmount } from "@/lib/deal";

type Deal = { id: string; value_per_day: number | string; days: number; proposal_name: string; proposal_size: number | null };
type Person = { name: string; title: string | null; department: string | null };

// The commercial side of a New deal: value, proposal and the participant list. Meska team only, never trainers.
export async function DealCard({ dealId, bookingId }: { dealId: string; bookingId: string }) {
  const [{ data: deal }, { data: people }] = await Promise.all([
    db().from("deals").select("id, value_per_day, days, proposal_name, proposal_size").eq("id", dealId).maybeSingle(),
    db().from("deal_participants").select("name, title, department").eq("deal_id", dealId).order("position").range(0, 999),
  ]);
  if (!deal) return null;
  const d = deal as Deal;
  const perDay = Number(d.value_per_day);
  const list = (people ?? []) as Person[];
  return (
    <section className="card space-y-4">
      <div>
        <div className="eyebrow">New deal</div>
        <h2 className="h2">Deal details</h2>
        <p className="text-xs text-muted">Shared by every day of this request. Only the Meska team sees it; trainers don&apos;t.</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-surface2 p-3">
          <dt className="label">Value per day</dt>
          <dd className="text-lg font-semibold tabular-nums">{fmtAmount(perDay)}</dd>
        </div>
        <div className="rounded-xl bg-surface2 p-3">
          <dt className="label">Days</dt>
          <dd className="text-lg font-semibold tabular-nums">{d.days}</dd>
        </div>
        <div className="rounded-xl bg-surface2 p-3">
          <dt className="label">Total value</dt>
          <dd className="text-lg font-semibold tabular-nums">{fmtAmount(dealTotal(perDay, d.days))}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface2 px-3 py-2">
        <DownloadButton id={d.id} name={d.proposal_name} kind="proposal" />
        <span className="text-xs text-muted">Proposal{d.proposal_size ? ` · ${(d.proposal_size / 1048576).toFixed(1)} MB` : ""}</span>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Participants ({list.length}) ·{" "}
          <a href={`/bookings/${bookingId}/participants`} className="text-blue hover:underline">Download CSV</a>
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 pr-3">#</th>
                <th className="py-1 pr-3">Name</th>
                <th className="py-1 pr-3">Title</th>
                <th className="py-1">Department</th>
              </tr>
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
  );
}
