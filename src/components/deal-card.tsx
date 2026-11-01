import { DownloadButton } from "@/components/booking-ui";
import { db } from "@/lib/supabase";
import { dealTotal, fmtAmount } from "@/lib/deal";

type Deal = { id: string; company_name: string; value_per_day: number | string; days: number; proposal_name: string; proposal_size: number | null };

// The commercial side of a New deal: value and proposal. Meska team only, never trainers.
// (The audience — seniority, departments, headcount — is on the ticket, which trainers see too.)
export async function DealCard({ dealId }: { dealId: string }) {
  const { data: deal } = await db().from("deals").select("id, company_name, value_per_day, days, proposal_name, proposal_size").eq("id", dealId).maybeSingle();
  if (!deal) return null;
  const d = deal as Deal;
  const perDay = Number(d.value_per_day);
  return (
    <section className="card space-y-4">
      <div>
        <div className="eyebrow">New deal</div>
        <h2 className="h2">{d.company_name ? `${d.company_name} · Deal details` : "Deal details"}</h2>
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
    </section>
  );
}
