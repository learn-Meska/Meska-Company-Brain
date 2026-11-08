import { DownloadButton, MaterialUploader } from "@/components/booking-ui";
import { DeliveryDialog } from "@/components/delivery-dialog";
import { FeedbackResults } from "@/components/feedback-results";
import { DeliveryReportCard } from "@/components/delivery-report";
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

// trainerView: the assigned trainer is looking — they may write the brief.
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
  const qr = takesFeedback(b.status, alwaysOpen);
  const fb = qr ? await bookingFeedback(b.id) : null;
  const feedbackClosed = !alwaysOpen && isPast(win.closes);
  const feedbackUrl = `${siteUrl()}/f/${b.feedback_token}`;
  const closeLabel = win.closes.toLocaleString("en-GB", { timeZone: "Africa/Cairo", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const rows: [string, React.ReactNode][] = [
    ...(deal?.company ? [["Company", deal.company] as [string, React.ReactNode]] : []),
    ["Date", fmtDate(b.date)],
    ["Time", `${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`],
    ["Slots", b.slots.map((s) => SLOT_LABEL[s]).join(" + ")],
    ["Trainer", b.trainers?.full_name ?? "Needs a trainer"],
    [
      "Location",
      b.location ? (
        /^https?:\/\//.test(b.location) ? <a href={b.location} target="_blank" className="text-blue hover:underline break-all">{b.location}</a> : b.location
      ) : (
        "To be confirmed"
      ),
    ],
    // requests made before New deals had an audience level, function and skills; new deals only have the industry
    ...(b.audience ? [["Audience", b.audience.name] as [string, React.ReactNode]] : []),
    ...(b.func ? [["Function", b.func.name] as [string, React.ReactNode]] : []),
    ["Industry", b.industry?.name],
    ...(deal && deal.participants
      ? [["Audience", `${deal.participants} participant${deal.participants > 1 ? "s" : ""}${deal.departments.length ? ` · ${deal.departments.map(([d, n]) => `${d} (${n})`).join(", ")}` : ""}`] as [string, React.ReactNode]]
      : []),
    ...(b.skill_ids.length ? [["Skills", ((skills ?? []) as { name: string }[]).map((s) => s.name).join(", ") || "—"] as [string, React.ReactNode]] : []),
  ];
  // the client contact is for the Meska team only
  if (!trainerView && b.contact_name) {
    rows.push([
      "Client contact",
      <span key="c">
        {b.contact_name}
        {b.contact_email && <> · <a href={`mailto:${b.contact_email}`} className="text-blue hover:underline">{b.contact_email}</a></>}
        {b.contact_mobile && <> · <a href={`tel:${b.contact_mobile.replace(/[^\d+]/g, "")}`} className="text-blue hover:underline">{b.contact_mobile}</a></>}
      </span>,
    ]);
  }
  return (
    <section className="card space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="eyebrow">Training ticket</div>
          <h1 className="h1">
            {hideProgram ? "Meska AI training" : b.program_name} <span className="text-muted">— Day {b.day_number}</span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {b.finished_at && <span className="badge bg-good-bg text-good">Delivered</span>}
          <StatusBadge status={b.status} />
        </div>
      </div>
      {(trainerView && ["awaiting_trainer", "confirmed"].includes(b.status)) || qr ? (
        <div className="flex flex-wrap gap-2">
          {trainerView && ["awaiting_trainer", "confirmed"].includes(b.status) && (
            <>
              <a href={`/bookings/${b.id}/ics`} className="btn-ghost btn-sm">📅 Add to my calendar</a>
              <a href={googleCalendarUrl(b, `${siteUrl()}/me/bookings/${b.id}`)} target="_blank" rel="noopener" className="btn-ghost btn-sm">Google Calendar ↗</a>
            </>
          )}
          {qr && <a href={`/bookings/${b.id}/qr`} className="btn btn-sm">⬇ Feedback QR code</a>}
        </div>
      ) : null}
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 border-b border-line py-1.5 text-sm">
            <dt className="w-24 flex-none text-muted">{k}</dt>
            <dd className="font-medium">{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
      {deal && deal.days.length > 1 && (
        <div>
          <h2 className="h2 mb-2">Training days ({deal.days.length})</h2>
          <ul className="space-y-1.5">
            {deal.days.map((d) => (
              <li key={d.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${d.id === b.id ? "bg-ice font-medium" : "bg-surface2"}`}>
                <span>Day {d.day_number} · {fmtDate(d.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                <span className="text-muted">{fmtTime(d.start_time)} – {fmtTime(d.end_time)}{d.location && !/^https?:\/\//.test(d.location) ? ` · ${d.location}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {deal?.content && (
        <div className="rounded-2xl border border-ice2 bg-ice p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="h2">{trainerView ? "Your guide from the content team" : "Content from the content team"}</h2>
            <span className="text-xs text-muted">Submitted {fmtDateTime(deal.content.submittedAt)}</span>
          </div>
          {deal.content.guide && <p className="whitespace-pre-wrap text-sm leading-relaxed">{deal.content.guide}</p>}
          {deal.content.files.length > 0 && (
            <ul className={`space-y-1.5 ${deal.content.guide ? "mt-3" : ""}`}>
              {deal.content.files.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
                  <DownloadButton id={f.id} name={f.file_name} kind="content" />
                  {f.size_bytes ? <span className="text-xs text-muted">{(f.size_bytes / 1048576).toFixed(1)} MB</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {/* New deals don't ask for per-day content; it shows only once the booking team adds some */}
      {b.content && (
        <div className="callout">
          <div className="eyebrow mb-1">Content to be delivered</div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{b.content}</p>
        </div>
      )}
      {(b.approver_comment || b.trainer_comment) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {b.approver_comment && <div className="rounded-xl bg-surface2 p-3 text-sm"><div className="label">Approver comment</div>{b.approver_comment}</div>}
          {b.trainer_comment && <div className="rounded-xl bg-surface2 p-3 text-sm"><div className="label">Trainer comment</div>{b.trainer_comment}</div>}
        </div>
      )}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="h2">Materials</h2>
          {canUpload && <MaterialUploader bookingId={b.id} />}
        </div>
        {materials.length === 0 ? (
          <p className="text-sm text-muted">No materials uploaded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {materials.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface2 px-3 py-2">
                <DownloadButton id={m.id} name={m.file_name} />
                <span className="text-xs text-muted">
                  {m.size_bytes ? `${(m.size_bytes / 1048576).toFixed(1)} MB · ` : ""}
                  {fmtDateTime(m.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {(trainerView ? briefOpen : b.status === "confirmed") && (
        <section className="ds-card overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ds-border px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-ds-heading">Delivery report</h2>
              <p className="text-sm text-ds-text">
                {b.finished_at
                  ? `Day ${b.day_number} was marked as delivered.`
                  : trainerView
                    ? "When the day is done, mark it as delivered with a short report and the audio."
                    : briefOpen
                      ? "The trainer hasn't marked this day as delivered yet."
                      : "The trainer can send the report once the training day starts."}
              </p>
            </div>
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
          </header>
          {(b.finished_at || b.brief || briefFiles.length > 0) && (
            <div className="p-5">
              <DeliveryReportCard
                report={b.delivery_report}
                brief={b.brief}
                submittedAt={b.brief_submitted_at}
                expected={deal?.participants || null}
                files={briefFiles.map((m) => ({ id: m.id, file_name: m.file_name, audio: isAudioPath(m.file_path) }))}
              />
            </div>
          )}
        </section>
      )}
      {fb && (
        <section className="ds-card overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ds-border px-5 py-4">
            <h2 className="text-base font-semibold text-ds-heading">Participant feedback</h2>
            <span className="text-xs text-ds-text">
              {feedbackClosed ? "Closed" : alwaysOpen ? "Open any time" : `Open until ${closeLabel}`} · {fb.count} {fb.count === 1 ? "response" : "responses"}
            </span>
          </header>
          <div className="space-y-4 p-5">
            {!feedbackClosed && (
              <p className="break-all text-xs text-ds-text">
                Form link: <a href={feedbackUrl} target="_blank" className="text-blue hover:underline">{feedbackUrl}</a>
              </p>
            )}
            {fb.count === 0 ? <p className="text-sm text-ds-text">No feedback yet. Share the QR code with participants at the end of the session.</p> : <FeedbackResults fb={fb} />}
          </div>
        </section>
      )}
    </section>
  );
}
