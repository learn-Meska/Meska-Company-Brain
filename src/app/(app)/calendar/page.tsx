import { MonthCalendar, monthGrid } from "@/components/month-calendar";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { BOOKING_SELECT, type BookingRow } from "@/lib/notify";
import { todayISO } from "@/lib/format";

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
  const picked = typeof trainer === "string" && trainer ? trainer : "";
  if (picked) q = q.eq("trainer_id", picked);
  // With one trainer picked, show the days they marked available that still have a free slot (today onwards).
  const from = [grid.cells[0], todayISO()].sort()[1];
  const to = grid.cells[grid.cells.length - 1];
  const [{ data }, { data: trainers }, { data: avail }, { data: locks }] = await Promise.all([
    q,
    db().from("trainers").select("id, full_name").order("full_name"),
    picked ? db().from("availability").select("date, slot").eq("trainer_id", picked).gte("date", from).lte("date", to) : Promise.resolve({ data: [] }),
    picked ? db().from("booking_locks").select("date, slot").eq("trainer_id", picked).gte("date", from).lte("date", to) : Promise.resolve({ data: [] }),
  ]);
  const taken = new Set(((locks ?? []) as { date: string; slot: string }[]).map((l) => `${l.date}|${l.slot}`));
  const available = new Map<string, string[]>();
  for (const a of (avail ?? []) as { date: string; slot: string }[]) {
    if (!taken.has(`${a.date}|${a.slot}`)) available.set(a.date, [...(available.get(a.date) ?? []), a.slot].sort().reverse());
  }
  const qs = (mo: string) => `/calendar?m=${mo}${typeof trainer === "string" && trainer ? `&trainer=${trainer}` : ""}`;
  return (
    <MonthCalendar
      grid={grid}
      bookings={(data ?? []) as BookingRow[]}
      href={(b) => `/bookings/${b.id}`}
      title={(b) => `${b.program_name} - Day ${b.day_number}`}
      qs={qs}
      available={picked ? available : undefined}
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
