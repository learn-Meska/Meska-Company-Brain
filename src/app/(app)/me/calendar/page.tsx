import { B2C_CARD_SELECT, MonthCalendar, monthGrid, type B2CCard } from "@/components/month-calendar";
import { requireTrainer } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { trainerTitle } from "@/lib/format";
import { BOOKING_SELECT, type BookingRow } from "@/lib/notify";

export default async function MyCalendarPage({ searchParams }: PageProps<"/me/calendar">) {
  const me = await requireTrainer();
  const { m } = await searchParams;
  const grid = monthGrid(m);
  // the trainer's own B2C sessions (matched to their profile when uploaded)
  const { data: b2c } = await db()
    .from("b2c_sessions")
    .select(B2C_CARD_SELECT)
    .eq("trainer_id", me.trainer_id)
    .in("status", ["awaiting_trainer", "confirmed"])
    .gte("date", grid.from)
    .lte("date", grid.to)
    .order("start_time");
  const { data } = await db()
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("trainer_id", me.trainer_id)
    .in("status", ["awaiting_trainer", "confirmed"])
    .gte("date", grid.from)
    .lte("date", grid.to)
    .order("start_time");
  return (
    <MonthCalendar
      grid={grid}
      bookings={(data ?? []) as BookingRow[]}
      href={(b) => `/me/bookings/${b.id}`}
      title={(b) => trainerTitle(b)}
      showTrainer={false}
      sessions={(b2c ?? []) as B2CCard[]}
      qs={(mo) => `/me/calendar?m=${mo}`}
      path="/me/calendar"
    />
  );
}
