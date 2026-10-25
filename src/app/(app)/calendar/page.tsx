import { MonthCalendar, monthGrid } from "@/components/month-calendar";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { BOOKING_SELECT, type BookingRow } from "@/lib/notify";

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  await requireRole("admin", "approver", "growth");
  const { m, trainer } = await searchParams;
  const grid = monthGrid(m);
  let q = db()
    .from("bookings")
    .select(BOOKING_SELECT)
    .in("status", ["needs_trainer", "pending_approval", "awaiting_trainer", "confirmed"])
    .gte("date", grid.cells[0])
    .lte("date", grid.cells[grid.cells.length - 1])
    .order("start_time");
  if (typeof trainer === "string" && trainer) q = q.eq("trainer_id", trainer);
  const [{ data }, { data: trainers }] = await Promise.all([q, db().from("trainers").select("id, full_name").order("full_name")]);
  const qs = (mo: string) => `/calendar?m=${mo}${typeof trainer === "string" && trainer ? `&trainer=${trainer}` : ""}`;
  return (
    <MonthCalendar
      grid={grid}
      bookings={(data ?? []) as BookingRow[]}
      href={(b) => `/bookings/${b.id}`}
      title={(b) => `${b.program_name} - Day ${b.day_number}`}
      qs={qs}
      toolbar={
        <form className="flex gap-2" action="/calendar">
          <input type="hidden" name="m" value={grid.month} />
          <select name="trainer" defaultValue={typeof trainer === "string" ? trainer : ""} className="input w-48 py-1.5">
            <option value="">All trainers</option>
            {((trainers ?? []) as { id: string; full_name: string }[]).map((t) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
          <button className="btn-ghost btn-sm">Filter</button>
        </form>
      }
    />
  );
}
