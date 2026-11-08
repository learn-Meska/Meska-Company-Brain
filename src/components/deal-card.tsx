import type { ReactNode } from "react";
import { ProposalActions } from "@/components/booking-ui";
import { BriefcaseIcon, BuildingIcon, CalendarIcon, CoinsIcon, DownloadIcon, LayersIcon, TagIcon, UsersIcon } from "@/components/icons";
import { db } from "@/lib/supabase";
import { dealTotal, fmtAmount } from "@/lib/deal";

type Deal = { id: string; company_name: string; value_per_day: number | string; days: number; proposal_name: string; proposal_size: number | null };
type Person = { name: string; title: string | null; department: string | null };

const AVATAR = ["bg-[#DBEAFE] text-[#1E3A8A]", "bg-[#E0E7FF] text-[#3730A3]", "bg-[#DCFCE7] text-[#166534]", "bg-[#FCE7F3] text-[#9D174D]", "bg-[#FEF3C7] text-[#92400E]", "bg-[#E0F2FE] text-[#075985]"];
const avatarStyle = (name: string) => AVATAR[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR.length];
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

// The proposal's file type, shown as a small coloured tile like the one in a file manager.
function FileBadge({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const [label, style] = ext === "pdf" ? ["PDF", "bg-[#FDE8E7] text-[#C0362C]"] : ext === "doc" || ext === "docx" ? ["W", "bg-[#E1ECFD] text-[#185ABD]"] : ext === "ppt" || ext === "pptx" ? ["P", "bg-[#FDEBE4] text-[#C43E1C]"] : [ext.slice(0, 4).toUpperCase() || "FILE", "bg-surface2 text-muted"];
  return <span className={`grid h-12 w-12 flex-none place-items-center rounded-xl text-sm font-bold ${style}`}>{label}</span>;
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ice2 bg-gradient-to-br from-ice to-ice2/70 p-4 @4xl:gap-4">
      <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-white/80 text-royal shadow-sm">{icon}</span>
      {/* the divider only where the tile has room for it */}
      <span className="hidden h-10 w-px flex-none bg-ice2 @4xl:block" />
      <div>
        <dt className="whitespace-nowrap text-sm text-muted">{label}</dt>
        <dd className="whitespace-nowrap text-xl font-bold tabular-nums text-ink @4xl:text-2xl">{value}</dd>
      </div>
    </div>
  );
}

// The commercial side of a New deal: value, proposal and the participant list. Meska team only, never trainers.
// `actions` (e.g. reassign or cancel the training) are shown at the bottom of the card.
export async function DealCard({ dealId, bookingId, actions }: { dealId: string; bookingId: string; actions?: ReactNode }) {
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
    <section className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-white via-white to-ice p-5 shadow-[0_8px_30px_rgb(15_40_90/0.06)] sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-ice2/60 blur-2xl" />
      <div className="@container relative space-y-5">
        <header>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ice2 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-royal">
            <TagIcon size={14} /> New deal
          </span>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{d.company_name ? `${d.company_name} · Deal details` : "Deal details"}</h2>
          <p className="mt-1 text-sm text-muted">Shared by every day of this request. Only the Meska team sees it; trainers don&apos;t.</p>
        </header>

        <dl className="grid gap-3 @xl:grid-cols-3">
          <Stat icon={<CoinsIcon />} label="Value per day" value={fmtAmount(perDay)} />
          <Stat icon={<CalendarIcon />} label="Days" value={d.days} />
          <Stat icon={<LayersIcon />} label="Total value" value={fmtAmount(dealTotal(perDay, d.days))} />
        </dl>

        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-white/90 p-3 sm:p-4">
          <FileBadge name={d.proposal_name} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-ink" title={d.proposal_name}>{d.proposal_name}</div>
            <div className="text-sm text-muted">Proposal{size ? ` · ${size}` : ""}</div>
          </div>
          <ProposalActions dealId={d.id} canPreview={/\.pdf$/i.test(d.proposal_name)} />
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-white/90">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-ice to-white px-4 py-3">
            <h3 className="flex items-center gap-3 text-lg font-semibold text-ink">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-ice2 text-royal"><UsersIcon /></span>
              Participants ({list.length})
            </h3>
            {list.length > 0 && (
              <a href={`/bookings/${bookingId}/participants`} className="inline-flex items-center gap-2 rounded-xl bg-royal px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:brightness-110">
                <DownloadIcon size={18} /> Download CSV
              </a>
            )}
          </div>
          {list.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">No participants on this deal.</p>
          ) : (
            <div className="max-h-[30rem] overflow-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <th className="px-4 py-3">Participant</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p, i) => (
                    <tr key={i} className="border-t border-line transition hover:bg-ice/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className={`grid h-10 w-10 flex-none place-items-center rounded-full text-sm font-semibold ${avatarStyle(p.name)}`}>{initials(p.name)}</span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-ink">{p.name}</div>
                            <div className="truncate text-xs text-muted">{p.title || "No title"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {p.department ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-ice px-3 py-1 text-xs font-medium text-royal">
                            <BriefcaseIcon size={14} /> {p.department}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        <div className="flex items-center gap-2"><CalendarIcon size={15} /> Training · {dayCount} {dayCount === 1 ? "day" : "days"}</div>
                        <div className="mt-1 flex items-center gap-2"><BuildingIcon size={15} /> {where}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {actions && <div className="grid items-start gap-3 @2xl:grid-cols-2">{actions}</div>}
      </div>
    </section>
  );
}
