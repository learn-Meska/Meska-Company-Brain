"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { assignTrainer, requestCandidates } from "@/app/(app)/bookings/actions";
import { sameTimeClash, type TrainerDayStatus } from "@/lib/availability-check";
import { CalendarIcon } from "@/components/icons";

type Trainer = { id: string; full_name: string; tier: { name: string; color: string } | null; total: number };
type Day = { id: string; day_number: number; date: string; start: string; end: string; slots: string[]; status: Record<string, TrainerDayStatus> };
type Data = { trainers: Trainer[]; days: Day[] };

const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const t12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

const OPTION_NOTE: Record<TrainerDayStatus, string> = { free: "available", booked: "booked", unavailable: "not available" };
const ORDER: Record<TrainerDayStatus, number> = { free: 0, unavailable: 1, booked: 2 };

// The message next to a day's dropdown, once a trainer is picked.
function StatusNote({ status, clashDay }: { status: TrainerDayStatus | null; clashDay: number | null }) {
  if (!status) return <span className="text-xs text-faint">Pick a trainer</span>;
  if (clashDay) return <span className="rounded-full bg-bad-bg px-2.5 py-1 text-xs font-medium text-bad">Also picked for Day {clashDay} at the same time</span>;
  if (status === "booked") return <span className="rounded-full bg-bad-bg px-2.5 py-1 text-xs font-medium text-bad">Already booked at this time</span>;
  if (status === "unavailable") return <span className="rounded-full bg-warn-bg px-2.5 py-1 text-xs font-medium text-warn">Not available at this time</span>;
  return <span className="rounded-full bg-good-bg px-2.5 py-1 text-xs font-medium text-good">✓ Available</span>;
}

// Training Excellence assigns a trainer per day from a dropdown of every active trainer. Each day says whether
// the picked trainer is available, already booked, or hasn't marked that slot; only available picks can be saved.
export function AssignPanel({ bookingId, samePref }: { bookingId: string; samePref: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  // `version` reloads after an assignment, so the days already handled drop out.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    requestCandidates(bookingId)
      .then((r) => {
        if (!live) return;
        if ("error" in r && r.error) setErr(r.error);
        else setData(r as Data);
      })
      .catch(() => live && setErr("Couldn't load the trainers. Refresh the page to try again."));
    return () => {
      live = false;
    };
  }, [bookingId, version]);

  if (err) return <p className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{err}</p>;
  if (!data) return <p className="text-sm text-muted">Loading trainers…</p>;
  if (!data.days.length) return <p className="text-sm text-muted">Every day of this training has a trainer.</p>;
  if (!data.trainers.length) return <p className="rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">There are no active trainer profiles yet. Add one under Trainers first.</p>;

  const multi = data.days.length > 1;
  const name = new Map(data.trainers.map((t) => [t.id, t]));
  // A trainer picked for two days that share a date and slot: the later day shows the clash.
  const clashWith = (d: Day): number | null => {
    const t = pick[d.id];
    if (!t) return null;
    const other = data.days.find((o) => o.id !== d.id && o.day_number < d.day_number && pick[o.id] === t && sameTimeClash(o, d));
    return other?.day_number ?? null;
  };
  const picked = data.days.filter((d) => pick[d.id]);
  const blocked = picked.filter((d) => d.status[pick[d.id]] !== "free" || clashWith(d));
  // Two days at the same date and slot can never share a trainer, so then nobody is "free on every day".
  const daysClash = data.days.some((d, i) => data.days.slice(i + 1).some((o) => sameTimeClash(d, o)));
  const freeEveryDay = daysClash ? [] : data.trainers.filter((t) => data.days.every((d) => d.status[t.id] === "free"));

  function setAll(trainerId: string) {
    setMsg(null);
    setPick(Object.fromEntries(data!.days.map((d) => [d.id, trainerId])));
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await assignTrainer(picked.map((d) => ({ bookingId: d.id, trainerId: pick[d.id] }))).catch(() => ({ error: "That didn't go through. Check your connection and try again." }));
      setMsg(r);
      if (!r.error) {
        setPick({});
        setVersion((v) => v + 1);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {samePref && multi && <p className="callout text-sm">Growth would prefer <b>the same trainer for all days</b> (not required).</p>}

      {multi && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-ds-primary-soft px-4 py-3">
          <label htmlFor="assign-all" className="text-sm font-semibold text-ds-heading">Same trainer for every day</label>
          <select id="assign-all" className="input max-w-xs bg-white" value="" onChange={(e) => e.target.value && setAll(e.target.value)}>
            <option value="">{freeEveryDay.length ? `Choose (${freeEveryDay.length} free on every day)` : "Choose a trainer"}</option>
            {[...data.trainers]
              .sort((a, b) => Number(!freeEveryDay.includes(a)) - Number(!freeEveryDay.includes(b)) || a.full_name.localeCompare(b.full_name))
              .map((t) => (
                <option key={t.id} value={t.id}>{t.full_name}{freeEveryDay.includes(t) ? " — free on every day" : ""}</option>
              ))}
          </select>
          <span className="text-xs text-ds-text">Fills every day below; you can still change any day.</span>
        </div>
      )}

      <ul className="divide-y divide-ds-border overflow-hidden rounded-xl border border-ds-border">
        {data.days.map((d) => {
          const chosen = pick[d.id] ?? "";
          const options = [...data.trainers].sort((a, b) => ORDER[d.status[a.id]] - ORDER[d.status[b.id]] || a.full_name.localeCompare(b.full_name));
          const freeCount = data.trainers.filter((t) => d.status[t.id] === "free").length;
          const t = chosen ? name.get(chosen) : null;
          return (
            <li key={d.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:items-center">
              <div className="flex items-center gap-3">
                <span className="ds-icon-soft h-9 w-9 flex-none"><CalendarIcon size={16} /></span>
                <div>
                  <div className="text-sm font-semibold text-ds-heading">Day {d.day_number}</div>
                  <div className="text-xs text-ds-text">{fmt(d.date)} · {t12(d.start)} – {t12(d.end)}</div>
                  <div className={`text-xs ${freeCount ? "text-good" : "text-warn"}`}>{freeCount ? `${freeCount} available` : "No trainer available"}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="sr-only" htmlFor={`assign-${d.id}`}>Trainer for Day {d.day_number}</label>
                <select
                  id={`assign-${d.id}`}
                  className="input w-full sm:w-72"
                  value={chosen}
                  onChange={(e) => {
                    setMsg(null);
                    setPick((p) => ({ ...p, [d.id]: e.target.value }));
                  }}
                >
                  <option value="">Select a trainer…</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>{o.full_name} — {OPTION_NOTE[d.status[o.id]]}</option>
                  ))}
                </select>
                <StatusNote status={chosen ? d.status[chosen] : null} clashDay={clashWith(d)} />
                {t && (
                  <Link href={`/trainers/${t.id}`} target="_blank" className="text-xs text-ds-primary hover:underline">
                    Profile ↗
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button className="ds-btn ds-btn-primary" disabled={!picked.length || blocked.length > 0 || pending} onClick={save}>
          {pending ? "Assigning…" : !multi ? "Assign trainer" : picked.length ? `Assign ${picked.length} ${picked.length === 1 ? "day" : "days"}` : "Assign"}
        </button>
        {blocked.length > 0 && (
          <span className="text-xs text-bad">
            Change the trainer for {blocked.map((d) => `Day ${d.day_number}`).join(", ")}: only an available trainer can be assigned.
          </span>
        )}
        {!blocked.length && multi && picked.length > 0 && picked.length < data.days.length && (
          <span className="text-xs text-ds-text">Days left empty stay waiting for a trainer.</span>
        )}
      </div>
      {msg?.error && <p className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{msg.error}</p>}
      {msg?.ok && <p className="rounded-xl bg-good-bg px-3 py-2 text-sm text-good">{msg.ok}</p>}
    </div>
  );
}
