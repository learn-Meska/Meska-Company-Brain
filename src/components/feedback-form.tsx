"use client";

import { useState, useTransition, type ReactNode } from "react";
import { submitParticipantFeedback } from "@/app/f/[token]/actions";
import { CheckIcon } from "@/components/icons";
import type { Question } from "@/lib/feedback-form";

// Selected: Meska blue. Idle: white with a light border that turns blue on hover.
const option = (on: boolean) =>
  `grid cursor-pointer select-none place-items-center rounded-xl border text-sm font-semibold transition focus-within:ring-2 focus-within:ring-ds-primary/30 ${
    on ? "border-ds-primary bg-ds-primary text-white shadow-[0_4px_14px_rgba(36,87,214,0.28)]" : "border-ds-border bg-ds-surface text-ds-heading hover:border-ds-primary/60 hover:bg-ds-primary-soft"
  }`;

function Shell({ n, label, required, answered, children }: { n: number; label: string; required: boolean; answered: boolean; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-ds-border bg-ds-surface p-5 sm:p-6">
      <legend className="sr-only">{label}</legend>
      <div className="mb-4 flex items-start gap-3">
        <span className={`grid h-7 w-7 flex-none place-items-center rounded-full text-xs font-semibold transition ${answered ? "bg-ds-primary text-white" : "bg-ds-primary-soft text-ds-primary"}`}>
          {answered ? <CheckIcon size={14} /> : n}
        </span>
        <p className="pt-0.5 text-[15px] font-medium leading-snug text-ds-heading">
          {label}
          {required ? <span className="ml-1 text-ds-primary">*</span> : <span className="ml-1.5 text-xs font-normal text-ds-text">Optional</span>}
        </p>
      </div>
      {children}
    </fieldset>
  );
}

// One question of the live form; the form editor uses it for its preview too.
export function QuestionField({ q, n, value, onChange }: { q: Question; n: number; value: string; onChange: (v: string) => void }) {
  const name = `q_${q.id}`;
  const answered = value.trim() !== "";
  const radio = (v: string) => <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />;

  let body: ReactNode;
  if (q.type === "nps") {
    body = (
      <>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11" role="radiogroup" aria-label={q.label}>
          {Array.from({ length: 11 }, (_, i) => (
            <label key={i} className={`h-11 ${option(value === String(i))}`}>
              {radio(String(i))}
              {i}
            </label>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-ds-text">
          <span>0 · Not likely</span>
          <span>10 · Very likely</span>
        </div>
      </>
    );
  } else if (q.type === "yes_no") {
    body = (
      <div className="grid grid-cols-2 gap-2 sm:max-w-xs" role="radiogroup" aria-label={q.label}>
        {(["yes", "no"] as const).map((v) => (
          <label key={v} className={`h-12 ${option(value === v)}`}>
            {radio(v)}
            {v === "yes" ? "Yes" : "No"}
          </label>
        ))}
      </div>
    );
  } else if (q.type === "rating") {
    body = (
      <>
        <div className="grid grid-cols-5 gap-1.5 sm:max-w-sm" role="radiogroup" aria-label={q.label}>
          {[1, 2, 3, 4, 5].map((i) => (
            <label key={i} className={`h-12 ${option(value === String(i))}`}>
              {radio(String(i))}
              {i}
            </label>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-ds-text sm:max-w-sm">
          <span>Poor</span>
          <span>Excellent</span>
        </div>
      </>
    );
  } else if (q.type === "choice") {
    body = (
      <div className="space-y-2" role="radiogroup" aria-label={q.label}>
        {(q.options ?? []).map((o) => {
          const on = value === o;
          return (
            <label key={o} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${on ? "border-ds-primary bg-ds-primary-soft font-medium text-ds-heading" : "border-ds-border text-ds-heading hover:border-ds-primary/60"}`}>
              {radio(o)}
              <span className={`grid h-5 w-5 flex-none place-items-center rounded-full border-2 ${on ? "border-ds-primary" : "border-ds-border"}`}>{on && <span className="h-2.5 w-2.5 rounded-full bg-ds-primary" />}</span>
              {o}
            </label>
          );
        })}
      </div>
    );
  } else {
    body = (
      <textarea
        name={name}
        rows={3}
        maxLength={2000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={q.label}
        placeholder="Type your answer…"
        className="w-full resize-y rounded-xl border border-ds-border bg-ds-surface px-4 py-3 text-sm text-ds-heading outline-none transition placeholder:text-ds-text/60 focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/20"
      />
    );
  }
  return (
    <Shell n={n} label={q.label} required={q.required} answered={answered}>
      {body}
    </Shell>
  );
}

export function FeedbackForm({ token, questions }: { token: string; questions: Question[] }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();

  if (msg?.ok)
    return (
      <div className="rounded-2xl border border-ds-border bg-ds-surface px-6 py-12 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-good-bg text-good">
          <CheckIcon size={28} />
        </span>
        <h2 className="mt-4 text-xl font-semibold text-ds-heading">Thank you!</h2>
        <p className="mt-1 text-sm text-ds-text">Your feedback was sent. It helps us make every training better.</p>
      </div>
    );

  const required = questions.filter((q) => q.required);
  const done = questions.filter((q) => (values[q.id] ?? "").trim() !== "").length;
  const complete = required.every((q) => (values[q.id] ?? "").trim() !== "");
  const progress = Math.round((done / Math.max(1, questions.length)) * 100);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => setMsg(await submitParticipantFeedback(token, fd)));
      }}
    >
      {questions.map((q, i) => (
        <QuestionField key={q.id} q={q} n={i + 1} value={values[q.id] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [q.id]: v }))} />
      ))}

      <div className="sticky bottom-0 -mx-4 border-t border-ds-border bg-ds-canvas/95 px-4 pb-4 pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 rounded-full bg-ds-subtle">
            <div className="h-1.5 rounded-full bg-ds-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs tabular-nums text-ds-text">
            {done} of {questions.length} answered
          </span>
        </div>
        {msg?.error && <p className="mb-3 rounded-xl bg-bad-bg px-4 py-2.5 text-sm text-bad">{msg.error}</p>}
        <button className="ds-btn ds-btn-primary h-12 w-full text-base" disabled={pending || !complete}>
          {pending ? "Sending…" : complete ? "Send feedback" : `Answer the ${required.length === 1 ? "question" : "questions"} marked *`}
        </button>
      </div>
    </form>
  );
}
