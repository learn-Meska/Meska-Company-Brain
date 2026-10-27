import { BriefBox, DownloadButton, MaterialUploader } from "@/components/booking-ui";
import { StatusBadge } from "@/components/status";
import { db } from "@/lib/supabase";
import { feedbackWindow, isPast, fmtDate, fmtDateTime, fmtTime, programVisible, SLOT_LABEL } from "@/lib/format";
import { bookingFeedback } from "@/lib/feedback";
import { fmtNps } from "@/lib/survey";
import { googleCalendarUrl } from "@/lib/ics";
import { siteUrl } from "@/lib/email";
import type { BookingRow } from "@/lib/notify";

type Material = { id: string; file_name: string; size_bytes: number | null; created_at: string; kind: string };

// trainerView: the assigned trainer is looking — hide the program until 2 days before, and let them write the brief.
export async function Ticket({ b, canUpload, trainerView = false }: { b: BookingRow; canUpload: boolean; trainerView?: boolean }) {
  const [{ data: mats }, { data: skills }] = await Promise.all([
    db().from("booking_materials").select("*").eq("booking_id", b.id).order("created_at"),
    b.skill_ids.length ? db().from("skills").select("name").in("id", b.skill_ids) : Promise.resolve({ data: [] }),
  ]);
  const all = (mats ?? []) as Material[];
  const materials = all.filter((m) => m.kind !== "brief");
  const briefFiles = all.filter((m) => m.kind === "brief");
  const hideProgram = trainerView && !programVisible(b);
  const cairoToday = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const briefOpen = b.status === "confirmed" && b.date <= cairoToday;
  const fb = b.status === "confirmed" ? await bookingFeedback(b.id) : null;
  const win = feedbackWindow(b);
  const feedbackClosed = isPast(win.closes);
  const feedbackUrl = `${siteUrl()}/f/${b.feedback_token}`;
  const closeLabel = win.closes.toLocaleString("en-GB", { timeZone: "Africa/Cairo", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const rows: [string, React.ReactNode][] = [
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
    ["Audience", b.audience?.name],
    ["Function", b.func?.name],
    ["Industry", b.industry?.name],
    ["Skills", ((skills ?? []) as { name: string }[]).map((s) => s.name).join(", ") || "—"],
  ];
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
          {b.finished_at && <span className="badge bg-good-bg text-good">Finished</span>}
          <StatusBadge status={b.status} />
        </div>
      </div>
      {(trainerView && ["awaiting_trainer", "confirmed"].includes(b.status)) || b.status === "confirmed" ? (
        <div className="flex flex-wrap gap-2">
          {trainerView && ["awaiting_trainer", "confirmed"].includes(b.status) && (
            <>
              <a href={`/bookings/${b.id}/ics`} className="btn-ghost btn-sm">📅 Add to my calendar</a>
              <a href={googleCalendarUrl(b, `${siteUrl()}/me/bookings/${b.id}`)} target="_blank" rel="noopener" className="btn-ghost btn-sm">Google Calendar ↗</a>
            </>
          )}
          {b.status === "confirmed" && <a href={`/bookings/${b.id}/qr`} className="btn btn-sm">⬇ Feedback QR code</a>}
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
      <div className="callout">
        <div className="eyebrow mb-1">Content to be delivered</div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{b.content}</p>
      </div>
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
        <div className="rounded-2xl border border-ice2 bg-ice p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="h2">{trainerView && !b.finished_at ? "Finish this training" : "Trainer brief"}</h2>
            {b.brief_submitted_at && <span className="badge bg-good-bg text-good">Submitted {fmtDateTime(b.brief_submitted_at)}</span>}
          </div>
          {trainerView ? (
            <BriefBox bookingId={b.id} initial={b.brief ?? ""} submittedAt={b.brief_submitted_at} finished={!!b.finished_at} />
          ) : b.brief || briefFiles.length ? (
            b.brief && <p className="whitespace-pre-wrap text-sm leading-relaxed">{b.brief}</p>
          ) : (
            <p className="text-sm text-muted">{briefOpen ? "The trainer hasn't sent the brief yet." : "The trainer can add a brief once the training day starts."}</p>
          )}
          {briefFiles.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {briefFiles.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                  <DownloadButton id={m.id} name={m.file_name} />
                  <span className="text-xs text-muted">{fmtDateTime(m.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {fb && (!trainerView || feedbackClosed) && (
        <div className="rounded-2xl border border-line p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="h2">Participant feedback</h2>
            <span className="text-xs text-muted">{feedbackClosed ? "Closed" : `Open until ${closeLabel}`} · {fb.count} {fb.count === 1 ? "response" : "responses"}</span>
          </div>
          {!trainerView && !feedbackClosed && (
            <p className="mb-3 break-all text-xs text-muted">
              Form link: <a href={feedbackUrl} target="_blank" className="text-blue hover:underline">{feedbackUrl}</a>
            </p>
          )}
          {fb.count === 0 ? (
            <p className="text-sm text-muted">No feedback yet. Share the QR code with participants at the end of the session.</p>
          ) : (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="stat-hot rounded-xl p-3 text-white">
                  <div className="text-2xl font-semibold tabular-nums">{fmtNps(fb.nps)}</div>
                  <div className="text-[10.5px] uppercase tracking-wider text-[#93C5FD]">NPS (−100 to 100)</div>
                  <div className="mt-1 text-[11px] text-[#C7D7F5]">
                    {fb.promoters} promoters · {fb.passives} passives · {fb.detractors} detractors
                  </div>
                </div>
                {fb.yes.map((q) => (
                  <div key={q.key} className="rounded-xl border border-ice2 bg-ice p-3">
                    <div className="text-2xl font-bold tabular-nums text-royal-deep">{q.percent != null ? `${q.percent}%` : "—"}</div>
                    <div className="text-[10.5px] font-medium uppercase tracking-wider text-[#3B82F6]">Yes · {q.short}</div>
                  </div>
                ))}
              </div>
              <div className="mb-1.5 inline-block rounded-full bg-surface2 px-2.5 py-0.5 text-xs font-semibold text-ink">Main reason for their score</div>
              {fb.reasons.length ? (
                <ul className="space-y-1.5 text-sm">
                  {fb.reasons.map((c, i) => (
                    <li key={i} className="rounded-lg bg-surface2 px-3 py-2">“{c}”</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-faint">No comments.</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
