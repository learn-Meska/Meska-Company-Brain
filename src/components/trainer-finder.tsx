"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { findForDays } from "@/app/(app)/bookings/actions";

type Opt = { id: string; name: string };
type Match = { id: string; full_name: string; title: string | null; total: number; tier: { name: string; color: string } | null; feedback: number | null; delivered: number; skills: string[] };
type Day = { key: number; date: string; start: string; end: string; skillIds: string[] };

function addDays(d: string, n: number) {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
const dayLabel = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function TrainerCard({ m }: { m: Match }) {
  return (
    <div className="card flex flex-col gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-[15px]">{m.full_name}</b>
          {m.tier && <span className="badge text-white" style={{ background: m.tier.color }}>{m.tier.name}</span>}
        </div>
        {m.title && <div className="text-xs text-muted">{m.title}</div>}
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
          <span><b className="text-ink">{m.total}</b> score</span>
          <span><b className="text-ink">{m.feedback?.toFixed(2) ?? "—"}</b>/5 feedback</span>
          <span><b className="text-ink">{m.delivered}</b> delivered</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">{m.skills.map((s) => <span key={s} className="chip">{s}</span>)}</div>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <Link href={`/trainers/${m.id}`} className="btn-ghost btn-sm">View profile</Link>
        <a href={`/trainers/${m.id}/bio`} className="btn btn-sm">Download profile (PDF)</a>
      </div>
    </div>
  );
}

export function TrainerFinder({ audience, industries, skills, today }: { audience: Opt[]; industries: Opt[]; skills: Opt[]; today: string }) {
  const [f, setF] = useState({ audience_id: "", industry_id: "" });
  const [days, setDays] = useState<Day[]>([{ key: 1, date: "", start: "10:00", end: "15:00", skillIds: [] }]);
  const [same, setSame] = useState(false);
  const [res, setRes] = useState<{ days: Match[][]; common: Match[]; asked: Day[]; same: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  const patch = (key: number, p: Partial<Day>) => setDays((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));
  function addDay() {
    const last = days[days.length - 1];
    setDays([...days, { key: last.key + 1, date: last.date ? addDays(last.date, 1) : "", start: last.start, end: last.end, skillIds: [...last.skillIds] }]);
  }
  function search() {
    setErr("");
    if (!f.audience_id || !f.industry_id) return setErr("Pick the audience level and industry.");
    start(async () => {
      const r = await findForDays({ audienceId: f.audience_id, industryId: f.industry_id, sameTrainer: same, days: days.map(({ date, start, end, skillIds }) => ({ date, start, end, skillIds })) });
      if ("error" in r && r.error) return setErr(r.error);
      const ok = r as Exclude<typeof r, { error: string }>;
      setRes({ ...ok, asked: days, same });
    });
  }

  return (
    <div className="space-y-5">
      <section className="card space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["audience_id", "Audience level", audience],
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
            <div className="grid gap-3 sm:grid-cols-[170px_130px_130px]">
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
            </div>
            <div className="mt-3">
              <div className="label">Content for this day (pick the skills it needs)</div>
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => {
                  const on = d.skillIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => patch(d.key, { skillIds: on ? d.skillIds.filter((x) => x !== s.id) : [...d.skillIds, s.id] })}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${on ? "border-navy bg-navy text-white" : "border-line bg-surface hover:border-blue"}`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={addDay} className="btn-ghost">+ Add another day</button>
            {days.length > 1 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} /> Same trainer for all days
              </label>
            )}
          </div>
          <button className="btn" disabled={pending} onClick={search}>{pending ? "Checking…" : "Check available trainers"}</button>
        </div>
        {err && <p className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{err}</p>}
      </section>

      {res && res.same && res.asked.length > 1 && (
        <section className="space-y-3">
          <h2 className="h2">
            Available on all {res.asked.length} days <span className="text-sm font-normal text-muted">· {res.common.length} {res.common.length === 1 ? "trainer" : "trainers"}</span>
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {res.common.map((m) => <TrainerCard key={m.id} m={m} />)}
            {res.common.length === 0 && <p className="card text-muted md:col-span-2">No single trainer is free and matching on every day. Untick “Same trainer for all days” to see who&apos;s free each day.</p>}
          </div>
        </section>
      )}
      {res && !(res.same && res.asked.length > 1) &&
        res.asked.map((d, i) => (
          <section key={d.key} className="space-y-3">
            <h2 className="h2">
              Day {i + 1} · {dayLabel(d.date)} <span className="text-sm font-normal text-muted">· {res.days[i].length} available</span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {res.days[i].map((m) => <TrainerCard key={m.id} m={m} />)}
              {res.days[i].length === 0 && <p className="card text-muted md:col-span-2">No trainer is free and matching on this day. Try other skills or another date.</p>}
            </div>
          </section>
        ))}
    </div>
  );
}
