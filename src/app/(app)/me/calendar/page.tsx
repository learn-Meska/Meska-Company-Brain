import { MonthCalendar, monthGrid } from "@/components/month-calendar";
import { requireTrainer } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { trainerTitle } from "@/lib/format";
import { BOOKING_SELECT, type BookingRow } from "@/lib/notify";

export default async function MyCalendarPage({ searchParams }: PageProps<"/me/calendar">) {
  const me = await requireTrainer();
  const { m } = await searchParams;
  const grid = monthGrid(m);
  const { data } = await db()
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("trainer_id", me.trainer_id)
    .in("status", ["awaiting_trainer", "confirmed"])
    .gte("date", grid.cells[0])
    .lte("date", grid.cells[grid.cells.length - 1])
    .order("start_time");
  return (
    <MonthCalendar
      grid={grid}
      bookings={(data ?? []) as BookingRow[]}
      href={(b) => `/me/bookings/${b.id}`}
      title={(b) => trainerTitle(b)}
      showTrainer={false}
      qs={(mo) => `/me/calendar?m=${mo}`}
    />
  );
}
