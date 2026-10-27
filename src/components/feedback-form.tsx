"use client";

import { useState, useTransition } from "react";
import { submitParticipantFeedback } from "@/app/f/[token]/actions";
import { REASON_QUESTION, RECOMMEND_QUESTION, YES_NO_QUESTIONS, type YesNoKey } from "@/lib/survey";

function Recommend({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink">1. {RECOMMEND_QUESTION}</legend>
      <div className="grid grid-cols-11 gap-1" role="radiogroup" aria-label={RECOMMEND_QUESTION}>
        {Array.from({ length: 11 }, (_, n) => (
          <label
            key={n}
            className={`grid h-11 cursor-pointer place-items-center rounded-lg border text-sm font-semibold transition ${value === n ? "border-blue bg-blue text-white" : "border-line bg-surface text-muted hover:border-blue"}`}
          >
            <input type="radio" name="recommend" value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" />
            {n}
          </label>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-faint">
        <span>Not at all likely</span>
        <span>Extremely likely</span>
      </div>
    </fieldset>
  );
}

function YesNo({ n, name, label, value, onChange }: { n: number; name: string; label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink">
        {n}. {label}
      </legend>
      <div className="flex gap-2" role="radiogroup" aria-label={label}>
        {([["yes", true], ["no", false]] as const).map(([v, b]) => (
          <label
            key={v}
            className={`grid h-11 w-24 cursor-pointer place-items-center rounded-xl border text-sm font-semibold transition ${value === b ? "border-blue bg-blue text-white" : "border-line bg-surface text-muted hover:border-blue"}`}
          >
            <input type="radio" name={name} value={v} checked={value === b} onChange={() => onChange(b)} className="sr-only" />
            {b ? "Yes" : "No"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FeedbackForm({ token }: { token: string }) {
  const [recommend, setRecommend] = useState<number | null>(null);
  const [yes, setYes] = useState<Partial<Record<YesNoKey, boolean>>>({});
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg?.ok) return <p className="rounded-xl bg-good-bg px-4 py-6 text-center text-base font-medium text-good">{msg.ok}</p>;
  const complete = recommend != null && YES_NO_QUESTIONS.every((q) => yes[q.key] != null);
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => setMsg(await submitParticipantFeedback(token, fd)));
      }}
    >
      <Recommend value={recommend} onChange={setRecommend} />
      <div>
        <label htmlFor="reason" className="mb-1 block text-sm font-semibold text-ink">
          2. {REASON_QUESTION} <span className="font-normal text-faint">(optional)</span>
        </label>
        <textarea id="reason" name="reason" rows={3} className="input" />
      </div>
      {YES_NO_QUESTIONS.map((q, i) => (
        <YesNo key={q.key} n={i + 3} name={q.key} label={q.label} value={yes[q.key] ?? null} onChange={(v) => setYes((s) => ({ ...s, [q.key]: v }))} />
      ))}
      {msg?.error && <p className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{msg.error}</p>}
      <button className="btn w-full py-3 text-base" disabled={pending || !complete}>
        {pending ? "Sending…" : "Send feedback"}
      </button>
      <p className="text-center text-xs text-faint">Your feedback is anonymous.</p>
    </form>
  );
}
