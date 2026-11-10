import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ProposalActions } from "@/components/booking-ui";
import { ContentEditor } from "@/components/content-editor";
import { FileBadge } from "@/components/file-badge";
import { BuildingIcon, CalendarIcon, CheckIcon, DownloadIcon, TagIcon, UsersIcon } from "@/components/icons";
import { can, requireAccess } from "@/lib/auth";
import { approvesContent } from "@/lib/team-access";
import { fmtDate, fmtDateTime, fmtTime, isUuid } from "@/lib/format";
import { db } from "@/lib/supabase";

type Deal = {
  id: string;
  company_name: string;
  proposal_name: string;
  proposal_size: number | null;
  content_guide: string | null;
  content_submitted_at: string | null;
  content_review_guide: string | null;
  content_review_requested_at: string | null;
  content_review_note: string | null;
  requester: { full_name: string } | null;
};
type Day = { id: string; program_name: string; day_number: number; date: string; start_time: string; end_time: string; location: string | null; industry: { name: string } | null };
type Person = { name: string; title: string | null; department: string | null };
type ContentFile = { id: string; file_name: string; size_bytes: number | null };

function Panel({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="ds-card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-ds-border px-5 py-3.5">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold text-ds-heading">
          <span className="ds-icon-soft h-8 w-8">{icon}</span>
          {title}
        </h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

// Where the content team stands on this deal: read the brief, prepare the content, submit it.
function Progress({ hasWork, submitted }: { hasWork: boolean; submitted: boolean }) {
  const steps = [
    { label: "Read the brief", done: true },
    { label: "Prepare content", done: hasWork || submitted },
    { label: "Approved by a content admin", done: submitted },
    { label: "Submitted to the trainer", done: submitted },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="ds-card grid gap-3 p-4 sm:grid-cols-4 sm:gap-0 sm:p-0">
      {steps.map((s, i) => {
        const active = i === current;
        return (
          <li key={s.label} className={`flex items-center gap-3 sm:px-5 sm:py-4 ${i > 0 ? "sm:border-l sm:border-ds-border" : ""}`}>
            <span
              className={`grid h-7 w-7 flex-none place-items-center rounded-full text-xs font-semibold ${
                s.done ? "bg-ds-primary text-white" : active ? "bg-ds-primary-soft text-ds-primary ring-2 ring-ds-primary" : "bg-ds-subtle text-ds-text"
              }`}
            >
              {s.done ? <CheckIcon size={14} /> : i + 1}
            </span>
            <span className={`text-sm ${s.done || active ? "font-semibold text-ds-heading" : "text-ds-text"}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// One deal for the content team: the brief to read (proposal, audience, days) and the workspace for the content.
// The deal's value is left out on purpose.
export default async function ContentRequestPage({ params }: PageProps<"/content/[dealId]">) {
  const me = await requireAccess("content.view");
  const { dealId } = await params;
  if (!isUuid(dealId)) notFound();
  const [{ data: deal }, { data: days }, { data: people }, { data: files }] = await Promise.all([
    db().from("deals").select("id, company_name, proposal_name, proposal_size, content_guide, content_submitted_at, content_review_guide, content_review_requested_at, content_review_note, requester:app_users!deals_content_review_requested_by_fkey(full_name)").eq("id", dealId).maybeSingle(),
    db().from("bookings").select("id, program_name, day_number, date, start_time, end_time, location, industry:lookups!bookings_industry_id_fkey(name)").eq("deal_id", dealId).neq("status", "cancelled").order("day_number"),
    db().from("deal_participants").select("name, title, department").eq("deal_id", dealId).order("position").range(0, 999),
    db().from("deal_content").select("id, file_name, size_bytes").eq("deal_id", dealId).order("created_at"),
  ]);
  const d = deal as unknown as Deal | null;
  const dayRows = (days ?? []) as unknown as Day[];
  if (!d || !dayRows.length) notFound();
  const list = (people ?? []) as Person[];
  const fileRows = (files ?? []) as ContentFile[];
  const departments = new Map<string, number>();
  for (const p of list) {
    const k = p.department?.trim() || "Not specified";
    departments.set(k, (departments.get(k) ?? 0) + 1);
  }
  const deptList = [...departments.entries()].sort((a, b) => b[1] - a[1]);
  const top = deptList[0]?.[1] ?? 1;
  const size = d.proposal_size ? `${Math.max(0.1, d.proposal_size / 1048576).toFixed(1)} MB` : null;
  const first = dayRows[0];
  const last = dayRows[dayRows.length - 1];
  const submitted = !!d.content_submitted_at;
  const waiting = !!d.content_review_requested_at;
  const returned = !waiting && !!d.content_review_note;

  return (
    <div className="space-y-5">
      <Link href="/content" className="text-sm text-blue hover:underline">← Content requests</Link>

      <header className="ds-card relative overflow-hidden p-5 sm:p-6">
        <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-ds-primary" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-ds-primary/[0.08] px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ds-primary">
              <TagIcon size={13} /> Content request
            </span>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ds-heading">{first.program_name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ds-text">
              <BuildingIcon size={15} /> {d.company_name || "Company not set"}
            </p>
          </div>
          {waiting ? (
            <span className="badge bg-[#E2EBFE] text-royal">Awaiting approval</span>
          ) : returned ? (
            <span className="badge bg-warn-bg text-warn">Changes requested</span>
          ) : submitted ? (
            <span className="badge bg-good-bg text-good">Submitted {fmtDateTime(d.content_submitted_at!)}</span>
          ) : (
            <span className="badge bg-warn-bg text-warn">Needs content</span>
          )}
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["Training days", `${dayRows.length} · ${fmtDate(first.date, { day: "numeric", month: "short" })}${dayRows.length > 1 ? ` – ${fmtDate(last.date, { day: "numeric", month: "short" })}` : ""}`],
            ["Participants", String(list.length)],
            ["Industry", first.industry?.name ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-ds-subtle/70 px-4 py-3">
              <dt className="text-xs font-medium uppercase tracking-wider text-ds-text">{k}</dt>
              <dd className="mt-0.5 font-semibold text-ds-heading">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <Progress hasWork={!!d.content_guide?.trim() || fileRows.length > 0} submitted={submitted} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <ContentEditor
          dealId={d.id}
          initialGuide={(d.content_review_guide ?? d.content_guide) ?? ""}
          submittedAt={d.content_submitted_at}
          files={fileRows}
          canWrite={can(me, "content.write")}
          canSubmit={can(me, "content.submit")}
          approver={approvesContent(me)}
          review={{ pendingBy: d.requester?.full_name ?? null, pendingAt: waiting ? fmtDateTime(d.content_review_requested_at!) : null, note: d.content_review_note }}
        />

        <aside className="space-y-5 lg:sticky lg:top-20">
          <Panel icon={<TagIcon size={16} />} title="Training outline">
            <div className="flex items-center gap-3">
              <FileBadge name={d.proposal_name} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ds-heading" title={d.proposal_name}>{d.proposal_name}</div>
                <div className="text-xs text-ds-text">Read this first{size ? ` · ${size}` : ""}</div>
              </div>
            </div>
            <div className="mt-4">
              <ProposalActions dealId={d.id} canPreview={/\.pdf$/i.test(d.proposal_name)} />
            </div>
          </Panel>

          <Panel
            icon={<UsersIcon size={16} />}
            title={`Audience (${list.length})`}
            action={
              list.length > 0 && (
                <a href={`/bookings/${first.id}/participants`} className="inline-flex items-center gap-1 text-xs font-medium text-ds-primary hover:underline">
                  <DownloadIcon size={14} /> CSV
                </a>
              )
            }
          >
            {list.length === 0 ? (
              <p className="text-sm text-ds-text">No participant list was attached.</p>
            ) : (
              <>
                <ul className="space-y-2.5">
                  {deptList.map(([name, n]) => (
                    <li key={name}>
                      <div className="flex justify-between text-sm">
                        <span className="truncate text-ds-heading">{name}</span>
                        <span className="tabular-nums text-ds-text">{n}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-ds-subtle">
                        <div className="h-1.5 rounded-full bg-ds-primary" style={{ width: `${Math.max(6, (n / top) * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
                <details className="group mt-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-ds-primary hover:underline">
                    <span className="group-open:hidden">Show all participants</span>
                    <span className="hidden group-open:inline">Hide participants</span>
                  </summary>
                  <ul className="mt-3 max-h-80 divide-y divide-ds-border overflow-y-auto rounded-lg border border-ds-border">
                    {list.map((p, i) => (
                      <li key={i} className="px-3 py-2">
                        <div className="text-sm font-medium text-ds-heading">{p.name}</div>
                        <div className="text-xs text-ds-text">{[p.title, p.department].filter(Boolean).join(" · ") || "—"}</div>
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </Panel>

          <Panel icon={<CalendarIcon size={16} />} title="Training days">
            <ol className="relative space-y-4 border-l border-ds-border pl-5">
              {dayRows.map((x) => (
                <li key={x.id} className="relative">
                  <span aria-hidden className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-ds-primary ring-1 ring-ds-primary" />
                  <div className="text-sm font-semibold text-ds-heading">Day {x.day_number} · {fmtDate(x.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>
                  <div className="text-xs text-ds-text">
                    {fmtTime(x.start_time)} – {fmtTime(x.end_time)}
                    {x.location && !/^https?:\/\//.test(x.location) ? ` · ${x.location}` : ""}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
