"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Dropzone } from "@/components/dropzone";
import { createProposalUpload, createRequest, requestTrainerOptions } from "@/app/(app)/bookings/actions";
import {
  dealTotal,
  dealValueError,
  fmtAmount,
  parseAmount,
  parseParticipants,
  PARTICIPANTS_TEMPLATE_CSV,
  PARTICIPANTS_TEMPLATE_NAME,
  PROPOSAL_ACCEPT,
  proposalFileError,
  type Participant,
  type ProposalFile,
} from "@/lib/deal";

type Opt = { id: string; name: string };
type Day = { key: number; date: string; start: string; end: string; location: string; trainerId: string };
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
export function RequestBuilder({ industries, today, trainerRequired }: { industries: Opt[]; today: string; trainerRequired: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ program_name: "", industry_id: "" });
  const [contact, setContact] = useState({ name: "", email: "", mobile: "" });
  // Step 2: the participant list read from the uploaded CSV
  const [people, setPeople] = useState<{ file: string; list: Participant[]; error: string } | null>(null);
  // Step 3: the proposal (already in storage once uploaded) and the deal value
  const [proposal, setProposal] = useState<ProposalFile | null>(null);
  const [proposalMsg, setProposalMsg] = useState<{ busy?: boolean; error?: string }>({});
  const [valuePerDay, setValuePerDay] = useState("");
  const [dealDays, setDealDays] = useState("");
  const perDay = parseAmount(valuePerDay);
  const nDays = Number(dealDays);
  const valueError = valuePerDay || dealDays ? dealValueError(perDay, nDays) : null;
  const [same, setSame] = useState(false);
  const [days, setDays] = useState<Day[]>([{ key: 1, date: "", start: "10:00", end: "15:00", location: "", trainerId: "" }]);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  // trainers free at each day's time who match the industry
  const [options, setOptions] = useState<{ query: string; days: TrainerOpt[][] | null; error: string }>({ query: "", days: null, error: "" });
  const patch = (key: number, p: Partial<Day>) => setDays((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));

  const ready = !!f.industry_id && days.every((d) => d.date && d.start && d.end);
  const query = ready ? JSON.stringify([f.industry_id, days.map((d) => [d.date, d.start, d.end])]) : "";
  useEffect(() => {
    if (!query) return;
    const t = setTimeout(async () => {
      const r = await requestTrainerOptions({ industry_id: f.industry_id, days: days.map((d, i) => ({ day_number: i + 1, date: d.date, start: d.start, end: d.end })) });
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
    setDays([...days, { ...last, key: last.key + 1, date: last.date ? addDays(last.date, 1) : "", trainerId: same ? last.trainerId : "" }]);
  }
  async function readParticipants(file: File | undefined) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setPeople({ file: file.name, list: [], error: "Upload the participants as a .csv file (use the template)." });
    } else if (file.size > 2 * 1024 * 1024) {
      setPeople({ file: file.name, list: [], error: "The participants file is too large (2 MB at most)." });
    } else {
      const { participants, error } = parseParticipants(await file.text());
      setPeople({ file: file.name, list: participants, error: error ?? "" });
    }
  }

  async function uploadProposal(file: File | undefined) {
    if (!file) return;
    const bad = proposalFileError(file.name, file.size);
    if (bad) return setProposalMsg({ error: bad });
    setProposalMsg({ busy: true });
    try {
      const u = await createProposalUpload(file.name, file.size);
      if ("error" in u && u.error) return setProposalMsg({ error: u.error });
      const { path, token } = u as { path: string; token: string };
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
      const { error } = await sb.storage.from("proposals").uploadToSignedUrl(path, token, file);
      if (error) return setProposalMsg({ error: `${file.name}: ${error.message}` });
      setProposal({ path, name: file.name, size: file.size });
      setProposalMsg({});
    } catch {
      setProposalMsg({ error: "That didn't go through. Check your connection and try again." });
    }
  }

  function submit() {
    setErr("");
    if (!people?.list.length) return setErr("Upload the participants file (step 2).");
    if (!proposal) return setErr("Upload the proposal (step 3).");
    start(async () => {
      const r = await createRequest({
        ...f,
        contact,
        participants: people.list,
        proposal,
        value_per_day: perDay,
        deal_days: nDays,
        same_trainer: same,
        days: days.map((d, i) => ({ day_number: i + 1, date: d.date, start: d.start, end: d.end, location: d.location, trainer_id: d.trainerId || undefined })),
      }).catch(() => ({ error: "That didn't go through. Check your connection and try again.", ids: undefined }));
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="program">Program name *</label>
            <input id="program" className="input" placeholder="e.g. Aman Holding HR" value={f.program_name} onChange={(e) => setF({ ...f, program_name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="industry_id">Industry *</label>
            <select id="industry_id" className="input" value={f.industry_id} onChange={(e) => setF({ ...f, industry_id: e.target.value })}>
              <option value="">Select…</option>
              {industries.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        </div>
        <fieldset>
          <legend className="label">Client point of contact * <span className="font-normal normal-case text-faint">(once for all days)</span></legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <input aria-label="Contact name" className="input" placeholder="Full name" autoComplete="off" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            <input aria-label="Contact email" type="email" className="input" placeholder="Email" autoComplete="off" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            <input aria-label="Contact phone number" type="tel" className="input" placeholder="Phone, e.g. +20 100 000 0000" autoComplete="off" value={contact.mobile} onChange={(e) => setContact({ ...contact, mobile: e.target.value })} />
          </div>
        </fieldset>
      </section>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="eyebrow">Step 2</div>
            <h2 className="h2">Audience</h2>
            <p className="text-sm text-muted">Download the template, add one participant per row (name, title, department), save it as CSV and upload it.</p>
          </div>
          <a
            className="btn-ghost"
            download={PARTICIPANTS_TEMPLATE_NAME}
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(PARTICIPANTS_TEMPLATE_CSV)}`}
          >
            ⬇ Download template
          </a>
        </div>
        <Dropzone
          title="Choose or drop the participants sheet"
          hint=".csv — first row is the headers (name, title, department)"
          accept=".csv,text/csv"
          file={people && !people.error ? `${people.file} · ${people.list.length} ${people.list.length === 1 ? "participant" : "participants"}` : null}
          onFile={readParticipants}
        />
        {people?.error && <p className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{people.file}: {people.error}</p>}
        {people && !people.error && people.list.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface2 text-left text-xs text-muted">
                  <th className="px-3 py-1.5">#</th>
                  <th className="px-3 py-1.5">Name</th>
                  <th className="px-3 py-1.5">Title</th>
                  <th className="px-3 py-1.5">Department</th>
                </tr>
              </thead>
              <tbody>
                {people.list.slice(0, 5).map((p, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-3 py-1.5 text-muted tabular-nums">{i + 1}</td>
                    <td className="px-3 py-1.5">{p.name}</td>
                    <td className="px-3 py-1.5">{p.title || "—"}</td>
                    <td className="px-3 py-1.5">{p.department || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {people.list.length > 5 && <p className="px-3 py-1.5 text-xs text-muted">…and {people.list.length - 5} more.</p>}
          </div>
        )}
      </section>

      <section className="card space-y-4">
        <div>
          <div className="eyebrow">Step 3</div>
          <h2 className="h2">Proposal &amp; value</h2>
          <p className="text-sm text-muted">Upload the proposal sent to the client (PDF, Word, PowerPoint or Excel), then the value per training day and how many days the deal covers.</p>
        </div>
        <Dropzone
          title="Choose or drop the proposal"
          hint=".pdf, .docx, .pptx or .xlsx — 50 MB at most"
          accept={PROPOSAL_ACCEPT}
          busy={proposalMsg.busy}
          file={proposal ? `${proposal.name} · ${(proposal.size / 1048576).toFixed(1)} MB` : null}
          onFile={uploadProposal}
        />
        {proposalMsg.error && <p className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{proposalMsg.error}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="value_per_day">Value per training day *</label>
            <input id="value_per_day" className="input tabular-nums" inputMode="decimal" placeholder="e.g. 100,000" value={valuePerDay} onChange={(e) => setValuePerDay(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="deal_days">Number of days *</label>
            <input id="deal_days" type="number" min={1} max={365} step={1} className="input tabular-nums" placeholder="e.g. 5" value={dealDays} onChange={(e) => setDealDays(e.target.value)} />
          </div>
          <div>
            <div className="label">Total deal value</div>
            <div className="rounded-xl bg-surface2 px-3 py-2 text-lg font-semibold tabular-nums">{valueError || !valuePerDay || !dealDays ? "—" : fmtAmount(dealTotal(perDay, nDays))}</div>
          </div>
        </div>
        {valueError && valuePerDay && dealDays && <p className="text-xs text-bad">{valueError}</p>}
        <p className="text-xs text-muted">Example: a 500,000 training over 5 days is 100,000 per day and 5 days.</p>
      </section>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="eyebrow">Step 4</div>
            <h2 className="h2">Training days</h2>
            <p className="text-sm text-muted">Add each day with its date, time and location{trainerRequired ? ", then choose the trainer" : ""}.</p>
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
            <div className="mt-3 max-w-md">
              <div>
                <label className="label" htmlFor={`t${d.key}`}>Trainer{trainerRequired ? " *" : ""}</label>
                {!ready ? (
                  <p className="text-xs text-muted">Pick the industry (step 1) and the date to see the available trainers.</p>
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
        <button className="btn" disabled={pending || proposalMsg.busy || (trainerRequired && days.some((d) => !d.trainerId))} onClick={submit}>
          {pending ? "Sending…" : days.length > 1 ? `Send deal · ${days.length} days` : "Send deal"}
        </button>
        <span className="text-xs text-muted">
          {trainerRequired ? "The trainer is emailed to confirm and the booking team is notified." : "Days with a trainer are emailed to the trainer; the rest go on the calendar as “Needs a trainer”."}
        </span>
      </div>
    </div>
  );
}
