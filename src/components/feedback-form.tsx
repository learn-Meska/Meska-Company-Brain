"use client";

import { useState, useTransition } from "react";
import { submitParticipantFeedback } from "@/app/f/[token]/actions";
import type { Question } from "@/lib/feedback-form";

const pill = (on: boolean) => `grid cursor-pointer place-items-center rounded-xl border text-sm font-semibold transition ${on ? "border-blue bg-blue text-white" : "border-line bg-surface text-muted hover:border-blue"}`;

// One question of the live form. `preview` renders it without sending anything (used by the form editor).
export function QuestionField({ q, n, value, onChange }: { q: Question; n: number; value: string; onChange: (v: string) => void }) {
  const name = `q_${q.id}`;
  const legend = (
    <legend className="mb-2 text-sm font-semibold text-ink">
      {n}. {q.label} {q.required ? <span className="text-bad">*</span> : <span className="font-normal text-faint">(optional)</span>}
    </legend>
  );
  if (q.type === "nps")
    return (
      <fieldset>
        {legend}
        <div className="grid grid-cols-11 gap-1" role="radiogroup" aria-label={q.label}>
          {Array.from({ length: 11 }, (_, i) => (
            <label key={i} className={`h-11 rounded-lg ${pill(value === String(i))}`}>
              <input type="radio" name={name} value={i} checked={value === String(i)} onChange={() => onChange(String(i))} className="sr-only" />
              {i}
            </label>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-faint">
          <span>Not at all likely</span>
          <span>Extremely likely</span>
        </div>
      </fieldset>
    );
  if (q.type === "yes_no")
    return (
      <fieldset>
        {legend}
        <div className="flex gap-2" role="radiogroup" aria-label={q.label}>
          {(["yes", "no"] as const).map((v) => (
            <label key={v} className={`h-11 w-24 ${pill(value === v)}`}>
              <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
              {v === "yes" ? "Yes" : "No"}
            </label>
          ))}
        </div>
      </fieldset>
    );
  if (q.type === "rating")
    return (
      <fieldset>
        {legend}
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={q.label}>
          {[1, 2, 3, 4, 5].map((i) => (
            <label key={i} className={`h-11 ${pill(value === String(i))}`}>
              <input type="radio" name={name} value={i} checked={value === String(i)} onChange={() => onChange(String(i))} className="sr-only" />
              {i}
            </label>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-faint">
          <span>Poor</span>
          <span>Excellent</span>
        </div>
      </fieldset>
    );
  if (q.type === "choice")
    return (
      <fieldset>
        {legend}
        <div className="space-y-1.5" role="radiogroup" aria-label={q.label}>
          {(q.options ?? []).map((o) => (
            <label key={o} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${value === o ? "border-blue bg-ice font-semibold text-ink" : "border-line bg-surface text-ink hover:border-blue"}`}>
              <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} className="accent-[#2563EB]" />
              {o}
            </label>
          ))}
        </div>
      </fieldset>
    );
  return (
    <fieldset>
      {legend}
      <textarea name={name} rows={3} maxLength={2000} value={value} onChange={(e) => onChange(e.target.value)} className="input" aria-label={q.label} />
    </fieldset>
  );
}

export function FeedbackForm({ token, questions }: { token: string; questions: Question[] }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg?.ok) return <p className="rounded-xl bg-good-bg px-4 py-6 text-center text-base font-medium text-good">{msg.ok}</p>;
  const complete = questions.every((q) => !q.required || (values[q.id] ?? "").trim() !== "");
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => setMsg(await submitParticipantFeedback(token, fd)));
      }}
    >
      {questions.map((q, i) => (
        <QuestionField key={q.id} q={q} n={i + 1} value={values[q.id] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [q.id]: v }))} />
      ))}
      {msg?.error && <p className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{msg.error}</p>}
      <button className="btn w-full py-3 text-base" disabled={pending || !complete}>
        {pending ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
