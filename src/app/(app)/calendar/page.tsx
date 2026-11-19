import { MonthCalendar, monthGrid } from "@/components/month-calendar";
import { can, requireAccess } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { BOOKING_SELECT, type BookingRow } from "@/lib/notify";
import { todayISO } from "@/lib/format";
import { growthOwnerIds } from "@/lib/team-people";
import { isSegment, SEGMENT_LABEL, SEGMENTS, segmentOf, type Segment } from "@/lib/segment";

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const me = await requireAccess("te.find", "te.dashboard");
  const { m, trainer, segment } = await searchParams;
  const seg: Segment | "" = isSegment(segment) ? segment : "";
  const grid = monthGrid(m);
  let q = db()
    .from("bookings")
    .select(BOOKING_SELECT)
    .in("status", ["needs_trainer", "pending_approval", "awaiting_trainer", "confirmed"])
    .gte("date", grid.from)
    .lte("date", grid.to)
    .order("start_time");
  const picked = typeof trainer === "string" && trainer ? trainer : "";
  if (picked) q = q.eq("trainer_id", picked);
  // Growth sees the trainings it can open in its bookings list: its own, a team leader's members', or all
  // for the portal admin. Everyone else sees every training.
  const owners = await growthOwnerIds(me);
  if (owners) q = q.in("created_by", owners);
  // With one trainer picked, admins and booking managers see the days they marked available that still have a
  // free slot (today onwards). Growth only sees booked dates.
  const showFree = !!picked && can(me, "te.find");
  const from = [grid.from, todayISO()].sort()[1];
  const to = grid.to;
  const [{ data }, { data: trainers }, { data: avail }, { data: locks }] = await Promise.all([
    q,
    // scoped Growth logins only get the trainers on their own trainings in the filter
    owners
      ? db().from("bookings").select("trainer_id, trainers(id, full_name)").in("created_by", owners).not("trainer_id", "is", null).in("status", ["awaiting_trainer", "confirmed"]).limit(1000)
      : db().from("trainers").select("id, full_name").order("full_name"),
    showFree ? db().from("availability").select("date, slot").eq("trainer_id", picked).gte("date", from).lte("date", to) : Promise.resolve({ data: [] }),
    showFree ? db().from("booking_locks").select("date, slot").eq("trainer_id", picked).gte("date", from).lte("date", to) : Promise.resolve({ data: [] }),
  ]);
  // Each training's deal segment (B2B for every deal Growth sends; B2C comes later), for the label and filter.
  const rows = (data ?? []) as BookingRow[];
  const dealIds = [...new Set(rows.map((b) => b.deal_id).filter((id): id is string => !!id))];
  const { data: deals } = dealIds.length ? await db().from("deals").select("id, segment").in("id", dealIds) : { data: [] };
  const segmentOfDeal = new Map(((deals ?? []) as { id: string; segment: string | null }[]).map((d) => [d.id, d.segment]));
  const segmentFor = (b: BookingRow) => segmentOf(b.deal_id ? segmentOfDeal.get(b.deal_id) : null);
  const shown = seg ? rows.filter((b) => segmentFor(b) === seg) : rows;
  const taken = new Set(((locks ?? []) as { date: string; slot: string }[]).map((l) => `${l.date}|${l.slot}`));
  const available = new Map<string, string[]>();
  for (const a of (avail ?? []) as { date: string; slot: string }[]) {
    if (!taken.has(`${a.date}|${a.slot}`)) available.set(a.date, [...(available.get(a.date) ?? []), a.slot].sort().reverse());
  }
  const trainerOptions = owners
    ? [...new Map(((trainers ?? []) as unknown as { trainers: { id: string; full_name: string } | null }[]).filter((r) => r.trainers).map((r) => [r.trainers!.id, r.trainers!])).values()].sort((a, b) => a.full_name.localeCompare(b.full_name))
    : ((trainers ?? []) as { id: string; full_name: string }[]);
  const qs = (mo: string) => `/calendar?m=${mo}${picked ? `&trainer=${encodeURIComponent(picked)}` : ""}${seg ? `&segment=${seg}` : ""}`;
  return (
    <MonthCalendar
      grid={grid}
      bookings={shown}
      tag={(b) => SEGMENT_LABEL[segmentFor(b)]}
      href={(b) => `/bookings/${b.id}`}
      title={(b) => `${b.program_name} - Day ${b.day_number}`}
      qs={qs}
      available={showFree ? available : undefined}
      toolbar={
        <form className="flex gap-2" action="/calendar">
          <input type="hidden" name="m" value={grid.month} />
          <select name="trainer" defaultValue={typeof trainer === "string" ? trainer : ""} className="input w-48 py-1.5">
            <option value="">All trainers</option>
            {trainerOptions.map((t) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
          <select name="segment" defaultValue={seg} className="input w-36 py-1.5" aria-label="Deal type">
            <option value="">B2B and B2C</option>
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>
            ))}
          </select>
          <button className="btn-ghost btn-sm">Filter</button>
        </form>
      }
    />
  );
}
