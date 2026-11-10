"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Form, Submit } from "@/components/form";
import { editBooking, editTrainerOptions, type EditTrainerOption } from "@/app/(app)/bookings/actions";

type Booking = { id: string; program_name: string; day_number: number; date: string; start: string; end: string; location: string; content: string };

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// Edit one training day. Whenever the date or time is filled in, the trainers free at that moment are listed with
// their profile and their free slots that week, so the person editing can keep the trainer or pick another one.
// Saving runs the usual cycle: a new trainer (or a new date for a confirmed trainer) is asked to confirm, and everyone
// on the training is notified.
export function EditTrainingForm({
  b,
  current,
  trainerRequired,
  canViewProfiles,
}: {
  b: Booking;
  current: { id: string; name: string } | null;
  // Growth must keep a trainer on the day; Training Excellence may leave it to assign later
  trainerRequired: boolean;
  canViewProfiles: boolean;
}) {
  const router = useRouter();
  const [when, setWhen] = useState({ date: b.date, start: b.start, end: b.end });
  const [pick, setPick] = useState<string>(current ? "keep" : trainerRequired ? "" : "none");
  const [list, setList] = useState<{ key: string; trainers?: EditTrainerOption[]; currentFree?: boolean; error?: string } | null>(null);
  const key = `${when.date}|${when.start}|${when.end}`;
  const ready = !!when.date && !!when.start && !!when.end && when.end > when.start;

  useEffect(() => {
    if (!ready) return;
    let live = true;
    const t = setTimeout(() => {
      editTrainerOptions(b.id, when)
        .then((r) => {
          if (!live) return;
          if ("error" in r && r.error) setList({ key, error: r.error });
          else if ("trainers" in r && r.trainers) {
            const trainers = r.trainers;
            setList({ key, trainers, currentFree: r.currentFree });
            // a picked trainer who isn't free at the new time can't stay picked
            setPick((p) => (p === "keep" && !r.currentFree ? (trainerRequired ? "" : "none") : p !== "keep" && p !== "none" && p && !trainers.some((x) => x.id === p) ? "" : p));
          }
        })
        .catch(() => live && setList({ key, error: "Couldn't load the free trainers. Check your connection and try again." }));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [b.id, key, ready, trainerRequired]); // eslint-disable-line react-hooks/exhaustive-deps

  const loaded = list?.key === key ? list : null;
  const changedTime = when.date !== b.date || when.start !== b.start || when.end !== b.end;
  const others = loaded?.trainers?.filter((t) => !t.current) ?? [];
  const currentRow = loaded?.trainers?.find((t) => t.current) ?? null;

  async function save(fd: FormData) {
    const r = await editBooking(fd);
    if (r && !r.error) router.refresh();
    return r;
  }

  return (
    <Form action={save} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={b.id} />
      <input type="hidden" name="trainer_id" value={pick || "keep"} />
      <div className="grid grid-cols-[1fr_90px] gap-3 sm:col-span-2">
        <div><label className="label">Program</label><input name="program_name" defaultValue={b.program_name} className="input" /></div>
        <div><label className="label">Day #</label><input name="day_number" type="number" min={1} defaultValue={b.day_number} className="input" /></div>
      </div>
      <div><label className="label">Date</label><input name="date" type="date" value={when.date} onChange={(e) => setWhen({ ...when, date: e.target.value })} className="input" /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">From</label><input name="start" type="time" value={when.start} onChange={(e) => setWhen({ ...when, start: e.target.value })} className="input" /></div>
        <div><label className="label">To</label><input name="end" type="time" value={when.end} onChange={(e) => setWhen({ ...when, end: e.target.value })} className="input" /></div>
      </div>
      <div className="sm:col-span-2"><label className="label">Location</label><input name="location" defaultValue={b.location} className="input" /></div>

      <div className="space-y-2 sm:col-span-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label className="label mb-0">Trainer</label>
          <span className="text-xs text-muted">Free at {changedTime ? "the new" : "this"} date and time · profile and free slots that week</span>
        </div>
        {!ready ? (
          <p className="text-xs text-muted">Fill in the date and time to see the available trainers.</p>
        ) : !loaded ? (
          <p className="text-xs text-muted">Finding available trainers…</p>
        ) : loaded.error ? (
          <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">{loaded.error}</p>
        ) : (
          <div className="space-y-2">
            {current && (
              loaded.currentFree ? (
                currentRow ? (
                  <TrainerCard t={currentRow} label={`Keep ${current.name}`} checked={pick === "keep"} onPick={() => setPick("keep")} canViewProfiles={canViewProfiles} />
                ) : (
                  <Choice checked={pick === "keep"} onPick={() => setPick("keep")} title={`Keep ${current.name}`} hint="Still free at this date and time." />
                )
              ) : (
                <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn"><b>{current.name}</b> isn&apos;t free at this date and time. Choose another trainer{trainerRequired ? "" : " or leave the day to Training Excellence"}.</p>
              )
            )}
            {others.length > 0 && <div className="pt-1 text-xs font-semibold uppercase tracking-wider text-muted">{current ? "Or switch to" : "Choose a trainer"} ({others.length})</div>}
            <div className="grid gap-2 lg:grid-cols-2">
              {others.map((t) => (
                <TrainerCard key={t.id} t={t} checked={pick === t.id} onPick={() => setPick(t.id)} canViewProfiles={canViewProfiles} />
              ))}
            </div>
            {!others.length && !(current && loaded.currentFree) && (
              <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">No trainer is free at this date and time. Try another date or time{trainerRequired ? ", or contact Training Excellence" : ""}.</p>
            )}
            {!trainerRequired && <Choice checked={pick === "none"} onPick={() => setPick("none")} title="Leave to Training Excellence" hint="The day goes back to “Needs a trainer”." />}
          </div>
        )}
        {pick && pick !== "keep" && pick !== "none" && <p className="text-xs text-muted">On save, the new trainer is emailed to confirm{current ? ` and ${current.name} is told they're off this day` : ""}.</p>}
        {pick === "keep" && current && changedTime && <p className="text-xs text-muted">On save, {current.name} is emailed the new date and time and asked to confirm it.</p>}
      </div>

      <div className="sm:col-span-2"><label className="label">Content</label><textarea name="content" rows={4} defaultValue={b.content} className="input" /></div>
      <div><Submit>Save changes</Submit></div>
    </Form>
  );
}

function Choice({ checked, onPick, title, hint }: { checked: boolean; onPick: () => void; title: string; hint: string }) {
  return (
    <button type="button" onClick={onPick} aria-pressed={checked} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${checked ? "border-ds-primary bg-[#EFF5FF] ring-1 ring-ds-primary" : "border-line bg-white hover:border-ds-primary/50"}`}>
      <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${checked ? "border-ds-primary bg-ds-primary shadow-[inset_0_0_0_2px_white]" : "border-line"}`} />
      <span><span className="block text-sm font-semibold text-ds-heading">{title}</span><span className="block text-xs text-muted">{hint}</span></span>
    </button>
  );
}

function TrainerCard({ t, checked, onPick, canViewProfiles, label }: { t: EditTrainerOption; checked: boolean; onPick: () => void; canViewProfiles: boolean; label?: string }) {
  return (
    <div className={`rounded-xl border bg-white p-3 transition ${checked ? "border-ds-primary bg-[#EFF5FF] ring-1 ring-ds-primary" : "border-line hover:border-ds-primary/50"}`}>
      <button type="button" onClick={onPick} aria-pressed={checked} className="flex w-full items-start gap-3 text-left">
        <span className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${checked ? "border-ds-primary bg-ds-primary shadow-[inset_0_0_0_2px_white]" : "border-line"}`} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-ds-heading">{label ?? t.full_name}</span>
            {t.current && <span className="badge bg-ice text-royal-deep">Current trainer</span>}
            {t.tier && <span className="badge" style={{ background: `${t.tier.color}22`, color: t.tier.color }}>{t.tier.name}</span>}
          </span>
          {t.title && <span className="block truncate text-xs text-muted">{t.title}</span>}
          <span className="mt-1 block text-xs text-ds-text">
            Score <b className="tabular-nums">{Math.round(t.score)}</b> · {t.delivered} delivered{t.nps != null ? <> · NPS <b className="tabular-nums">{Math.round(t.nps)}</b></> : null}
          </span>
          {(t.industries.length > 0 || t.skills.length > 0) && <span className="mt-1 block truncate text-xs text-muted">{[...t.industries, ...t.skills].join(" · ")}</span>}
        </span>
      </button>
      <div className="mt-2 grid grid-cols-7 gap-1" aria-label={`Free slots the week of ${dayLabel(t.week[0].date)}`}>
        {t.week.map((d, i) => (
          <div key={d.date} className="text-center" title={`${dayLabel(d.date)}: ${d.morning ? "morning free" : "morning busy"}, ${d.evening ? "evening free" : "evening busy"}`}>
            <div className="text-[10px] leading-tight text-muted">{WEEKDAY[i]}<br />{dayLabel(d.date).split(" ")[0]}</div>
            <div className={`mt-0.5 h-1.5 rounded-full ${d.morning ? "bg-good" : "bg-surface2"}`} />
            <div className={`mt-0.5 h-1.5 rounded-full ${d.evening ? "bg-royal" : "bg-surface2"}`} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10.5px] text-muted"><span className="mr-1 inline-block h-1.5 w-3 rounded-full bg-good align-middle" />Morning <span className="ml-2 mr-1 inline-block h-1.5 w-3 rounded-full bg-royal align-middle" />Evening free</span>
        <span className="flex gap-1.5">
          {canViewProfiles && <a href={`/trainers/${t.id}`} target="_blank" rel="noopener" className="btn-ghost btn-sm">View profile</a>}
          <a href={`/trainers/${t.id}/bio`} className="btn-ghost btn-sm" title="Download this trainer's profile (PDF)">⬇ Profile</a>
        </span>
      </div>
    </div>
  );
}
