"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { saveAvailability } from "@/app/(app)/me/actions";

type Slot = "morning" | "evening";
type Booked = { date: string; slot: Slot; label: string };

export function AvailabilityEditor({
  month,
  initial,
  booked,
  submittedAt,
  today,
}: {
  month: string;
  initial: { date: string; slot: Slot }[];
  booked: Booked[];
  submittedAt: string | null;
  today: string;
}) {
  const [sel, setSel] = useState(() => new Set(initial.map((c) => `${c.date}|${c.slot}`)));
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const bookedMap = useMemo(() => new Map(booked.map((b) => [`${b.date}|${b.slot}`, b.label])), [booked]);

  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay(); // Sunday first, like the planning calendar
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const dirty = useMemo(() => {
    const a = [...sel].sort().join();
    const b = initial.map((c) => `${c.date}|${c.slot}`).sort().join();
    return a !== b;
  }, [sel, initial]);

  function toggle(k: string) {
    if (bookedMap.has(k)) {
      setMsg({ error: "You are already booked for this day." });
      return;
    }
    setMsg(null);
    setSel((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }
  function bulk(slot: Slot | "both", on: boolean, weekdaysOnly = false) {
    setSel((s) => {
      const n = new Set(s);
      for (let d = 1; d <= days; d++) {
        const date = `${month}-${String(d).padStart(2, "0")}`;
        if (date < today) continue;
        const dow = new Date(date + "T00:00:00Z").getUTCDay();
        if (weekdaysOnly && (dow === 5 || dow === 6)) continue;
        for (const sl of slot === "both" ? (["morning", "evening"] as Slot[]) : [slot]) {
          const k = `${date}|${sl}`;
          if (bookedMap.has(k)) continue;
          if (on) n.add(k);
          else n.delete(k);
        }
      }
      return n;
    });
  }
  function save(submit: boolean) {
    const cells = [...sel].map((k) => {
      const [date, slot] = k.split("|");
      return { date, slot: slot as Slot };
    });
    start(async () => setMsg((await saveAvailability(month, cells, submit).catch(() => ({ error: "That didn't go through. Check your connection and try again." }))) ?? null));
  }

  const label = first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {prev >= today.slice(0, 7) ? <Link href={`?m=${prev}`} className="btn-ghost btn-sm">←</Link> : <span className="btn-ghost btn-sm opacity-40" aria-hidden>←</span>}
          <h2 className="h2 min-w-44 text-center">{label}</h2>
          <Link href={`?m=${next}`} className="btn-ghost btn-sm">→</Link>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button className="btn-ghost btn-sm" onClick={() => bulk("morning", true, true)}>All weekday mornings</button>
          <button className="btn-ghost btn-sm" onClick={() => bulk("evening", true, true)}>All weekday evenings</button>
          <button className="btn-ghost btn-sm" onClick={() => bulk("both", false)}>Clear month</button>
        </div>
      </div>
      {msg?.error && <p className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{msg.error}</p>}
      {msg?.ok && <p className="rounded-xl bg-good-bg px-3 py-2 text-sm text-good">{msg.ok}</p>}
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-blue" /> Available</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-[#F6C54A]" /> Booked (locked)</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded border border-line bg-surface" /> Not available</span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-7 overflow-hidden rounded-2xl border border-line bg-line [gap:1px]">
          {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => (
            <div key={d} className="bg-[#C9D5FB] py-2 text-center text-sm font-semibold text-navy">{d}</div>
          ))}
          {Array.from({ length: lead }).map((_, i) => <div key={"l" + i} className="bg-bg" />)}
          {Array.from({ length: days }).map((_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, "0")}`;
            const past = date < today;
            const dow = (lead + i) % 7;
            return (
              <div key={date} className={`min-h-28 bg-surface p-2 ${past ? "opacity-50" : ""}`}>
                <div className={`mb-1.5 text-lg font-bold ${dow === 0 ? "text-[#F0567A]" : dow === 6 ? "text-[#4CC3F0]" : "text-ink"}`}>{i + 1}</div>
                {(["morning", "evening"] as Slot[]).map((slot) => {
                  const k = `${date}|${slot}`;
                  const b = bookedMap.get(k);
                  const on = sel.has(k);
                  return (
                    <button
                      key={slot}
                      disabled={past && !b}
                      onClick={() => toggle(k)}
                      title={b ? `Booked: ${b}` : undefined}
                      className={`mb-1 block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] font-medium transition ${
                        b ? "bg-[#F6C54A] text-navy" : on ? "bg-blue text-white" : "border border-line text-muted hover:border-blue"
                      }`}
                    >
                      {slot === "morning" ? "9–5" : "6–11"} {b ? `· ${b}` : on ? "✓" : ""}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending} onClick={() => save(true)}>{pending ? "Saving…" : "Save & confirm this month"}</button>
        <button className="btn-ghost" disabled={pending || !dirty} onClick={() => save(false)}>Save draft</button>
        <span className="text-xs text-muted">{submittedAt ? `Confirmed on ${new Date(submittedAt).toLocaleDateString("en-GB", { timeZone: "Africa/Cairo" })}` : "Not confirmed yet for this month"}</span>
      </div>
    </div>
  );
}
