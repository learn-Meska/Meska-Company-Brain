"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createRequest } from "@/app/(app)/bookings/actions";

type Opt = { id: string; name: string };
type Day = { key: number; date: string; start: string; end: string; location: string; skillIds: string[]; content: string };

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

export function RequestBuilder({ audience, functions, industries, skills, today }: { audience: Opt[]; functions: Opt[]; industries: Opt[]; skills: Opt[]; today: string }) {
  const router = useRouter();
  const [f, setF] = useState({ program_name: "", audience_id: "", function_id: "", industry_id: "" });
  const [same, setSame] = useState(false);
  const [days, setDays] = useState<Day[]>([{ key: 1, date: "", start: "10:00", end: "15:00", location: "", skillIds: [], content: "" }]);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const patch = (key: number, p: Partial<Day>) => setDays((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));

  function addDay() {
    const last = days[days.length - 1];
    setDays([...days, { ...last, key: last.key + 1, date: last.date ? addDays(last.date, 1) : "", content: "" }]);
  }
  function submit() {
    setErr("");
    start(async () => {
      const r = await createRequest({
        ...f,
        same_trainer: same,
        days: days.map((d, i) => ({ day_number: i + 1, date: d.date, start: d.start, end: d.end, location: d.location, skill_ids: d.skillIds, content: d.content })),
      });
      if (r.error) return setErr(r.error);
      router.push(r.ids?.length === 1 ? `/bookings/${r.ids[0]}?requested=1` : "/bookings?requested=1");
    });
  }

  return (
    <div className="space-y-5">
      <section className="card space-y-4">
        <div>
          <div className="eyebrow">Step 1</div>
          <h2 className="h2">The client &amp; program</h2>
        </div>
        <div className="max-w-md">
          <label className="label" htmlFor="program">Program name *</label>
          <input id="program" className="input" placeholder="e.g. Aman Holding HR" value={f.program_name} onChange={(e) => setF({ ...f, program_name: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["audience_id", "Audience level", audience],
              ["function_id", "Function", functions],
              ["industry_id", "Industry", industries],
            ] as const
          ).map(([k, label, opts]) => (
            <div key={k}>
              <label className="label" htmlFor={k}>{label} *</label>
              <select id={k} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
                <option value="">Select…</option>
                {opts.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="eyebrow">Step 2</div>
            <h2 className="h2">Training days</h2>
            <p className="text-sm text-muted">Add each day with its own content. The booking team assigns the trainer.</p>
          </div>
          <button type="button" onClick={addDay} className="btn-ghost">+ Add another day</button>
        </div>
        {days.map((d, i) => (
          <div key={d.key} className="rounded-2xl border border-line p-4">
            <div className="mb-3 flex items-center justify-between">
              <b>Day {i + 1}</b>
              {days.length > 1 && (
                <button type="button" className="text-xs text-bad hover:underline" onClick={() => setDays(days.filter((x) => x.key !== d.key))}>
                  Remove day
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-[160px_120px_120px_1fr]">
              <div>
                <label className="label" htmlFor={`d${d.key}`}>Date *</label>
                <input id={`d${d.key}`} type="date" min={today} className="input" value={d.date} onChange={(e) => patch(d.key, { date: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor={`s${d.key}`}>From</label>
                <input id={`s${d.key}`} type="time" className="input" value={d.start} onChange={(e) => patch(d.key, { start: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor={`e${d.key}`}>To</label>
                <input id={`e${d.key}`} type="time" className="input" value={d.end} onChange={(e) => patch(d.key, { end: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor={`l${d.key}`}>Location (address or map link)</label>
                <input id={`l${d.key}`} className="input" value={d.location} onChange={(e) => patch(d.key, { location: e.target.value })} />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.label} type="button" className="rounded-full bg-surface2 px-2.5 py-0.5 text-[11px] text-muted hover:text-ink" onClick={() => patch(d.key, { start: p.start, end: p.end })}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <div className="label">Skills this day&apos;s content needs</div>
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((s) => {
                    const on = d.skillIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => patch(d.key, { skillIds: on ? d.skillIds.filter((x) => x !== s.id) : [...d.skillIds, s.id] })}
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${on ? "border-navy bg-navy text-white" : "border-line bg-surface hover:border-blue"}`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="label" htmlFor={`c${d.key}`}>Content to be delivered on this day *</label>
                <textarea id={`c${d.key}`} className="input" rows={3} placeholder="Objectives, topics and client notes." value={d.content} onChange={(e) => patch(d.key, { content: e.target.value })} />
              </div>
            </div>
          </div>
        ))}
        {days.length > 1 && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} /> Prefer the same trainer for all days
          </label>
        )}
      </section>

      {err && <p className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{err}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending} onClick={submit}>
          {pending ? "Sending…" : days.length > 1 ? `Request ${days.length} days` : "Request training"}
        </button>
        <span className="text-xs text-muted">It goes on the calendar as “Needs a trainer” and the booking team is notified.</span>
      </div>
    </div>
  );
}
