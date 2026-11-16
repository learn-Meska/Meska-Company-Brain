import { reassignTraining } from "@/app/(app)/bookings/actions";
import { requestChange, resolveChangeRequest, withdrawChangeRequest } from "@/app/(app)/bookings/change-actions";
import { Form, Submit } from "@/components/form";
import { SwapIcon } from "@/components/icons";
import { assignableTrainers } from "@/lib/availability";
import { CHANGE_KIND_ASK, CHANGE_KIND_LABEL, CHANGE_STATUS_LABEL, MAX_REASON_CHARS, openDays, requestableKinds, stillApplies, type ChangeKind } from "@/lib/change-request";
import type { ChangeRequestRow, TrainingChangeRequests } from "@/lib/change-requests";
import { fmtDate, fmtDateTime, todayISO } from "@/lib/format";

type Viewer = { role: string; canAssign: boolean; canEdit: boolean; canCancel: boolean };

const mayAnswer = (v: Viewer, kind: ChangeKind) => (kind === "trainer" ? v.canAssign : kind === "date" ? v.canEdit : v.canCancel);
const isTeam = (v: Viewer) => v.role === "admin" || v.role === "approver";

// The request still waiting on this training, if it still makes sense (see stillApplies).
function openRequest(data: TrainingChangeRequests, today: string) {
  return data.requests.find((r) => r.status === "open" && stillApplies(r.kind, data.days, today)) ?? null;
}

const HOW: Record<ChangeKind, string> = {
  trainer: "Reassign the trainer below, or keep them and tell Growth why.",
  date: "Move the days in “Edit training” on each day, then mark the request as done. Or decline it with a note.",
  cancel: "Cancel the training in “Cancel training”; this request then closes on its own. Or decline it with a note.",
};

// For a "different trainer" request: how many other trainers Training Excellence could assign to each upcoming day.
async function alternatives(data: TrainingChangeRequests, today: string) {
  const days = openDays(data.days, today).filter((d) => d.trainer_id);
  const lists = await Promise.all(days.map((d) => assignableTrainers({ date: d.date, start: d.start_time.slice(0, 5), end: d.end_time.slice(0, 5) }, d.id)));
  const others = lists.map((l, i) => l.filter((t) => t.id !== days[i].trainer_id).map((t) => t.id));
  return {
    days: days.map((d, i) => ({ id: d.id, day_number: d.day_number, date: d.date, count: others[i].length })),
    onAll: others.length > 1 ? others[0].filter((id) => others.every((l) => l.includes(id))).length : null,
  };
}

// Top of the training page: the request that is waiting. Training Excellence answers it here; Growth sees it
// is waiting and can withdraw it. The trainer never sees any of this.
export async function ChangeRequestBanner({ bookingId, data, viewer }: { bookingId: string; data: TrainingChangeRequests; viewer: Viewer }) {
  const today = todayISO();
  const r = openRequest(data, today);
  if (!r) return null;
  const by = (r.requested_by && data.names.get(r.requested_by)) || "Growth";
  const team = isTeam(viewer);
  const answer = team && mayAnswer(viewer, r.kind);
  const alt = team && r.kind === "trainer" && viewer.canAssign ? await alternatives(data, today) : null;
  // A date request names the day it was raised from.
  const dayOf = (id: string) => {
    const d = r.kind === "date" ? data.days.find((x) => x.id === id) : null;
    return d ? `Day ${d.day_number} (${fmtDate(d.date, { weekday: "short", day: "numeric", month: "short" })})` : "";
  };

  return (
    <section className="ds-card relative overflow-hidden border-warn/40 p-5 sm:p-6">
      <div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-warn" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="badge bg-warn-bg text-warn">Change requested</span>
          <h2 className="mt-2 text-lg font-semibold text-ds-heading">{team ? `${by} asked for ${CHANGE_KIND_ASK[r.kind]}` : `You asked for ${CHANGE_KIND_ASK[r.kind]}`}{dayOf(r.booking_id) ? ` for ${dayOf(r.booking_id)}` : ""}</h2>
          <p className="text-sm text-ds-text">
            {team ? "From Growth" : `Sent by ${by}`} · {fmtDateTime(r.created_at)} · {team ? "The trainer is not told about this request." : "Waiting for Training Excellence. You'll be notified when they answer."}
          </p>
        </div>
      </div>
      <blockquote className="mt-4 whitespace-pre-line rounded-xl border border-ds-border bg-ds-subtle/60 px-4 py-3 text-sm text-ds-heading">{r.reason}</blockquote>

      {alt && alt.days.length > 0 && (
        <div className="mt-4 rounded-xl border border-ds-border p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-ds-text">Other trainers free before you remove anyone</div>
          <ul className="mt-2 space-y-1 text-sm">
            {alt.days.map((d) => (
              <li key={d.id} className="flex flex-wrap justify-between gap-2">
                <span className="text-ds-heading">Day {d.day_number} · {fmtDate(d.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                <span className={d.count ? "font-medium text-good" : "font-medium text-bad"}>{d.count ? `${d.count} other ${d.count === 1 ? "trainer" : "trainers"} free` : "No other trainer free"}</span>
              </li>
            ))}
          </ul>
          {alt.onAll != null && <p className="mt-2 text-xs text-ds-text">{alt.onAll ? `${alt.onAll} ${alt.onAll === 1 ? "trainer is" : "trainers are"} free on all ${alt.days.length} days.` : "No single other trainer is free on all of these days."}</p>}
        </div>
      )}

      {team && !answer && <p className="mt-4 text-sm text-ds-text">Someone in Training Excellence with the right access will answer this request.</p>}
      {answer && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-ds-text">{HOW[r.kind]}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {r.kind === "trainer" && (
              <div className="rounded-xl border border-ds-border p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ds-heading"><SwapIcon size={16} /> Reassign the trainer</h3>
                <p className="mt-1 text-xs text-ds-text">Takes the trainer off the upcoming days and tells them and the team. The days go back to “Needs a trainer” so you can choose someone else, and this request closes.</p>
                <Form action={reassignTraining} className="mt-3">
                  <input type="hidden" name="id" value={bookingId} />
                  <Submit className="ds-btn ds-btn-primary" pending="Removing…">Remove trainer and reassign</Submit>
                </Form>
              </div>
            )}
            {r.kind !== "trainer" && (
              <div className="rounded-xl border border-ds-border p-4">
                <h3 className="text-sm font-semibold text-ds-heading">Mark as done</h3>
                <p className="mt-1 text-xs text-ds-text">{r.kind === "date" ? <>Use this once the day is moved{r.booking_id !== bookingId && dayOf(r.booking_id) ? <> (<a className="text-ds-primary underline" href={`/bookings/${r.booking_id}#edit`}>open {dayOf(r.booking_id)}</a>)</> : null}.</> : "Use this if the training was already cancelled another way."} Growth is told.</p>
                <Form action={resolveChangeRequest} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="outcome" value="done" />
                  <input name="note" className="input" maxLength={MAX_REASON_CHARS} placeholder="Note for Growth (optional)" />
                  <Submit className="ds-btn ds-btn-primary" pending="Saving…">Mark as done</Submit>
                </Form>
              </div>
            )}
            <div className="rounded-xl border border-ds-border p-4">
              <h3 className="text-sm font-semibold text-ds-heading">{r.kind === "trainer" ? "Keep the trainer" : "Decline the request"}</h3>
              <p className="mt-1 text-xs text-ds-text">The training stays as it is. Tell Growth why; they are notified with your note.</p>
              <Form action={resolveChangeRequest} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="outcome" value="declined" />
                <textarea name="note" rows={2} required maxLength={MAX_REASON_CHARS} className="input" placeholder="Why it stays as it is" />
                <Submit className="ds-btn ds-btn-outline" pending="Saving…">{r.kind === "trainer" ? "Keep trainer and tell Growth" : "Decline and tell Growth"}</Submit>
              </Form>
            </div>
          </div>
          {r.kind === "trainer" && (
            <Form action={resolveChangeRequest} className="flex flex-wrap items-center gap-2 text-xs text-ds-text">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="outcome" value="done" />
              <span>Already changed the trainer from “Edit training”?</span>
              <Submit className="btn-quiet btn-sm" pending="Saving…">Mark as done</Submit>
            </Form>
          )}
        </div>
      )}
      {!team && (
        <Form action={withdrawChangeRequest} className="mt-4">
          <input type="hidden" name="id" value={r.id} />
          <Submit className="btn-quiet btn-sm" pending="Withdrawing…">Withdraw this request</Submit>
        </Form>
      )}
    </section>
  );
}

const STATUS_STYLE: Record<string, string> = { done: "bg-good-bg text-good", declined: "bg-bad-bg text-bad", withdrawn: "bg-surface2 text-muted", open: "bg-warn-bg text-warn" };

function HistoryItem({ r, names }: { r: ChangeRequestRow; names: Map<string, string> }) {
  return (
    <li className="space-y-1.5 px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${STATUS_STYLE[r.status] ?? STATUS_STYLE.open}`}>{CHANGE_STATUS_LABEL[r.status] ?? r.status}</span>
        <span className="text-sm font-medium text-ds-heading">{CHANGE_KIND_LABEL[r.kind] ?? r.kind}</span>
        <span className="text-xs text-ds-text">
          {(r.requested_by && names.get(r.requested_by)) || "Growth"} · {fmtDateTime(r.created_at)}
        </span>
      </div>
      <p className="whitespace-pre-line text-sm text-ds-text">{r.reason}</p>
      {r.resolution_note && (
        <p className="whitespace-pre-line rounded-lg bg-ds-subtle/60 px-3 py-2 text-sm text-ds-heading">
          <b className="font-medium">{(r.resolved_by && names.get(r.resolved_by)) || "Training Excellence"}:</b> {r.resolution_note}
        </p>
      )}
    </li>
  );
}

// Lower on the page: Growth's form to ask for a change (when nothing is waiting), and the answered requests.
// canChangeItself: Growth can still edit or cancel the days directly, so it only needs to ask about the trainer.
export function ChangeRequestSection({ bookingId, data, viewer, canChangeItself }: { bookingId: string; data: TrainingChangeRequests; viewer: Viewer; canChangeItself: boolean }) {
  const today = todayISO();
  const waiting = openRequest(data, today);
  const past = data.requests.filter((r) => r.id !== waiting?.id && r.status !== "open").slice(0, 5);
  const kinds = viewer.role === "growth" && !waiting ? requestableKinds(data.days, today, canChangeItself) : [];
  const thisDay = data.days.length > 1 ? data.days.find((d) => d.id === bookingId) : null;
  if (!kinds.length && !past.length) return null;
  return (
    <section className="ds-card overflow-hidden">
      <header className="border-b border-ds-border px-5 py-4 sm:px-6">
        <h2 className="text-base font-semibold text-ds-heading">{kinds.length ? "Request a change" : "Change requests"}</h2>
        <p className="text-sm text-ds-text">
          {kinds.length
            ? "Training Excellence assigns the trainer. If something needs to change, ask them here and say why. The trainer doesn't see your request."
            : "What Growth asked Training Excellence to change on this training, and the answers. The trainer doesn't see these."}
        </p>
      </header>
      {kinds.length > 0 && (
        <div className="px-5 py-4 sm:px-6">
          <Form action={requestChange} reset className="space-y-3">
            <input type="hidden" name="id" value={bookingId} />
            {thisDay && <p className="text-sm text-ds-heading">For <b>Day {thisDay.day_number}</b> · {fmtDate(thisDay.date, { weekday: "short", day: "numeric", month: "short" })}. To ask about another day, open it from “Days of this training” above.</p>}
            <div className="max-w-sm">
              <label className="label" htmlFor="cr-kind">What should change?</label>
              <select id="cr-kind" name="kind" className="input" defaultValue={kinds[0]}>
                {kinds.map((k) => (
                  <option key={k} value={k}>{CHANGE_KIND_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="cr-reason">Reason</label>
              <textarea id="cr-reason" name="reason" rows={3} required maxLength={MAX_REASON_CHARS} className="input" placeholder="e.g. The client asked for a trainer with banking experience after the first session." />
            </div>
            <Submit className="ds-btn ds-btn-primary" pending="Sending…">Send to Training Excellence</Submit>
          </Form>
        </div>
      )}
      {past.length > 0 && (
        <ul className={`divide-y divide-ds-border ${kinds.length ? "border-t border-ds-border" : ""}`}>
          {past.map((r) => (
            <HistoryItem key={r.id} r={r} names={data.names} />
          ))}
        </ul>
      )}
    </section>
  );
}
