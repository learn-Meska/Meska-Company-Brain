import Link from "next/link";
import type { ReactNode } from "react";
import { fmtTime, isMonth, todayISO } from "@/lib/format";
import type { BookingRow } from "@/lib/notify";
import { MonthPicker } from "@/components/calendar-filters";
import { b2cNote, B2C_STATUS, type B2CStatus } from "@/lib/b2c";
import { offersB2CQr } from "@/lib/b2c-feedback";

// A B2C session uploaded on /admin/b2c (table b2c_sessions), shown beside the bookings.
export type B2CCard = {
  id: string;
  program: string;
  cohort: string;
  session: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  trainer_name: string | null;
  status: B2CStatus;
  delivered: boolean;
  format: string;
};
export const B2C_CARD_SELECT = "id, program, cohort, session, date, start_time, end_time, location, trainer_name, status, delivered, format";

export const NOTE: Record<string, string> = {
  needs_trainer: "bg-[#FDE2EC] border-[#F4A9C4]",
  confirmed: "bg-[#FFF3A3] border-[#F2DD6B]",
  awaiting_trainer: "bg-[#DCE8FF] border-[#A9C4F5]",
  pending_approval: "bg-[#FFE0CC] border-[#F5B48C]",
  delivered: "bg-[#D5F5E1] border-[#86D3A8]",
};
// A day the trainer marked as delivered turns green, whatever its status.
const noteFor = (b: BookingRow) => NOTE[b.finished_at ? "delivered" : b.status];

export function monthGrid(m: unknown) {
  const month = isMonth(m) ? m : todayISO().slice(0, 7);
  const [y, mm] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, mm - 1, 1));
  const lead = first.getUTCDay();
  const count = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  // Only this month's days: the weekday columns before the 1st and after the last day stay empty.
  const days = Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const weeks = Math.ceil((lead + count) / 7);
  const cells: (string | null)[] = Array.from({ length: weeks * 7 }, (_, i) => days[i - lead] ?? null);
  return {
    month,
    y,
    mm,
    first,
    days,
    from: days[0],
    to: days[count - 1],
    cells,
    prev: new Date(Date.UTC(y, mm - 2, 1)).toISOString().slice(0, 7),
    next: new Date(Date.UTC(y, mm, 1)).toISOString().slice(0, 7),
  };
}

// The big monthly board (Sunday first) with one sticky-note card per training.
export function MonthCalendar({
  grid,
  bookings,
  href,
  title,
  showTrainer = true,
  toolbar,
  qs,
  path,
  params = {},
  available,
  tag,
  notice,
  sessions = [],
  b2cQr = false,
}: {
  grid: ReturnType<typeof monthGrid>;
  bookings: BookingRow[];
  href: (b: BookingRow) => string;
  title: (b: BookingRow) => string;
  showTrainer?: boolean;
  toolbar?: ReactNode;
  qs: (month: string) => string;
  // the calendar's path and its other search params, for the month picker
  path: string;
  params?: Record<string, string>;
  // date -> free slots, shown in green when a single trainer is picked
  available?: Map<string, string[]>;
  // a small label on each card, e.g. the deal's segment (B2B)
  tag?: (b: BookingRow) => string | undefined;
  // a line above the board, e.g. why a filter shows nothing
  notice?: ReactNode;
  // B2C sessions on the board (not linked to a booking page)
  sessions?: B2CCard[];
  // show the feedback QR download on upcoming confirmed B2C sessions (booking team, or the trainer's own calendar)
  b2cQr?: boolean;
}) {
  const byDay = new Map<string, BookingRow[]>();
  for (const b of bookings) byDay.set(b.date, [...(byDay.get(b.date) ?? []), b]);
  const b2cByDay = new Map<string, B2CCard[]>();
  for (const x of [...sessions].sort((a, b) => a.start_time.localeCompare(b.start_time))) b2cByDay.set(x.date, [...(b2cByDay.get(x.date) ?? []), x]);
  const today = todayISO();
  const total = bookings.length + sessions.length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-end gap-4">
          <div className="text-7xl font-bold leading-none text-blue tabular-nums">{grid.mm}</div>
          <div>
            <div className="text-2xl font-bold leading-tight">{grid.first.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })}</div>
            <div className="text-xl font-semibold text-muted">{grid.y}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          <MonthPicker path={path} params={params} month={grid.month} thisYear={Number(today.slice(0, 4))} />
          <Link href={qs(grid.prev)} className="btn-ghost btn-sm">← Prev</Link>
          <Link href={qs(today.slice(0, 7))} className="btn-ghost btn-sm">Today</Link>
          <Link href={qs(grid.next)} className="btn-ghost btn-sm">Next →</Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><i className={`h-3 w-3 rounded border ${NOTE.confirmed}`} /> Confirmed</span>
        <span className="flex items-center gap-1.5"><i className={`h-3 w-3 rounded border ${NOTE.awaiting_trainer}`} /> Pending: waiting for the trainer to confirm</span>
        {showTrainer && <span className="flex items-center gap-1.5"><i className={`h-3 w-3 rounded border ${NOTE.needs_trainer}`} /> Needs a trainer</span>}
        <span className="flex items-center gap-1.5"><i className={`h-3 w-3 rounded border ${NOTE.delivered}`} /> Training delivered</span>
        {available && <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded border border-[#86D3A8] bg-[#DDF5E7]" /> Trainer available (free slot)</span>}
        <span>{total} {total === 1 ? "training" : "trainings"} this month</span>
      </div>
      {notice && <div className="rounded-lg border border-line bg-ice px-4 py-3 text-sm text-ink">{notice}</div>}
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[900px] grid-cols-7 overflow-hidden rounded-xl border border-[#B9C3D6] bg-[#B9C3D6] [gap:1px]">
          {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => (
            <div key={d} className="bg-[#C9D5FB] py-2.5 text-center text-base font-bold text-navy">{d}</div>
          ))}
          {grid.cells.map((date, i) => {
            if (!date) return <div key={`empty-${i}`} aria-hidden className="min-h-36 bg-[#F4F5F7]" />;
            const dow = i % 7;
            const items = byDay.get(date) ?? [];
            const b2c = b2cByDay.get(date) ?? [];
            const free = available?.get(date);
            return (
              <div key={date} className={`min-h-36 p-2 ${free ? "bg-[#DDF5E7]" : "bg-white"} ${date === today ? "ring-2 ring-inset ring-blue" : ""}`}>
                <div className="mb-1 flex items-start justify-between gap-1">
                  <span className={`text-2xl font-bold ${dow === 0 ? "text-[#F0567A]" : dow === 6 ? "text-[#4CC3F0]" : "text-ink"}`}>{Number(date.slice(8))}</span>
                  {free && (
                    <span className="rounded-full bg-[#1F9D5B] px-1.5 py-0.5 text-[10px] font-semibold text-white" title="Marked available, not booked yet">
                      {free.map((s) => (s === "morning" ? "Morning" : "Evening")).join(" + ")}
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  {items.map((b) => (
                    <Link
                      key={b.id}
                      href={href(b)}
                      className={`block rounded-sm border px-1.5 py-1 text-center text-[10.5px] leading-tight shadow-[1px_2px_3px_rgba(0,0,0,.12)] transition hover:-translate-y-0.5 ${noteFor(b)}`}
                    >
                      {tag?.(b) && <div className="mb-0.5"><span className="rounded-full bg-navy px-1.5 py-px text-[9px] font-bold tracking-wide text-white">{tag(b)}</span></div>}
                      <div className="font-semibold">
                        {title(b)}
                        {b.finished_at && <span title="Training delivered"> ✓</span>}
                      </div>
                      {showTrainer && <div><b>Trainer:</b> {b.trainers?.full_name ?? <i>needs a trainer</i>}</div>}
                      <div><b>Time:</b> {fmtTime(b.start_time)} - {fmtTime(b.end_time)}</div>
                      <div className="truncate"><b>Location:</b> {b.location ?? ""}</div>
                    </Link>
                  ))}
                  {b2c.map((x) => (
                    <div
                      key={x.id}
                      title={`B2C · ${x.program} ${x.cohort} · ${B2C_STATUS[x.status]}${x.delivered ? " · delivered" : ""}`}
                      className={`block rounded-sm border px-1.5 py-1 text-center text-[10.5px] leading-tight shadow-[1px_2px_3px_rgba(0,0,0,.12)] ${NOTE[b2cNote(x)] ?? NOTE.confirmed}`}
                    >
                      <div className="mb-0.5"><span className="rounded-full bg-[#7C3AED] px-1.5 py-px text-[9px] font-bold tracking-wide text-white">B2C</span></div>
                      <div className="font-semibold">
                        {x.program} {x.cohort} - {x.session}
                        {x.delivered && <span title="Training delivered"> ✓</span>}
                      </div>
                      {showTrainer && <div><b>Trainer:</b> {x.trainer_name ?? <i>needs a trainer</i>}</div>}
                      <div><b>Time:</b> {fmtTime(x.start_time)} - {fmtTime(x.end_time)}</div>
                      <div className="truncate"><b>Location:</b> {x.location ?? (x.format === "online" ? "Online" : "")}</div>
                      {b2cQr && offersB2CQr(x, today) && (
                        <a href={`/b2c/${x.id}/qr`} className="mt-1 inline-block rounded-full bg-navy px-2 py-0.5 text-[9.5px] font-semibold text-white hover:bg-blue" title="Download the feedback QR code for this session">
                          Feedback QR
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
