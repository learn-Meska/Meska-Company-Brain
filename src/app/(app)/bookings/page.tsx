import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { StatusBadge } from "@/components/status";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { fmtDate, fmtTime, STATUS_LABEL, todayISO } from "@/lib/format";
import { BOOKING_SELECT, type BookingRow } from "@/lib/notify";

export default async function BookingsPage({ searchParams }: PageProps<"/bookings">) {
  await requireRole("admin", "approver", "growth");
  const { status, when, new: isNew, requested } = await searchParams;
  let q = db().from("bookings").select(BOOKING_SELECT).order("date", { ascending: when !== "past" }).limit(300);
  if (typeof status === "string" && status) q = q.eq("status", status);
  q = when === "past" ? q.lt("date", todayISO()) : q.gte("date", todayISO());
  const { data } = await q;
  const rows = (data ?? []) as BookingRow[];
  const link = (p: Record<string, string>) => "/bookings?" + new URLSearchParams({ ...(typeof status === "string" ? { status } : {}), ...(typeof when === "string" ? { when } : {}), ...p }).toString();
  return (
    <div className="space-y-5">
      {requested && <p className="rounded-xl bg-good-bg px-4 py-3 text-sm text-good">Request sent. It&apos;s on the calendar as “Needs a trainer” and the booking team was notified.</p>}
      {isNew && <p className="rounded-xl bg-good-bg px-4 py-3 text-sm text-good">Booked. The trainer was emailed and asked to confirm; you&apos;ll be notified when they respond.</p>}
      <PageHeader kicker="Bookings" title={<>All bookings</>} />
      <div className="flex flex-wrap gap-2">
        <Link href={link({ when: "upcoming" })} className={when !== "past" ? "btn btn-sm" : "btn-ghost btn-sm"}>Upcoming</Link>
        <Link href={link({ when: "past" })} className={when === "past" ? "btn btn-sm" : "btn-ghost btn-sm"}>Past</Link>
        <span className="mx-1 w-px bg-line" />
        <Link href={link({ status: "" })} className={!status ? "btn btn-sm" : "btn-ghost btn-sm"}>Any status</Link>
        {Object.entries(STATUS_LABEL).filter(([k]) => !["pending_approval", "rejected", "declined"].includes(k)).map(([k, v]) => (
          <Link key={k} href={link({ status: k })} className={status === k ? "btn btn-sm" : "btn-ghost btn-sm"}>{v}</Link>
        ))}
      </div>
      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>Date</th><th>Program</th><th>Trainer</th><th>Client profile</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted">No bookings here.</td></tr>}
            {rows.map((b) => (
              <tr key={b.id}>
                <td className="whitespace-nowrap">
                  {fmtDate(b.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  <div className="text-xs text-muted">{fmtTime(b.start_time)} – {fmtTime(b.end_time)}</div>
                </td>
                <td><Link href={`/bookings/${b.id}`} className="font-medium text-blue hover:underline">{b.program_name}</Link><div className="text-xs text-muted">Day {b.day_number}</div></td>
                <td>{b.trainers?.full_name ?? <span className="text-[#B4235A]">Needs a trainer</span>}</td>
                <td className="text-xs text-muted">{[b.audience?.name, b.func?.name, b.industry?.name].filter(Boolean).join(" · ")}</td>
                <td><StatusBadge status={b.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
