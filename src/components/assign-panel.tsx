"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { assignTrainer, requestCandidates } from "@/app/(app)/bookings/actions";

type Cand = { id: string; full_name: string; total: number; tier: { name: string; color: string } | null; feedback: number | null; delivered: number };
type Day = { id: string; day_number: number; date: string; start: string; end: string; matches: Cand[] };

const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const t12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

function Row({ c, checked, onPick, name }: { c: Cand; checked: boolean; onPick: () => void; name: string }) {
  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${checked ? "border-blue bg-[#F3F7FF] ring-2 ring-blue/20" : "border-line hover:border-blue"}`}>
      <input type="radio" name={name} checked={checked} onChange={onPick} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <b>{c.full_name}</b>
          {c.tier && <span className="badge text-white" style={{ background: c.tier.color }}>{c.tier.name}</span>}
        </div>
        <div className="text-xs text-muted">
          Score <b className="text-ink">{c.total}</b> · Feedback <b className="text-ink">{c.feedback?.toFixed(2) ?? "—"}</b>/5 · <b className="text-ink">{c.delivered}</b> delivered
        </div>
      </div>
      <Link href={`/trainers/${c.id}`} target="_blank" className="text-xs text-blue hover:underline" onClick={(e) => e.stopPropagation()}>
        Profile ↗
      </Link>
    </label>
  );
}

export function AssignPanel({ bookingId, samePref }: { bookingId: string; samePref: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<{ days: Day[]; common: Cand[] } | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [all, setAll] = useState("");
  const [pick, setPick] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  // `version` re-runs the search after an assignment, so days already handled drop out of the list.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    requestCandidates(bookingId)
      .then((r) => {
        if (!live) return;
        if ("error" in r && r.error) setErr(r.error);
        else setData(r as { days: Day[]; common: Cand[] });
      })
      .catch(() => live && setErr("Couldn't load the free trainers. Refresh the page to try again."));
    return () => {
      live = false;
    };
  }, [bookingId, version]);

  function go(assignments: { bookingId: string; trainerId: string }[]) {
    setMsg(null);
    start(async () => {
      const r = await assignTrainer(assignments).catch(() => ({ error: "That didn't go through. Check your connection and try again." }));
      setMsg(r);
      if (!r.error) {
        setPick({});
        setAll("");
        setVersion((v) => v + 1);
        router.refresh();
      }
    });
  }

  if (err) return <p className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{err}</p>;
  if (!data) return <p className="text-sm text-muted">Finding free trainers that match…</p>;
  const multi = data.days.length > 1;
  const picked = data.days.filter((d) => pick[d.id]).map((d) => ({ bookingId: d.id, trainerId: pick[d.id] }));

  return (
    <div className="space-y-5">
      {samePref && multi && <p className="callout text-sm">Growth would prefer <b>the same trainer for all days</b> (not required).</p>}
      {multi && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Free on all {data.days.length} days</h3>
          {data.common.length ? (
            <div className="space-y-2">
              {data.common.map((c) => (
                <Row key={c.id} c={c} name="all" checked={all === c.id} onPick={() => setAll(c.id)} />
              ))}
              <button className="btn" disabled={!all || pending} onClick={() => go(data.days.map((d) => ({ bookingId: d.id, trainerId: all })))}>
                {pending ? "Assigning…" : `Assign to all ${data.days.length} days`}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted">No single trainer is free and matching on every day. Assign each day below.</p>
          )}
        </div>
      )}
      <div className="space-y-4">
        {multi && <h3 className="text-sm font-semibold">Or assign day by day</h3>}
        {data.days.map((d) => (
          <div key={d.id} className="rounded-2xl border border-line p-3">
            <div className="mb-2 text-sm">
              <b>Day {d.day_number}</b> · {fmt(d.date)} · {t12(d.start)} – {t12(d.end)}
            </div>
            {d.matches.length ? (
              <div className="grid gap-2 md:grid-cols-2">
                {d.matches.map((c) => (
                  <Row key={c.id} c={c} name={`d-${d.id}`} checked={pick[d.id] === c.id} onPick={() => setPick({ ...pick, [d.id]: c.id })} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No trainer is free and matching on this day. Check availability or the request&apos;s filters.</p>
            )}
          </div>
        ))}
        <button className={multi ? "btn-ghost" : "btn"} disabled={!picked.length || pending} onClick={() => go(picked)}>
          {pending ? "Assigning…" : multi ? `Assign selected day${picked.length === 1 ? "" : "s"} (${picked.length})` : "Assign trainer"}
        </button>
      </div>
      {msg?.error && <p className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{msg.error}</p>}
      {msg?.ok && <p className="rounded-xl bg-good-bg px-3 py-2 text-sm text-good">{msg.ok}</p>}
    </div>
  );
}
