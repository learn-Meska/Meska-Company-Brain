import Link from "next/link";
import { notFound } from "next/navigation";
import { Form, Submit } from "@/components/form";
import { Ticket } from "@/components/ticket";
import { DealCard } from "@/components/deal-card";
import { can, canBook, requireRole } from "@/lib/auth";
import { AssignPanel } from "@/components/assign-panel";
import { db } from "@/lib/supabase";
import { ACTIVE_STATUSES, fmtDateTime } from "@/lib/format";
import { BOOKING_SELECT, type BookingRow } from "@/lib/notify";
import { getSetting } from "@/lib/scoring";
import { cancelBooking, updateContact } from "../actions";
import { EditTrainingForm } from "@/components/edit-training-form";

type Log = { id: string; action: string; details: Record<string, unknown> | null; created_at: string; app_users: { full_name: string } | null };

export default async function BookingPage({ params, searchParams }: PageProps<"/bookings/[id]">) {
  const me = await requireRole("admin", "approver", "growth");
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const { data } = await db().from("bookings").select(BOOKING_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const b = data as BookingRow;
  // Growth without "See all bookings" only opens their own requests.
  if (me.role === "growth" && !can(me, "growth.all_bookings") && b.created_by !== me.id) notFound();
  const [{ data: logs }, rule] = await Promise.all([
    db().from("audit_log").select("*, app_users(full_name)").eq("booking_id", id).order("created_at"),
    getSetting("cancellation", { notice_hours: 48, min_reason_chars: 150 }),
  ]);
  const ownRequest = can(me, "growth.new_deal") && b.created_by === me.id;
  const canChange = ACTIVE_STATUSES.includes(b.status) && (can(me, "te.edit") || (ownRequest && ["needs_trainer", "awaiting_trainer"].includes(b.status)));
  const canCancel = ACTIVE_STATUSES.includes(b.status) && (can(me, "te.cancel") || (ownRequest && ["needs_trainer", "awaiting_trainer"].includes(b.status)));
  const { requested } = await searchParams;
  const showReason = me.role === "admin";
  return (
    <div className="space-y-5">
      {can(me, "te.dashboard") ? <Link href={`/dashboard/${b.id}`} className="text-sm text-blue hover:underline">← Dashboard</Link> : <Link href="/bookings" className="text-sm text-blue hover:underline">← All bookings</Link>}
      {requested && <p className="rounded-xl bg-good-bg px-4 py-3 text-sm text-good">{b.trainer_id ? "Request sent. The trainer was emailed to confirm and Training Excellence was notified." : "Request sent. It's on the calendar as “Needs a trainer” and Training Excellence was notified."}</p>}
      {b.status === "needs_trainer" && canBook(me) && (
        <section className="card border-2 border-[#F4A9C4]">
          <div className="eyebrow">Needs a trainer</div>
          <h2 className="h2 mb-3">Assign a trainer</h2>
          {b.trainer_comment && <p className="mb-3 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">{b.trainer_comment}</p>}
          <AssignPanel bookingId={b.id} samePref={b.same_trainer_pref} />
        </section>
      )}
      {isNew && <p className="rounded-xl bg-good-bg px-4 py-3 text-sm text-good">Booked. The trainer was emailed and asked to confirm; you&apos;ll be notified when they respond.</p>}
      <Ticket b={b} canUpload={me.role === "admin" && b.status !== "cancelled"} />
      {b.deal_id && <DealCard dealId={b.deal_id} bookingId={b.id} showValue={can(me, "te.deal_value") || can(me, "growth.deal_value")} />}

      {ACTIVE_STATUSES.includes(b.status) && (can(me, "te.edit") || ownRequest) && (
        <section className="card">
          <h2 className="h2 mb-1">Client point of contact</h2>
          <p className="mb-3 text-xs text-muted">{b.batch_id ? "Saved for every day of this request. " : ""}Only the Meska team sees it; trainers don&apos;t.</p>
          <Form action={updateContact} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="id" value={b.id} />
            <div><label className="label">Name</label><input name="contact_name" defaultValue={b.contact_name ?? ""} className="input" required /></div>
            <div><label className="label">Email</label><input name="contact_email" type="email" defaultValue={b.contact_email ?? ""} className="input" required /></div>
            <div><label className="label">Mobile</label><input name="contact_mobile" type="tel" defaultValue={b.contact_mobile ?? ""} className="input" required /></div>
            <Submit className="btn-ghost">Save contact</Submit>
          </Form>
        </section>
      )}

      {(canChange || canCancel) && (
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          {canChange && (
          <section className="card">
            <h2 className="h2 mb-1">Edit training</h2>
            <p className="mb-3 text-xs text-muted">Change the date or time and pick from the trainers free then. A new trainer, or a new date for a confirmed trainer, is asked to confirm, and everyone on the training is notified of what changed.</p>
            <EditTrainingForm
              b={{ id: b.id, program_name: b.program_name, day_number: b.day_number, date: b.date, start: b.start_time.slice(0, 5), end: b.end_time.slice(0, 5), location: b.location ?? "", content: b.content }}
              current={b.trainer_id && b.trainers ? { id: b.trainer_id, name: b.trainers.full_name } : null}
              trainerRequired={!can(me, "te.edit")}
              canViewProfiles={can(me, "growth.trainers") || can(me, "te.trainers") || can(me, "te.find") || can(me, "te.assign")}
            />
          </section>
          )}
          {canCancel && (
          <section className="card">
            <h2 className="h2 mb-1 text-bad">Cancel training</h2>
            <p className="mb-3 text-xs text-muted">
              The trainer is told it&apos;s cancelled. The reason goes only to the admin log. Within {rule.notice_hours} hours of the start, a detailed reason of at least {rule.min_reason_chars} characters is required.
            </p>
            <Form action={cancelBooking} className="space-y-2">
              <input type="hidden" name="id" value={b.id} />
              <textarea name="reason" rows={5} required className="input" placeholder="Why is this training being cancelled?" />
              <Submit className="btn-danger" pending="Cancelling…">Cancel this training</Submit>
            </Form>
          </section>
          )}
        </div>
      )}

      <section className="card">
        <h2 className="h2 mb-3">History</h2>
        <ol className="space-y-2 border-l-2 border-line pl-4">
          {((logs ?? []) as Log[]).map((l) => (
            <li key={l.id} className="text-sm">
              <span className="text-xs text-faint">{fmtDateTime(l.created_at)}</span> · <b>{l.app_users?.full_name ?? "System"}</b> — {l.action.replace("booking_", "").replace(/_/g, " ")}
              {typeof l.details?.comment === "string" && l.details.comment && <div className="text-xs text-muted">“{l.details.comment}”</div>}
              {Array.isArray(l.details?.changes) && (l.details.changes as { field: string; from: string; to: string }[]).map((c) => (
                <div key={c.field} className="text-xs text-muted">{c.field}: <s>{c.from}</s> → <b className="text-ink">{c.to}</b></div>
              ))}
              {showReason && typeof l.details?.reason === "string" && <div className="whitespace-pre-wrap text-xs text-muted">Reason: {l.details.reason}</div>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
