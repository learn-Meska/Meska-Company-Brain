"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { checkAvailability } from "@/app/(app)/availability/actions";
import { AvailabilityChip } from "@/components/availability-chip";
import { CalendarIcon, PlusIcon } from "@/components/icons";
import { daysToParam, MAX_CHECK_DAYS } from "@/lib/availability-check";

type Day = { key: number; date: string; start: string; end: string };

const PRESETS = [
  { label: "Morning 10 AM – 3 PM", start: "10:00", end: "15:00" },
  { label: "Full morning 9 AM – 5 PM", start: "09:00", end: "17:00" },
  { label: "Evening 6 PM – 10 PM", start: "18:00", end: "22:00" },
];

function addDays(d: string, n: number) {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

// Growth's availability check without a deal: dates in, "a trainer is available" or not out.
export function AvailabilityChecker({ today, canStartDeal }: { today: string; canStartDeal: boolean }) {
  const [days, setDays] = useState<Day[]>([{ key: 1, date: "", start: "10:00", end: "15:00" }]);
  const [result, setResult] = useState<{ query: string; days: boolean[] | null; sameTrainer: boolean | null; error: string }>({ query: "", days: null, sameTrainer: null, error: "" });
  const patch = (key: number, p: Partial<Day>) => setDays((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));

  const ready = days.every((d) => d.date && d.start && d.end);
  const query = ready ? JSON.stringify(days.map((d) => [d.date, d.start, d.end])) : "";
  useEffect(() => {
    if (!query) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await checkAvailability({ days: days.map((d) => ({ date: d.date, start: d.start, end: d.end })) }).catch(() => ({ error: "Couldn't check availability. Check your connection and try again." }));
      if (!live) return;
      setResult("days" in r ? { query, days: r.days, sameTrainer: r.sameTrainer, error: "" } : { query, days: null, sameTrainer: null, error: r.error ?? "" });
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `query` captures every input that matters
  }, [query]);
  const answer = result.query === query ? result : null;
  const yes = answer?.days?.filter(Boolean).length ?? 0;
  const dealHref = `/request?days=${encodeURIComponent(daysToParam(days))}`;

  function addDay() {
    const last = days[days.length - 1];
    setDays([...days, { ...last, key: last.key + 1, date: last.date ? addDays(last.date, 1) : "" }]);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <section className="ds-card relative overflow-hidden p-5 sm:p-6">
        <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-ds-primary" />
        <div>
          <h2 className="text-lg font-semibold text-ds-heading">Training days</h2>
          <p className="text-sm text-ds-text">Add each day and its time. The answer updates as you type.</p>
        </div>

        <ol className="mt-5 space-y-3">
          {days.map((d, i) => (
            <li key={d.key} className="rounded-xl border border-ds-border p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-ds-heading">
                  <span className="ds-icon-soft h-8 w-8"><CalendarIcon size={16} /></span>
                  Day {i + 1}
                </span>
                {days.length > 1 && (
                  <button type="button" className="text-xs text-bad hover:underline" onClick={() => setDays(days.filter((x) => x.key !== d.key))}>
                    Remove day
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_120px]">
                <div>
                  <label className="label" htmlFor={`av-d${d.key}`}>Date</label>
                  <input id={`av-d${d.key}`} type="date" min={today} className="input" value={d.date} onChange={(e) => patch(d.key, { date: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor={`av-s${d.key}`}>From</label>
                  <input id={`av-s${d.key}`} type="time" className="input" value={d.start} onChange={(e) => patch(d.key, { start: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor={`av-e${d.key}`}>To</label>
                  <input id={`av-e${d.key}`} type="time" className="input" value={d.end} onChange={(e) => patch(d.key, { end: e.target.value })} />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button key={p.label} type="button" className="ds-chip hover:brightness-95" onClick={() => patch(d.key, { start: p.start, end: p.end })}>
                      {p.label}
                    </button>
                  ))}
                </div>
                {answer?.days && <AvailabilityChip available={answer.days[i]} />}
              </div>
            </li>
          ))}
        </ol>
        {days.length < MAX_CHECK_DAYS && (
          <button type="button" onClick={addDay} className="ds-btn ds-btn-outline mt-4">
            <PlusIcon size={16} /> Add another day
          </button>
        )}
      </section>

      <aside className="ds-card p-5 lg:sticky lg:top-20">
        <h2 className="text-base font-semibold text-ds-heading">Result</h2>
        {!ready ? (
          <p className="mt-2 text-sm text-ds-text">Pick a date for every day to see whether a trainer is available.</p>
        ) : !answer ? (
          <p className="mt-2 text-sm text-ds-text">Checking availability…</p>
        ) : answer.error || !answer.days ? (
          <p className="mt-3 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">{answer.error || "Couldn't check availability."}</p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="rounded-xl bg-ds-primary-soft px-4 py-3">
              <div className="text-2xl font-bold tabular-nums text-ds-primary">
                {yes} <span className="text-sm font-medium text-ds-text">of {days.length}</span>
              </div>
              <div className="text-xs text-ds-text">{days.length === 1 ? "day has" : "days have"} a trainer available</div>
            </div>
            {answer.sameTrainer != null && (
              <p className={`rounded-xl px-3 py-2 text-sm ${answer.sameTrainer ? "bg-good-bg text-good" : "bg-warn-bg text-warn"}`}>
                {answer.sameTrainer ? "One trainer can take every day." : "No single trainer is free on every day. The days may go to different trainers."}
              </p>
            )}
            {yes < days.length && <p className="text-sm text-ds-text">For a day with no trainer free, try another date or the other slot (morning or evening), or send the deal anyway and Training Excellence will follow up.</p>}
            {canStartDeal && (
              <Link href={dealHref} className="ds-btn ds-btn-primary w-full justify-center">
                Start a new deal with {days.length === 1 ? "this day" : "these days"}
              </Link>
            )}
          </div>
        )}
        <p className="mt-4 border-t border-ds-border pt-3 text-xs text-ds-text">
          This shows whether a trainer is available, not who. Training Excellence chooses the trainer after the deal is sent, and availability can change until then.
        </p>
      </aside>
    </div>
  );
}
