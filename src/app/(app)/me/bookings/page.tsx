import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { StatusBadge } from "@/components/status";
import { requireTrainer } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { fmtDate, fmtTime, todayISO, trainerTitle } from "@/lib/format";
import { BOOKING_SELECT, type BookingRow } from "@/lib/notify";

export default async function MyBookingsPage({ searchParams }: PageProps<"/me/bookings">) {
  const { declined } = await searchParams;
  const me = await requireTrainer();
  const { data } = await db()
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("trainer_id", me.trainer_id ?? "")
    .in("status", ["awaiting_trainer", "confirmed", "cancelled"])
    .order("date");
  const rows = (data ?? []) as BookingRow[];
  const today = todayISO();
  const upcoming = rows.filter((b) => b.date >= today && b.status !== "cancelled");
  const other = rows.filter((b) => !upcoming.includes(b)).reverse();
  const Item = ({ b }: { b: BookingRow }) => (
    <Link href={`/me/bookings/${b.id}`} className={`card flex flex-wrap items-center justify-between gap-3 transition hover:border-blue ${b.status === "awaiting_trainer" ? "border-blue" : ""}`}>
      <div>
        <b>{trainerTitle(b)}</b>
        <div className="text-sm text-muted">{fmtDate(b.date)} · {fmtTime(b.start_time)} – {fmtTime(b.end_time)}</div>
        <div className="text-xs text-faint">{b.industry?.name} · {b.location ?? "Location TBC"}</div>
      </div>
      <StatusBadge status={b.status} />
    </Link>
  );
  return (
    <div className="space-y-5">
      <PageHeader kicker="My trainings" title={<>Booked days</>} />
      {declined && <p className="rounded-xl bg-good-bg px-4 py-3 text-sm text-good">Your response was sent. The booking team will assign another trainer.</p>}
      <div className="space-y-2">{upcoming.length ? upcoming.map((b) => <Item key={b.id} b={b} />) : <p className="card text-muted">No upcoming trainings.</p>}</div>
      {other.length > 0 && (
        <>
          <h2 className="h2 pt-2">Past &amp; cancelled</h2>
          <div className="space-y-2">{other.map((b) => <Item key={b.id} b={b} />)}</div>
        </>
      )}
    </div>
  );
}
