import Link from "next/link";
import { notFound } from "next/navigation";
import { Form, Submit } from "@/components/form";
import { Ticket } from "@/components/ticket";
import { canBook, requireRole } from "@/lib/auth";
import { AssignPanel } from "@/components/assign-panel";
import { db } from "@/lib/supabase";
import { ACTIVE_STATUSES, fmtDateTime } from "@/lib/format";
import { BOOKING_SELECT, type BookingRow } from "@/lib/notify";
import { getSetting } from "@/lib/scoring";
import { cancelBooking, editBooking, updateContact } from "../actions";

type Log = { id: string; action: string; details: Record<string, unknown> | null; created_at: string; app_users: { full_name: string } | null };

export default async function BookingPage({ params, searchParams }: PageProps<"/bookings/[id]">) {
  const me = await requireRole("admin", "approver", "growth");
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const { data } = await db().from("bookings").select(BOOKING_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const b = data as BookingRow;
  const [{ data: logs }, rule] = await Promise.all([
    db().from("audit_log").select("*, app_users(full_name)").eq("booking_id", id).order("created_at"),
    getSetting("cancellation", { notice_hours: 48, min_reason_chars: 150 }),
  ]);
  const canChange = ACTIVE_STATUSES.includes(b.status) && (canBook(me) || (me.role === "growth" && b.status === "needs_trainer" && b.created_by === me.id));
  const { requested } = await searchParams;
  const showReason = me.role === "admin";
  return (
    <div className="space-y-5">
      <Link href="/bookings" className="text-sm text-blue hover:underline">← All bookings</Link>
      {requested && <p className="rounded-xl bg-good-bg px-4 py-3 text-sm text-good">{b.trainer_id ? "Request sent. The trainer was emailed to confirm and the booking team was notified." : "Request sent. It's on the calendar as “Needs a trainer” and the booking team was notified."}</p>}
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

      {ACTIVE_STATUSES.includes(b.status) && (canBook(me) || b.created_by === me.id) && (
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

      {canChange && (
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          <section className="card">
            <h2 className="h2 mb-1">Edit training</h2>
            <p className="mb-3 text-xs text-muted">The trainer, admins and booking managers are notified of what changed. To change the trainer, cancel and book again.</p>
            <Form action={editBooking} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={b.id} />
              <div className="sm:col-span-2 grid grid-cols-[1fr_90px] gap-3">
                <div><label className="label">Program</label><input name="program_name" defaultValue={b.program_name} className="input" /></div>
                <div><label className="label">Day #</label><input name="day_number" type="number" min={1} defaultValue={b.day_number} className="input" /></div>
              </div>
              <div><label className="label">Date</label><input name="date" type="date" defaultValue={b.date} className="input" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">From</label><input name="start" type="time" defaultValue={b.start_time.slice(0, 5)} className="input" /></div>
                <div><label className="label">To</label><input name="end" type="time" defaultValue={b.end_time.slice(0, 5)} className="input" /></div>
              </div>
              <div className="sm:col-span-2"><label className="label">Location</label><input name="location" defaultValue={b.location ?? ""} className="input" /></div>
              <div className="sm:col-span-2"><label className="label">Content</label><textarea name="content" rows={4} defaultValue={b.content} className="input" /></div>
              <div><Submit>Save changes</Submit></div>
            </Form>
          </section>
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
