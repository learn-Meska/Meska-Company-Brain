"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { checkB2CFile, importB2CFile, type B2CCheckResult } from "@/app/(app)/admin/b2c/actions";
import { B2C_STATUS } from "@/lib/b2c";
import { fmtTime } from "@/lib/format";

const day = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// Two steps: "Check file" reads the sheet and checks it against the template (nothing is saved),
// then "Upload" saves the sessions to the calendar.
export function B2CUploader() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<B2CCheckResult | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [step, setStep] = useState<"check" | "upload" | null>(null);

  const send = (action: typeof checkB2CFile, which: "check" | "upload") => {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    setStep(which);
    start(async () => {
      try {
        const r = await action(fd);
        if (which === "upload" && r.ok) {
          setDone(r.ok);
          setCheck(null);
          setFile(null);
          if (input.current) input.current.value = "";
          router.refresh();
        } else setCheck(r);
      } catch {
        setCheck({ error: "Something went wrong. Check your connection and try again." });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="b2c-file">B2C Sessions file (.xlsx)</label>
          <input
            ref={input}
            id="b2c-file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="input"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setCheck(null);
              setDone(null);
            }}
          />
        </div>
        <button type="button" className="btn-ghost" disabled={!file || busy} onClick={() => send(checkB2CFile, "check")}>
          {busy && step === "check" ? "Checking…" : "Check file"}
        </button>
        <button type="button" className="btn" disabled={!file || busy || !check?.valid} onClick={() => send(importB2CFile, "upload")} title={check?.valid ? undefined : "Check the file first"}>
          {busy && step === "upload" ? "Uploading…" : "Upload"}
        </button>
      </div>

      {done && <p className="rounded-xl bg-good-bg px-3 py-2 text-sm text-good">{done}</p>}
      {check?.error && <p className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{check.error}</p>}

      {check && !check.error && (
        <div className="space-y-4 rounded-xl border border-line p-4">
          {check.valid ? (
            <p className="rounded-xl bg-good-bg px-3 py-2 text-sm text-good">
              The file matches the B2C Sessions template. {check.total} session{check.total === 1 ? "" : "s"} ready: {check.fresh} new, {check.updated} already uploaded (they&apos;ll be updated). Press Upload to add them to the calendar.
            </p>
          ) : (
            <div className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">
              <p className="font-semibold">Fix {check.errors!.length === 1 ? "this problem" : `these ${check.errors!.length} problems`} in the file, then check it again. Nothing was saved.</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {check.errors!.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {!!check.total && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(check.byStatus ?? {}).map(([s, n]) => (
                  <span key={s} className="badge bg-ice text-ink">{s}: {n}</span>
                ))}
                <span className="badge bg-good-bg text-good">Delivered: {check.delivered}</span>
              </div>
              {!!check.unmatched?.length && (
                <p className="text-sm text-muted">
                  No trainer profile for: <b>{check.unmatched.join(", ")}</b>. Their sessions keep the name from the sheet but aren&apos;t linked to a profile or the trainer&apos;s own calendar.
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Program</th>
                      <th>Cohort</th>
                      <th className="text-right">Sessions</th>
                      <th>From</th>
                      <th>To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {check.cohorts!.map((c) => (
                      <tr key={c.program + c.cohort}>
                        <td className="font-medium">{c.program}</td>
                        <td>{c.cohort}</td>
                        <td className="text-right tabular-nums">{c.sessions}</td>
                        <td className="whitespace-nowrap">{day(c.first)}</td>
                        <td className="whitespace-nowrap">{day(c.last)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-medium text-ink">First sessions by date</summary>
                <ul className="mt-2 space-y-1 text-sm">
                  {check.preview!.map((r) => (
                    <li key={r.program + r.cohort + r.day_number}>
                      {day(r.date)}, {fmtTime(r.start_time)} - {fmtTime(r.end_time)}: <b>{r.program}</b> {r.cohort}, {r.session} · {r.trainer_name ?? "no trainer"} · {B2C_STATUS[r.status]}
                      {r.delivered ? " · delivered" : ""}
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </div>
      )}
    </div>
  );
}
