import Link from "next/link";
import type { ReactNode } from "react";
import { fmtTime, todayISO } from "@/lib/format";
import type { BookingRow } from "@/lib/notify";

export const NOTE: Record<string, string> = {
  needs_trainer: "bg-[#FDE2EC] border-[#F4A9C4]",
  confirmed: "bg-[#FFF3A3] border-[#F2DD6B]",
  awaiting_trainer: "bg-[#DCE8FF] border-[#A9C4F5]",
  pending_approval: "bg-[#FFE0CC] border-[#F5B48C]",
};

export function monthGrid(m: unknown) {
  const month = typeof m === "string" && /^\d{4}-\d{2}$/.test(m) ? m : todayISO().slice(0, 7);
  const [y, mm] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, mm - 1, 1));
  const lead = first.getUTCDay();
  const gridStart = new Date(Date.UTC(y, mm - 1, 1 - lead));
  const weeks = Math.ceil((lead + new Date(Date.UTC(y, mm, 0)).getUTCDate()) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => new Date(gridStart.getTime() + i * 86400000).toISOString().slice(0, 10));
  return {
    month,
    y,
    mm,
    first,
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
  available,
}: {
  grid: ReturnType<typeof monthGrid>;
  bookings: BookingRow[];
  href: (b: BookingRow) => string;
  title: (b: BookingRow) => string;
  showTrainer?: boolean;
  toolbar?: ReactNode;
  qs: (month: string) => string;
  // date -> free slots, shown in green when a single trainer is picked
  available?: Map<string, string[]>;
}) {
  const byDay = new Map<string, BookingRow[]>();
  for (const b of bookings) byDay.set(b.date, [...(byDay.get(b.date) ?? []), b]);
  const today = todayISO();
  const total = bookings.length;
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
          <Link href={qs(grid.prev)} className="btn-ghost btn-sm">← Prev</Link>
          <Link href={qs(today.slice(0, 7))} className="btn-ghost btn-sm">Today</Link>
          <Link href={qs(grid.next)} className="btn-ghost btn-sm">Next →</Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><i className={`h-3 w-3 rounded border ${NOTE.confirmed}`} /> Confirmed</span>
        <span className="flex items-center gap-1.5"><i className={`h-3 w-3 rounded border ${NOTE.awaiting_trainer}`} /> Pending: waiting for the trainer to confirm</span>
        <span className="flex items-center gap-1.5"><i className={`h-3 w-3 rounded border ${NOTE.needs_trainer}`} /> Needs a trainer</span>
        {available && <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded border border-[#86D3A8] bg-[#DDF5E7]" /> Trainer available (free slot)</span>}
        <span>✎ = trainer brief received</span>
        <span>{total} {total === 1 ? "training" : "trainings"} this month</span>
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[900px] grid-cols-7 overflow-hidden rounded-xl border border-[#B9C3D6] bg-[#B9C3D6] [gap:1px]">
          {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => (
            <div key={d} className="bg-[#C9D5FB] py-2.5 text-center text-base font-bold text-navy">{d}</div>
          ))}
          {grid.cells.map((date, i) => {
            const inMonth = date.slice(0, 7) === grid.month;
            const dow = i % 7;
            const items = byDay.get(date) ?? [];
            const free = available?.get(date);
            return (
              <div key={date} className={`min-h-36 p-2 ${free ? "bg-[#DDF5E7]" : inMonth ? "bg-white" : "bg-[#EDEEF1]"} ${date === today ? "ring-2 ring-inset ring-blue" : ""}`}>
                <div className="mb-1 flex items-start justify-between gap-1">
                  <span className={`text-2xl font-bold ${!inMonth ? "text-faint" : dow === 0 ? "text-[#F0567A]" : dow === 6 ? "text-[#4CC3F0]" : "text-ink"}`}>{Number(date.slice(8))}</span>
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
                      className={`block rounded-sm border px-1.5 py-1 text-center text-[10.5px] leading-tight shadow-[1px_2px_3px_rgba(0,0,0,.12)] transition hover:-translate-y-0.5 ${NOTE[b.status]}`}
                    >
                      <div className="font-semibold">
                        {title(b)}
                        {b.brief_submitted_at && <span title="Trainer brief received"> ✎</span>}
                      </div>
                      {showTrainer && <div><b>Trainer:</b> {b.trainers?.full_name ?? <i>needs a trainer</i>}</div>}
                      <div><b>Time:</b> {fmtTime(b.start_time)} - {fmtTime(b.end_time)}</div>
                      <div className="truncate"><b>Location:</b> {b.location ?? ""}</div>
                    </Link>
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
