import { PageHeader } from "@/components/page-header";
import { AvailabilityEditor } from "@/components/availability-editor";
import { requireTrainer } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { getSetting } from "@/lib/scoring";
import { deadlineDay, isMonth, ordinal, programVisible, todayISO } from "@/lib/format";

export default async function MyAvailabilityPage({ searchParams }: PageProps<"/me/availability">) {
  const me = await requireTrainer();
  if (!me.trainer_id) return <p className="card">Your login isn&apos;t linked to a trainer profile yet. Please contact the admin.</p>;
  const { m } = await searchParams;
  const today = todayISO();
  const nextMonth = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 1)).toISOString().slice(0, 7);
  // Past months can't be edited, so they aren't offered either.
  const month = isMonth(m) && m >= today.slice(0, 7) ? m : nextMonth;
  const [y, mm] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10);
  const [{ data: avail }, { data: locks }, { data: sub }, deadline] = await Promise.all([
    db().from("availability").select("date, slot").eq("trainer_id", me.trainer_id).gte("date", start).lte("date", end),
    db().from("booking_locks").select("date, slot, bookings(program_name, day_number, date, start_time)").eq("trainer_id", me.trainer_id).gte("date", start).lte("date", end),
    db().from("availability_months").select("submitted_at").eq("trainer_id", me.trainer_id).eq("month", start).maybeSingle(),
    getSetting("availability_deadline", { day_of_month: 25 }),
  ]);
  const booked = ((locks ?? []) as unknown as { date: string; slot: "morning" | "evening"; bookings: { program_name: string; day_number: number; date: string; start_time: string } | null }[]).map((l) => ({
    date: l.date,
    slot: l.slot,
    // a lock is still a booked slot even if its booking row can't be read
    label: !l.bookings ? "Booked" : programVisible(l.bookings) ? `${l.bookings.program_name} D${l.bookings.day_number}` : `Training D${l.bookings.day_number}`,
  }));
  return (
    <div className="space-y-5">
      <PageHeader kicker="Availability" title={<>My availability</>} lead={<>Tap a slot to mark yourself available. Please confirm each month by the {ordinal(deadlineDay(deadline.day_of_month))} of the month before. Booked slots are locked;
          you can change anything else.</>} />
      <div className="card">
        <AvailabilityEditor
          key={month}
          month={month}
          today={today}
          initial={(avail ?? []) as { date: string; slot: "morning" | "evening" }[]}
          booked={booked}
          submittedAt={(sub as { submitted_at: string } | null)?.submitted_at ?? null}
        />
      </div>
    </div>
  );
}
