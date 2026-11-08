import { DownloadButton } from "@/components/booking-ui";
import { asDeliveryReport, ENGAGEMENT_LABEL } from "@/lib/delivery";
import { fmtDateTime } from "@/lib/format";

type File_ = { id: string; file_name: string; audio: boolean };

// One day's delivery report as Training Excellence and the team see it.
export function DeliveryReportCard({ report: raw, brief, submittedAt, expected, files }: { report: unknown; brief: string | null; submittedAt: string | null; expected?: number | null; files: File_[] }) {
  const report = asDeliveryReport(raw);
  const block = (label: string, text: string) =>
    text ? (
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wider text-ds-text">{label}</dt>
        <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ds-heading">{text}</dd>
      </div>
    ) : null;
  return (
    <div className="space-y-4">
      {report && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-ds-surface px-4 py-3 ring-1 ring-ds-border">
            <div className="text-xs font-medium uppercase tracking-wider text-ds-text">Attended</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums text-ds-heading">
              {report.attended}
              {expected ? <span className="text-sm font-normal text-ds-text"> of {expected}</span> : null}
            </div>
          </div>
          <div className="rounded-xl bg-ds-surface px-4 py-3 ring-1 ring-ds-border">
            <div className="text-xs font-medium uppercase tracking-wider text-ds-text">Engagement</div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="flex gap-1" aria-hidden>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} className={`h-2.5 w-6 rounded-full ${n <= report.engagement ? "bg-ds-primary" : "bg-ds-subtle"}`} />
                ))}
              </span>
              <span className="text-sm font-semibold text-ds-heading">
                {report.engagement}/5 · {ENGAGEMENT_LABEL[report.engagement]}
              </span>
            </div>
          </div>
        </div>
      )}
      <dl className="space-y-3">
        {report && block("Topics covered", report.topics)}
        {report && block("Challenges", report.challenges)}
        {report && block("Follow-up", report.follow_up)}
        {block(report ? "Notes" : "Brief", brief ?? "")}
      </dl>
      {!report && !brief && <p className="text-sm text-ds-text">No written report.</p>}
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ds-surface px-3 py-2 ring-1 ring-ds-border">
              <DownloadButton id={f.id} name={f.file_name} />
              <span className="text-xs text-ds-text">{f.audio ? "Audio" : "Document"}</span>
            </li>
          ))}
        </ul>
      )}
      {submittedAt && <p className="text-xs text-ds-text">Sent {fmtDateTime(submittedAt)}</p>}
    </div>
  );
}
