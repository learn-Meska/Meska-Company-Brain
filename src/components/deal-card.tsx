import type { ReactNode } from "react";
import { ProposalActions } from "@/components/booking-ui";
import { FileBadge } from "@/components/file-badge";
import { BuildingIcon, CalendarIcon, CoinsIcon, DownloadIcon, LayersIcon, TagIcon, UsersIcon } from "@/components/icons";
import { db } from "@/lib/supabase";
import { dealTotal, fmtAmount } from "@/lib/deal";

type Deal = { id: string; company_name: string; value_per_day: number | string; days: number; proposal_name: string; proposal_size: number | null };
type Person = { name: string; title: string | null; department: string | null };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";


function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-ds-border bg-ds-surface p-4 sm:p-5">
      <span className="ds-icon-solid">{icon}</span>
      <div className="min-w-0">
        <dt className="text-sm text-ds-text">{label}</dt>
        <dd className="mt-0.5 whitespace-nowrap text-2xl font-semibold tabular-nums tracking-tight text-ds-heading">{value}</dd>
      </div>
    </div>
  );
}

// The commercial side of a New deal: value, proposal and the participant list. Meska team only, never trainers.
// `actions` (e.g. reassign or cancel the training) are shown under the participants.
// showValue: only logins with "See deal value" get the value and the proposal.
export async function DealCard({ dealId, bookingId, actions, showValue = true }: { dealId: string; bookingId: string; actions?: ReactNode; showValue?: boolean }) {
  const [{ data: deal }, { data: people }, { data: days }] = await Promise.all([
    db().from("deals").select("id, company_name, value_per_day, days, proposal_name, proposal_size").eq("id", dealId).maybeSingle(),
    db().from("deal_participants").select("name, title, department").eq("deal_id", dealId).order("position").range(0, 999),
    db().from("bookings").select("location, status").eq("deal_id", dealId),
  ]);
  if (!deal) return null;
  const d = deal as Deal;
  const perDay = Number(d.value_per_day);
  const list = (people ?? []) as Person[];
  const live = ((days ?? []) as { location: string | null; status: string }[]).filter((x) => x.status !== "cancelled");
  const places = [...new Set(live.map((x) => x.location?.trim()).filter((x): x is string => !!x))];
  const where = places.length ? places.join(" · ") : "Location to be confirmed";
  const dayCount = live.length || d.days;
  const size = d.proposal_size ? `${Math.max(0.1, d.proposal_size / 1048576).toFixed(1)} MB` : null;

  return (
    <div className="@container space-y-6">
      <section className="ds-card relative space-y-6 overflow-hidden p-5 sm:p-6">
        <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-ds-primary" />
        <header>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-ds-primary/[0.08] px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ds-primary">
            <TagIcon size={13} /> New deal
          </span>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ds-heading">{d.company_name ? `${d.company_name} · Deal details` : "Deal details"}</h2>
          <p className="mt-1 text-sm text-ds-text">Shared by every day of this request. Only the Meska team sees it; trainers don&apos;t.</p>
        </header>

        {showValue && (<>
        <dl className="grid gap-4 @xl:grid-cols-3">
          <Metric icon={<CoinsIcon />} label="Value per day" value={fmtAmount(perDay)} />
          <Metric icon={<CalendarIcon />} label="Days" value={d.days} />
          <Metric icon={<LayersIcon />} label="Total value" value={fmtAmount(dealTotal(perDay, d.days))} />
        </dl>

        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-ds-border bg-ds-surface p-4">
          <FileBadge name={d.proposal_name} />
          {/* wide enough to read the name; on a phone the buttons wrap to their own line instead */}
          <div className="min-w-[11rem] flex-1">
            <div className="truncate text-sm font-semibold text-ds-heading" title={d.proposal_name}>{d.proposal_name}</div>
            <div className="mt-0.5 text-xs text-ds-text">Proposal{size ? ` · ${size}` : ""}</div>
          </div>
          <ProposalActions dealId={d.id} canPreview={/\.pdf$/i.test(d.proposal_name)} />
        </div>
        </>)}
      </section>

      <section className="ds-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <h3 className="flex items-center gap-3 text-base font-semibold text-ds-heading">
            <span className="ds-icon-soft h-9 w-9"><UsersIcon size={18} /></span>
            Participants ({list.length})
          </h3>
          {list.length > 0 && (
            <a href={`/bookings/${bookingId}/participants`} className="ds-btn ds-btn-primary">
              <DownloadIcon size={16} /> Download CSV
            </a>
          )}
        </div>
        {list.length === 0 ? (
          <p className="border-t border-ds-border px-5 py-6 text-sm text-ds-text sm:px-6">No participants on this deal.</p>
        ) : (
          // A table on wide cards; on narrow ones each participant stacks into a block, so nothing scrolls sideways.
          <div role="table" aria-label="Participants" className="max-h-[32rem] overflow-y-auto border-t border-ds-border">
            <div role="row" className="sticky top-0 z-10 hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.3fr)] gap-4 border-b border-ds-primary/10 bg-ds-primary-soft px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ds-primary @2xl:grid">
              <span role="columnheader">Participant</span>
              <span role="columnheader">Department</span>
              <span role="columnheader">Details</span>
            </div>
            {list.map((p, i) => (
              <div role="row" key={i} className="grid gap-3 border-b border-ds-border px-5 py-4 transition last:border-b-0 hover:bg-ds-primary-soft/40 sm:px-6 @2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.3fr)] @2xl:items-center @2xl:gap-4">
                <div role="cell" className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-ds-primary-soft text-xs font-semibold text-ds-primary">{initials(p.name)}</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ds-heading">{p.name}</div>
                    <div className="truncate text-xs text-ds-text">{p.title || "No title"}</div>
                  </div>
                </div>
                <div role="cell" className="pl-12 @2xl:pl-0">
                  {p.department ? <span className="ds-chip">{p.department}</span> : <span className="text-sm text-ds-text">—</span>}
                </div>
                <div role="cell" className="space-y-1 pl-12 text-xs text-ds-text @2xl:pl-0">
                  <div className="flex items-center gap-2"><CalendarIcon size={14} className="flex-none text-ds-text" /> Training · {dayCount} {dayCount === 1 ? "day" : "days"}</div>
                  <div className="flex items-center gap-2"><BuildingIcon size={14} className="flex-none text-ds-text" /> <span className="truncate">{where}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {actions && <div className="grid items-start gap-4 @2xl:grid-cols-2">{actions}</div>}
    </div>
  );
}
