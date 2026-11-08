import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionCard } from "@/components/action-card";
import { AssignPanel } from "@/components/assign-panel";
import { DownloadButton } from "@/components/booking-ui";
import { DealCard } from "@/components/deal-card";
import { Form, Submit } from "@/components/form";
import { SwapIcon, TrashIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status";
import { requireRole } from "@/lib/auth";
import { buildTrainings, CONTENT_LABEL, isDeclined, isLive, STAGE_LABEL, type CycleDay, type CycleDeal } from "@/lib/cycle";
import { getDealInfo } from "@/lib/deal-info";
import { isAudioPath } from "@/lib/files";
import { fmtDate, fmtDateTime, fmtTime, isUuid, todayISO } from "@/lib/format";
import { BOOKING_SELECT, type BookingRow } from "@/lib/notify";
import { getSetting } from "@/lib/scoring";
import { db } from "@/lib/supabase";
import { fmtNps, nps } from "@/lib/survey";
import { cancelTraining, reassignTraining } from "../../bookings/actions";
import { CONTENT_STYLE, STAGE_STYLE } from "../styles";

type Material = { id: string; booking_id: string; file_name: string; file_path: string; created_at: string };

// One training across all its days: details, delivery reports, and reassigning or cancelling it.
export default async function TrainingPage({ params }: PageProps<"/dashboard/[id]">) {
  await requireRole("approver", "admin");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { data } = await db().from("bookings").select(BOOKING_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const b = data as BookingRow;
  let days = [b];
  if (b.deal_id || b.batch_id) {
    const q = db().from("bookings").select(BOOKING_SELECT);
    const { data: rows } = await (b.deal_id ? q.eq("deal_id", b.deal_id) : q.eq("batch_id", b.batch_id!)).order("day_number");
    days = (rows ?? []) as BookingRow[];
  }
  const ids = days.map((d) => d.id);
  const [{ data: deal }, { data: contentFiles }, { data: mats }, { data: responses }, { data: requester }, dealInfo, rule] = await Promise.all([
    b.deal_id ? db().from("deals").select("id, company_name, content_guide, content_submitted_at, created_at").eq("id", b.deal_id).maybeSingle() : Promise.resolve({ data: null }),
    b.deal_id ? db().from("deal_content").select("deal_id").eq("deal_id", b.deal_id) : Promise.resolve({ data: [] }),
    db().from("booking_materials").select("id, booking_id, file_name, file_path, created_at").in("booking_id", ids).eq("kind", "brief").order("created_at"),
    db().from("feedback_responses").select("booking_id, recommend").in("booking_id", ids).range(0, 9999),
    b.created_by ? db().from("app_users").select("id, full_name").eq("id", b.created_by).maybeSingle() : Promise.resolve({ data: null }),
    getDealInfo(b.deal_id),
    getSetting("cancellation", { notice_hours: 48, min_reason_chars: 150 }),
  ]);
  const files = (mats ?? []) as Material[];
  const feedback = (responses ?? []) as { booking_id: string; recommend: number | null }[];
  const person = requester as { id: string; full_name: string } | null;
  const today = todayISO();
  const [t] = buildTrainings({
    days: days as unknown as CycleDay[],
    deals: deal ? [deal as CycleDeal] : [],
    contentFileDealIds: ((contentFiles ?? []) as { deal_id: string }[]).map((f) => f.deal_id),
    feedback,
    audioBookingIds: files.filter((f) => isAudioPath(f.file_path)).map((f) => f.booking_id),
    names: new Map(person ? [[person.id, person.full_name]] : []),
    today,
  });

  const scoreOf = (bookingId: string) => {
    const mine = feedback.filter((f) => f.booking_id === bookingId);
    return { count: mine.length, score: nps(mine.map((f) => f.recommend).filter((x): x is number => x != null)) };
  };
  const reassignable = days.filter((d) => d.trainer_id && !d.finished_at && d.date >= today && ["awaiting_trainer", "confirmed"].includes(d.status));
  const toAssign = days.find((d) => d.status === "needs_trainer" && d.date >= today);
  const cancellable = days.filter((d) => isLive(d) && !d.finished_at && (d.date >= today || d.status !== "confirmed"));
  const reports = days.filter((d) => d.brief || d.finished_at || files.some((f) => f.booking_id === d.id));
  const facts: [string, React.ReactNode][] = [
    ["Growth lead", t.requestedByName ?? "—"],
    ["Requested", fmtDateTime(t.requestedAt)],
    ["Company", t.company ?? "—"],
    ["Industry", t.industry ?? "—"],
    ["Number of days", t.live || t.days.length],
    ["Trainer", t.trainers.length ? t.trainers.map((x) => x.name).join(", ") : "Not assigned"],
    ["Trainer confirmation", t.confirmation],
    ["Feedback score", t.responses ? `${fmtNps(t.score)} · ${t.responses} ${t.responses === 1 ? "response" : "responses"}` : "—"],
  ];

  // Reassign and cancel act on every remaining day; on a New deal they sit at the bottom of the deal card.
  const trainingActions =
    reassignable.length > 0 || cancellable.length > 0 ? (
      <>
        {reassignable.length > 0 && (
          <ActionCard icon={<SwapIcon />} title="Reassign trainer" lead="Give this training to a different trainer.">
            <p className="text-xs text-muted">
              Removes the trainer from {reassignable.length === 1 ? "the upcoming day" : `the ${reassignable.length} upcoming days`} and tells them and the team. The training goes back to “Needs a trainer” so you can choose someone else above. Days already delivered stay as they are.
            </p>
            <Form action={reassignTraining}>
              <input type="hidden" name="id" value={b.id} />
              <Submit className="btn-ghost" pending="Removing…">Remove trainer and reassign</Submit>
            </Form>
          </ActionCard>
        )}
        {cancellable.length > 0 && (
          <ActionCard icon={<TrashIcon />} title="Cancel training" lead="Cancel what is left of this training." tone="danger">
            <p className="text-xs text-muted">
              Cancels {cancellable.length === 1 ? "the remaining day" : `the ${cancellable.length} remaining days`}. The trainer is told, and the team gets the reason. Within {rule.notice_hours} hours of the start, or after a date has passed, at least {rule.min_reason_chars} characters are required.
            </p>
            <Form action={cancelTraining} className="space-y-2">
              <input type="hidden" name="id" value={b.id} />
              <textarea name="reason" rows={4} required className="input" placeholder="Why is this training being cancelled?" />
              <Submit className="btn-danger" pending="Cancelling…">Cancel this training</Submit>
            </Form>
          </ActionCard>
        )}
      </>
    ) : null;

  return (
    <div className="space-y-5">
      <Link href="/dashboard" className="text-sm text-blue hover:underline">← Dashboard</Link>
      <PageHeader kicker={t.company ?? "Training"} title={<>{t.program}</>} actions={<span className={`badge ${STAGE_STYLE[t.stage]}`}>{STAGE_LABEL[t.stage]}</span>} />

      <section className="card">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {facts.map(([k, v]) => (
            <div key={k} className="flex gap-3 border-b border-line py-1.5 text-sm">
              <dt className="w-40 flex-none text-muted">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {toAssign && (
        <section className="card border-2 border-[#F4A9C4]">
          <div className="eyebrow">Needs a trainer</div>
          <h2 className="h2 mb-3">Assign a trainer</h2>
          {toAssign.trainer_comment && isDeclined(toAssign) && <p className="mb-3 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">{toAssign.trainer_comment}</p>}
          <AssignPanel bookingId={toAssign.id} samePref={toAssign.same_trainer_pref} />
        </section>
      )}

      <section className="card overflow-x-auto p-0">
        <h2 className="h2 px-5 pb-3 pt-5">Training days</h2>
        <table className="table">
          <thead>
            <tr><th>Day</th><th>Date and time</th><th>Trainer</th><th>Status</th><th>Delivered</th><th>Brief</th><th>Audio</th><th>Feedback</th></tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const f = scoreOf(d.id);
              return (
                <tr key={d.id}>
                  <td><Link href={`/bookings/${d.id}`} className="font-medium text-blue hover:underline">Day {d.day_number}</Link></td>
                  <td className="whitespace-nowrap text-sm">{fmtDate(d.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}<div className="text-xs text-muted">{fmtTime(d.start_time)} – {fmtTime(d.end_time)}</div></td>
                  <td className="text-sm">{d.trainers?.full_name ?? <span className="text-muted">Not assigned</span>}</td>
                  <td><StatusBadge status={d.status} /></td>
                  <td className="whitespace-nowrap text-sm">{d.finished_at ? fmtDateTime(d.finished_at) : <span className="text-muted">—</span>}</td>
                  <td className="text-sm">{d.brief_submitted_at ? "Added" : <span className="text-muted">—</span>}</td>
                  <td className="text-sm">{files.some((m) => m.booking_id === d.id && isAudioPath(m.file_path)) ? "Added" : <span className="text-muted">—</span>}</td>
                  <td className="text-sm tabular-nums">{f.count ? `${fmtNps(f.score)} · ${f.count}` : <span className="text-muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card space-y-3">
        <h2 className="h2">Delivery reports</h2>
        {reports.length === 0 && <p className="text-sm text-muted">Nothing yet. The trainer adds the brief and the audio when marking a day as delivered.</p>}
        {reports.map((d) => (
          <div key={d.id} className="rounded-2xl border border-ice2 bg-ice p-4">
            <h3 className="mb-1 text-sm font-semibold">Day {d.day_number}{d.trainers?.full_name ? ` · ${d.trainers.full_name}` : ""}</h3>
            {d.brief ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{d.brief}</p> : <p className="text-sm text-muted">No written brief.</p>}
            {files.some((m) => m.booking_id === d.id) && (
              <ul className="mt-3 space-y-1.5">
                {files.filter((m) => m.booking_id === d.id).map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                    <DownloadButton id={m.id} name={m.file_name} />
                    <span className="text-xs text-muted">{isAudioPath(m.file_path) ? "Audio" : "Brief document"} · {fmtDateTime(m.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Content</h2>
          {t.content !== "none" && <span className={`badge ${CONTENT_STYLE[t.content]}`}>{CONTENT_LABEL[t.content]}</span>}
        </div>
        {t.content === "none" && (b.content ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{b.content}</p> : <p className="text-sm text-muted">This older request has no content step.</p>)}
        {t.content === "needs_content" && <p className="text-sm text-muted">The content team hasn&apos;t started yet.</p>}
        {t.content === "in_progress" && <p className="text-sm text-muted">The content team is working on it. It appears here once submitted.</p>}
        {dealInfo?.content && (
          <>
            <p className="text-xs text-muted">Submitted {fmtDateTime(dealInfo.content.submittedAt)}</p>
            {dealInfo.content.guide && <p className="whitespace-pre-wrap text-sm leading-relaxed">{dealInfo.content.guide}</p>}
            {dealInfo.content.files.length > 0 && (
              <ul className="space-y-1.5">
                {dealInfo.content.files.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface2 px-3 py-2">
                    <DownloadButton id={f.id} name={f.file_name} kind="content" />
                    {f.size_bytes ? <span className="text-xs text-muted">{(f.size_bytes / 1048576).toFixed(1)} MB</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {b.deal_id ? (
        <DealCard dealId={b.deal_id} bookingId={b.id} actions={trainingActions} />
      ) : (
        trainingActions && <div className="grid gap-3 lg:grid-cols-2">{trainingActions}</div>
      )}
    </div>
  );
}
