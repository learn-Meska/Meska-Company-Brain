import Link from "next/link";
import type { ReactNode } from "react";
import { DownloadButton, MaterialUploader } from "@/components/booking-ui";
import { DeliveryDialog } from "@/components/delivery-dialog";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { FeedbackResults } from "@/components/feedback-results";
import { DeliveryReportCard } from "@/components/delivery-report";
import { BuildingIcon, CalendarIcon, CheckIcon, DownloadIcon, LayersIcon, PenIcon, UsersIcon } from "@/components/icons";
import { asDeliveryReport } from "@/lib/delivery";
import { StatusBadge } from "@/components/status";
import { db } from "@/lib/supabase";
import { feedbackAlwaysOpen, takesFeedback } from "@/lib/feedback-mode";
import { feedbackWindow, isPast, fmtDate, fmtDateTime, fmtTime, programVisible, SLOT_LABEL } from "@/lib/format";
import { bookingFeedback } from "@/lib/feedback";
import { googleCalendarUrl } from "@/lib/ics";
import { siteUrl } from "@/lib/email";
import type { BookingRow } from "@/lib/notify";
import { getDealInfo } from "@/lib/deal-info";
import { isAudioPath } from "@/lib/files";

type Material = { id: string; file_name: string; file_path: string; size_bytes: number | null; created_at: string; kind: string };

const GHOST = "ds-btn border border-ds-border bg-ds-surface text-ds-heading hover:border-ds-primary/50";
const mb = (n: number | null) => (n ? `${Math.max(0.1, n / 1048576).toFixed(1)} MB` : "");

function Panel({ icon, title, meta, action, children, flush = false }: { icon: ReactNode; title: string; meta?: ReactNode; action?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="ds-card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ds-border px-5 py-3.5">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold text-ds-heading">
          <span className="ds-icon-soft h-8 w-8">{icon}</span>
          {title}
          {meta && <span className="text-xs font-normal text-ds-text">{meta}</span>}
        </h2>
        {action}
      </header>
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

function FileRow({ children, meta }: { children: ReactNode; meta?: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
      {children}
      {meta && <span className="text-xs text-ds-text">{meta}</span>}
    </li>
  );
}

// One training day, for the assigned trainer (trainerView) or the Meska team.
export async function Ticket({ b, canUpload, trainerView = false }: { b: BookingRow; canUpload: boolean; trainerView?: boolean }) {
  const [{ data: mats }, { data: skills }, deal] = await Promise.all([
    db().from("booking_materials").select("*").eq("booking_id", b.id).order("created_at"),
    b.skill_ids.length ? db().from("skills").select("name").in("id", b.skill_ids) : Promise.resolve({ data: [] }),
    getDealInfo(b.deal_id),
  ]);
  const all = (mats ?? []) as Material[];
  const materials = all.filter((m) => m.kind !== "brief");
  const briefFiles = all.filter((m) => m.kind === "brief");
  const hideProgram = trainerView && !programVisible(b);
  const cairoToday = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const briefOpen = b.status === "confirmed" && b.date <= cairoToday;
  const win = feedbackWindow(b);
  const alwaysOpen = await feedbackAlwaysOpen();
  const qr = takesFeedback(b.status);
  const fb = qr ? await bookingFeedback(b.id) : null;
  const feedbackClosed = !alwaysOpen && isPast(win.closes);
  const feedbackUrl = `${siteUrl()}/f/${b.feedback_token}`;
  const closeLabel = win.closes.toLocaleString("en-GB", { timeZone: "Africa/Cairo", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const active = ["awaiting_trainer", "confirmed"].includes(b.status);
  const days = deal?.days.length ? deal.days : [{ id: b.id, day_number: b.day_number, date: b.date, start_time: b.start_time, end_time: b.end_time, location: b.location, trainer_id: b.trainer_id }];
  const isLink = !!b.location && /^https?:\/\//.test(b.location);

  // the key facts, shown as tiles under the title
  const facts: [string, ReactNode][] = [
    ["Date", fmtDate(b.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })],
    ["Time", `${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`],
    [
      "Location",
      b.location ? (
        isLink ? (
          <a href={b.location} target="_blank" rel="noopener" className="text-ds-primary hover:underline">Join online ↗</a>
        ) : (
          b.location
        )
      ) : (
        <span className="text-ds-text">To be confirmed</span>
      ),
    ],
    ["Participants", deal?.participants ? String(deal.participants) : "—"],
  ];
  // the rest of the details
  const details: [string, ReactNode][] = [
    ["Trainer", b.trainers?.full_name ?? "Needs a trainer"],
    ["Slots", b.slots.map((s) => SLOT_LABEL[s]).join(" + ")],
    ["Industry", b.industry?.name ?? "—"],
    // requests made before New deals had an audience level, function and skills; new deals only have the industry
    ...(b.audience ? [["Audience level", b.audience.name] as [string, ReactNode]] : []),
    ...(b.func ? [["Function", b.func.name] as [string, ReactNode]] : []),
    ...(b.skill_ids.length ? [["Skills", ((skills ?? []) as { name: string }[]).map((s) => s.name).join(", ") || "—"] as [string, ReactNode]] : []),
  ];
  // the client contact is for the Meska team only
  if (!trainerView && b.contact_name) {
    details.push([
      "Client contact",
      <span key="c">
        {b.contact_name}
        {b.contact_email && <> · <a href={`mailto:${b.contact_email}`} className="text-ds-primary hover:underline">{b.contact_email}</a></>}
        {b.contact_mobile && <> · <a href={`tel:${b.contact_mobile.replace(/[^\d+]/g, "")}`} className="text-ds-primary hover:underline">{b.contact_mobile}</a></>}
      </span>,
    ]);
  }
  const top = deal?.departments[0]?.[1] ?? 1;

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="ds-card relative overflow-hidden p-5 sm:p-6">
        <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-ds-primary" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-ds-primary/[0.08] px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ds-primary">
              <CalendarIcon size={13} /> Day {b.day_number}
              {days.length > 1 ? ` of ${days.length}` : ""}
            </span>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ds-heading">{hideProgram ? "Meska AI training" : b.program_name}</h1>
            {deal?.company && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ds-text">
                <BuildingIcon size={15} /> {deal.company}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {b.finished_at && <span className="badge bg-good-bg text-good">Delivered</span>}
            <StatusBadge status={b.status} />
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k} className="min-w-0 rounded-xl bg-ds-subtle/70 px-4 py-3">
              <dt className="text-xs font-medium uppercase tracking-wider text-ds-text">{k}</dt>
              <dd className="mt-0.5 break-words font-semibold text-ds-heading">{v}</dd>
            </div>
          ))}
        </dl>

        {(active || qr) && (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ds-border pt-5">
            {qr && (
              <a href={`/bookings/${b.id}/qr`} className="ds-btn ds-btn-primary">
                <DownloadIcon size={16} /> Feedback QR code
              </a>
            )}
            {fb && (
              <FeedbackDialog count={fb.count} subtitle={`Day ${b.day_number} · ${fmtDate(b.date)} · ${feedbackClosed ? "Closed" : alwaysOpen ? "Open any time" : `Open until ${closeLabel}`}`}>
                <div className="space-y-4">
                  {!feedbackClosed && (
                    <p className="break-all rounded-xl border border-ds-border bg-ds-surface px-4 py-3 text-xs text-ds-text">
                      Form link: <a href={feedbackUrl} target="_blank" className="text-ds-primary hover:underline">{feedbackUrl}</a>
                    </p>
                  )}
                  {fb.count === 0 ? (
                    <div className="rounded-xl border border-ds-border bg-ds-surface px-6 py-10 text-center">
                      <p className="font-semibold text-ds-heading">No feedback yet</p>
                      <p className="mt-1 text-sm text-ds-text">Show the QR code to participants at the end of the session.</p>
                    </div>
                  ) : (
                    <FeedbackResults fb={fb} />
                  )}
                </div>
              </FeedbackDialog>
            )}
            {trainerView && active && (
              <>
                <a href={`/bookings/${b.id}/ics`} className={GHOST}>
                  <CalendarIcon size={16} /> Add to calendar
                </a>
                <a href={googleCalendarUrl(b, `${siteUrl()}/me/bookings/${b.id}`)} target="_blank" rel="noopener" className={GHOST}>
                  Google Calendar ↗
                </a>
              </>
            )}
            {!qr && b.status === "awaiting_trainer" && (
              <span className="text-xs text-ds-text">{trainerView ? "The feedback QR code appears once you confirm this training." : "The feedback QR code appears once the trainer confirms."}</span>
            )}
          </div>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-5">
          {/* Content from the content team */}
          {deal?.content && (
            <Panel icon={<PenIcon size={16} />} title={trainerView ? "Your guide from the content team" : "Content from the content team"} meta={`· ${fmtDateTime(deal.content.submittedAt)}`}>
              {deal.content.guide && <p className="whitespace-pre-wrap text-sm leading-relaxed text-ds-heading">{deal.content.guide}</p>}
              {deal.content.files.length > 0 && (
                <ul className={`divide-y divide-ds-border rounded-xl border border-ds-border ${deal.content.guide ? "mt-4" : ""}`}>
                  {deal.content.files.map((f) => (
                    <FileRow key={f.id} meta={mb(f.size_bytes)}>
                      <DownloadButton id={f.id} name={f.file_name} kind="content" />
                    </FileRow>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {/* New deals don't ask for per-day content; it shows only once the booking team adds some */}
          {b.content && (
            <Panel icon={<PenIcon size={16} />} title="Content to be delivered">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ds-heading">{b.content}</p>
            </Panel>
          )}

          {(b.approver_comment || b.trainer_comment) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {b.approver_comment && (
                <div className="ds-card p-4 text-sm">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wider text-ds-text">Approver comment</div>
                  <p className="text-ds-heading">{b.approver_comment}</p>
                </div>
              )}
              {b.trainer_comment && (
                <div className="ds-card p-4 text-sm">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wider text-ds-text">Trainer comment</div>
                  <p className="text-ds-heading">{b.trainer_comment}</p>
                </div>
              )}
            </div>
          )}

          {/* Delivery report */}
          {(trainerView ? briefOpen : b.status === "confirmed") && (
            <Panel
              icon={<CheckIcon size={16} />}
              title="Delivery report"
              action={
                <div className="flex flex-wrap items-center gap-2">
                  {b.finished_at && <span className="badge bg-good-bg text-good">Delivered</span>}
                  {trainerView && (
                    <DeliveryDialog
                      bookingId={b.id}
                      dayNumber={b.day_number}
                      expected={deal?.participants || null}
                      report={asDeliveryReport(b.delivery_report)}
                      brief={b.brief ?? ""}
                      finished={!!b.finished_at}
                      files={briefFiles.map((m) => ({ id: m.id, file_name: m.file_name, audio: isAudioPath(m.file_path) }))}
                    />
                  )}
                </div>
              }
            >
              {b.finished_at || b.brief || briefFiles.length > 0 ? (
                <DeliveryReportCard
                  report={b.delivery_report}
                  brief={b.brief}
                  submittedAt={b.brief_submitted_at}
                  expected={deal?.participants || null}
                  files={briefFiles.map((m) => ({ id: m.id, file_name: m.file_name, audio: isAudioPath(m.file_path) }))}
                />
              ) : (
                <p className="text-sm text-ds-text">
                  {trainerView ? "When the day is done, mark it as delivered with a short report and the audio." : briefOpen ? "The trainer hasn't marked this day as delivered yet." : "The trainer can send the report once the training day starts."}
                </p>
              )}
            </Panel>
          )}

          {/* Materials */}
          <Panel icon={<LayersIcon size={16} />} title="Materials" meta={`(${materials.length})`} action={canUpload ? <MaterialUploader bookingId={b.id} /> : undefined}>
            {materials.length === 0 ? (
              <p className="rounded-xl bg-ds-subtle/50 px-4 py-6 text-center text-sm text-ds-text">No materials uploaded yet.</p>
            ) : (
              <ul className="divide-y divide-ds-border rounded-xl border border-ds-border">
                {materials.map((m) => (
                  <FileRow key={m.id} meta={[mb(m.size_bytes), fmtDateTime(m.created_at)].filter(Boolean).join(" · ")}>
                    <DownloadButton id={m.id} name={m.file_name} />
                  </FileRow>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20">
          {/* Training days */}
          <Panel icon={<CalendarIcon size={16} />} title="Training days" meta={`(${days.length})`} flush>
            <ol className="divide-y divide-ds-border">
              {days.map((d) => {
                const current = d.id === b.id;
                const mine = !trainerView || d.trainer_id === b.trainer_id;
                const past = d.date < cairoToday;
                const href = trainerView ? `/me/bookings/${d.id}` : `/bookings/${d.id}`;
                const body = (
                  <div className={`flex items-center gap-3 px-5 py-3 transition ${current ? "bg-ds-primary-soft" : mine ? "hover:bg-ds-subtle/60" : ""}`}>
                    <div className={`grid w-12 flex-none place-items-center rounded-xl py-1.5 text-center ${current ? "bg-ds-primary text-white" : past ? "bg-ds-subtle text-ds-text" : "border border-ds-border bg-ds-surface text-ds-heading"}`}>
                      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{fmtDate(d.date, { month: "short" })}</span>
                      <span className="text-lg font-bold leading-tight tabular-nums">{fmtDate(d.date, { day: "numeric" })}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${past && !current ? "text-ds-text" : "text-ds-heading"}`}>Day {d.day_number}</span>
                        <span className="text-xs text-ds-text">{fmtDate(d.date, { weekday: "short" })}</span>
                        {current && <span className="rounded-full bg-ds-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">Viewing</span>}
                      </div>
                      <div className="truncate text-xs text-ds-text">
                        {fmtTime(d.start_time)} – {fmtTime(d.end_time)}
                        {d.location && !/^https?:\/\//.test(d.location) ? ` · ${d.location}` : d.location ? " · Online" : ""}
                      </div>
                      {!mine && <div className="text-xs text-ds-text">Another trainer</div>}
                    </div>
                  </div>
                );
                return <li key={d.id}>{current || !mine ? body : <Link href={href}>{body}</Link>}</li>;
              })}
            </ol>
          </Panel>

          {/* Audience */}
          {deal && deal.participants > 0 && (
            <Panel icon={<UsersIcon size={16} />} title="Audience" meta={`(${deal.participants})`}>
              {deal.departments.length === 0 ? (
                <p className="text-sm text-ds-text">{deal.participants} participants.</p>
              ) : (
                <ul className="space-y-2.5">
                  {deal.departments.map(([name, n]) => (
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
              )}
            </Panel>
          )}

          {/* Other details */}
          <section className="ds-card p-5">
            <dl className="space-y-3">
              {details.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 text-sm">
                  <dt className="flex-none text-ds-text">{k}</dt>
                  <dd className="min-w-0 text-right font-medium text-ds-heading">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
