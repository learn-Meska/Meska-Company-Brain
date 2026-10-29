"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createRequest, requestTrainerOptions } from "@/app/(app)/bookings/actions";

type Opt = { id: string; name: string };
type Day = { key: number; date: string; start: string; end: string; location: string; content: string; trainerId: string };
type TrainerOpt = { id: string; full_name: string; title: string | null };

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

// trainerRequired: Growth must choose the trainer for every day; booking staff may leave it to assign later.
export function RequestBuilder({ audience, functions, industries, today, trainerRequired }: { audience: Opt[]; functions: Opt[]; industries: Opt[]; today: string; trainerRequired: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ program_name: "", audience_id: "", function_id: "", industry_id: "" });
  const [contact, setContact] = useState({ name: "", email: "", mobile: "" });
  const [same, setSame] = useState(false);
  const [days, setDays] = useState<Day[]>([{ key: 1, date: "", start: "10:00", end: "15:00", location: "", content: "", trainerId: "" }]);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  // trainers free at each day's time who match the audience, function and industry
  const [options, setOptions] = useState<{ query: string; days: TrainerOpt[][] | null; error: string }>({ query: "", days: null, error: "" });
  const patch = (key: number, p: Partial<Day>) => setDays((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));

  const ready = !!(f.audience_id && f.function_id && f.industry_id) && days.every((d) => d.date && d.start && d.end);
  const query = ready ? JSON.stringify([f.audience_id, f.function_id, f.industry_id, days.map((d) => [d.date, d.start, d.end])]) : "";
  useEffect(() => {
    if (!query) return;
    const t = setTimeout(async () => {
      const r = await requestTrainerOptions({ ...f, days: days.map((d, i) => ({ day_number: i + 1, date: d.date, start: d.start, end: d.end })) });
      setOptions({ query, days: "days" in r && r.days ? r.days : null, error: r.error ?? "" });
      // drop a pick that no longer fits
      if ("days" in r && r.days) setDays((ds) => ds.map((d, i) => (d.trainerId && !r.days![i]?.some((x) => x.id === d.trainerId) ? { ...d, trainerId: "" } : d)));
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `query` captures every input that matters
  }, [query]);
  const opts = options.query === query ? options.days : null;
  const common = opts && opts.length > 1 ? opts[0].filter((t) => opts.every((l) => l.some((x) => x.id === t.id))) : [];
  const sameId = same && days.length > 1 && days.every((d) => d.trainerId === days[0].trainerId) ? days[0].trainerId : "";

  function addDay() {
    const last = days[days.length - 1];
    setDays([...days, { ...last, key: last.key + 1, date: last.date ? addDays(last.date, 1) : "", content: "", trainerId: same ? last.trainerId : "" }]);
  }
  function submit() {
    setErr("");
    start(async () => {
      const r = await createRequest({
        ...f,
        contact,
        same_trainer: same,
        days: days.map((d, i) => ({ day_number: i + 1, date: d.date, start: d.start, end: d.end, location: d.location, content: d.content, trainer_id: d.trainerId || undefined })),
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
        <fieldset>
          <legend className="label">Client point of contact * <span className="font-normal normal-case text-faint">(once for all days)</span></legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <input aria-label="Contact name" className="input" placeholder="Full name" autoComplete="off" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            <input aria-label="Contact email" type="email" className="input" placeholder="Email" autoComplete="off" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            <input aria-label="Contact mobile" type="tel" className="input" placeholder="Mobile, e.g. +20 100 000 0000" autoComplete="off" value={contact.mobile} onChange={(e) => setContact({ ...contact, mobile: e.target.value })} />
          </div>
        </fieldset>
      </section>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="eyebrow">Step 2</div>
            <h2 className="h2">Training days</h2>
            <p className="text-sm text-muted">Add each day with its own content{trainerRequired ? ", then choose the trainer" : ""}.</p>
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
                <label className="label" htmlFor={`t${d.key}`}>Trainer{trainerRequired ? " *" : ""}</label>
                {!ready ? (
                  <p className="text-xs text-muted">Pick the audience, function, industry and the date to see the available trainers.</p>
                ) : !opts ? (
                  <p className="text-xs text-muted">{options.query === query && options.error ? options.error : "Finding available trainers…"}</p>
                ) : opts[i].length === 0 ? (
                  <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">No matching trainer is free at this time. Try another date or time{trainerRequired ? ", or contact the booking team" : ""}.</p>
                ) : (
                  <select
                    id={`t${d.key}`}
                    className="input"
                    value={d.trainerId}
                    disabled={!!sameId}
                    onChange={(e) => patch(d.key, { trainerId: e.target.value })}
                  >
                    <option value="">{trainerRequired ? "Choose a trainer…" : "Leave to the booking team"}</option>
                    {opts[i].map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.full_name}
                        {t.title ? ` — ${t.title}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="label" htmlFor={`c${d.key}`}>Content to be delivered on this day *</label>
                <textarea id={`c${d.key}`} className="input" rows={3} placeholder="Objectives, topics and client notes." value={d.content} onChange={(e) => patch(d.key, { content: e.target.value })} />
              </div>
            </div>
          </div>
        ))}
        {days.length > 1 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface2 px-3 py-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={same}
                onChange={(e) => {
                  setSame(e.target.checked);
                  if (!e.target.checked) setDays((ds) => ds.map((d) => ({ ...d, trainerId: "" })));
                }}
              />{" "}
              Same trainer for all days
            </label>
            {same &&
              (opts && common.length ? (
                <select
                  className="input w-auto py-1.5"
                  aria-label="Trainer for all days"
                  value={sameId}
                  onChange={(e) => setDays((ds) => ds.map((d) => ({ ...d, trainerId: e.target.value })))}
                >
                  <option value="">Choose a trainer free on all days…</option>
                  {common.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-muted">{opts ? "No trainer is free on all these days." : "Fill in the days to see who is free on all of them."}</span>
              ))}
          </div>
        )}
      </section>

      {err && <p className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{err}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending || (trainerRequired && days.some((d) => !d.trainerId))} onClick={submit}>
          {pending ? "Sending…" : days.length > 1 ? `Request ${days.length} days` : "Request training"}
        </button>
        <span className="text-xs text-muted">
          {trainerRequired ? "The trainer is emailed to confirm and the booking team is notified." : "Days with a trainer are emailed to the trainer; the rest go on the calendar as “Needs a trainer”."}
        </span>
      </div>
    </div>
  );
}
