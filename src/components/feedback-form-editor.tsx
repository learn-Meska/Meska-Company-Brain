"use client";

import { useState, useTransition } from "react";
import { resetFeedbackForm, saveFeedbackForm, setFeedbackAlwaysOpen } from "@/app/(app)/admin/feedback-form/actions";
import { QuestionField } from "@/components/feedback-form";
import { PlusIcon, TrashIcon } from "@/components/icons";
import { MAX_QUESTIONS, QTYPE_LABEL, type Question, type QType } from "@/lib/feedback-form";

type Msg = { error?: string; ok?: string } | null;
const OFFLINE = { error: "That didn't go through. Check your connection and try again." };
const ADDABLE: QType[] = ["yes_no", "rating", "choice", "text"];
const newId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function Note({ m }: { m: Msg }) {
  if (!m?.error && !m?.ok) return null;
  return <p className={`rounded-xl px-4 py-3 text-sm ${m.error ? "bg-bad-bg text-bad" : "bg-good-bg text-good"}`}>{m.error ?? m.ok}</p>;
}

// The QR code timing switch.
export function AlwaysOpenSwitch({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const flip = () =>
    start(async () => {
      const next = !on;
      const r = await setFeedbackAlwaysOpen(next).catch(() => OFFLINE);
      setM(r);
      if (!r.error) setOn(next);
    });
  return (
    <section className="ds-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-base font-semibold text-ds-heading">QR code works any time</h2>
          <p className="text-sm text-ds-text">
            {on
              ? "On: participants can open the form at any time, for any training day that isn't cancelled. Good for testing."
              : "Off: the form opens when the training day starts and closes 6 hours after it ends."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="QR code works any time"
          disabled={pending}
          onClick={flip}
          className={`relative h-8 w-14 flex-none rounded-full transition ${on ? "bg-ds-primary" : "bg-ds-subtle ring-1 ring-ds-border"} disabled:opacity-60`}
        >
          <span className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition ${on ? "translate-x-6" : ""}`} />
        </button>
      </div>
      {m && <div className="mt-3"><Note m={m} /></div>}
    </section>
  );
}

// Edit the participant form: questions on the left, a live preview of what participants see on the right.
export function FeedbackFormEditor({ initial }: { initial: Question[] }) {
  const [questions, setQuestions] = useState<Question[]>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(questions) !== saved;

  const update = (id: string, patch: Partial<Question>) => setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) =>
    setQuestions((qs) => {
      const j = i + d;
      if (j < 1 || j >= qs.length) return qs; // the recommend question stays first
      const next = [...qs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const add = (type: QType) =>
    setQuestions((qs) => [...qs, { id: newId(), type, label: "", required: type !== "text", ...(type === "choice" ? { options: ["", ""] } : {}) }]);

  const save = () =>
    start(async () => {
      const r = await saveFeedbackForm({ questions }).catch(() => OFFLINE);
      setM(r);
      if ("form" in r && r.form) {
        setQuestions(r.form.questions);
        setSaved(JSON.stringify(r.form.questions));
      }
    });
  const reset = () =>
    confirm("Go back to the original form? Your questions here will be replaced.") &&
    start(async () => {
      const r = await resetFeedbackForm().catch(() => OFFLINE);
      setM(r);
      if ("form" in r && r.form) {
        setQuestions(r.form.questions);
        setSaved(JSON.stringify(r.form.questions));
      }
    });

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
      <section className="space-y-3">
        {questions.map((q, i) => (
          <div key={q.id} className="ds-card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ds-primary text-xs font-semibold text-white">{i + 1}</span>
              {q.type === "nps" ? (
                <span className="ds-chip">{QTYPE_LABEL.nps} · always first</span>
              ) : (
                <select value={q.type} onChange={(e) => update(q.id, { type: e.target.value as QType, ...(e.target.value === "choice" && !q.options ? { options: ["", ""] } : {}) })} className="input w-auto py-1.5 text-sm" aria-label="Question type">
                  {ADDABLE.map((t) => (
                    <option key={t} value={t}>{QTYPE_LABEL[t]}</option>
                  ))}
                </select>
              )}
              <div className="ml-auto flex items-center gap-1">
                {q.type !== "nps" && (
                  <label className="mr-2 flex items-center gap-1.5 text-xs text-ds-text">
                    <input type="checkbox" checked={q.required} onChange={(e) => update(q.id, { required: e.target.checked })} /> Required
                  </label>
                )}
                <button type="button" disabled={i <= 1} onClick={() => move(i, -1)} className="grid h-8 w-8 place-items-center rounded-lg text-ds-text hover:bg-ds-subtle disabled:opacity-30" aria-label="Move up">↑</button>
                <button type="button" disabled={i === 0 || i === questions.length - 1} onClick={() => move(i, 1)} className="grid h-8 w-8 place-items-center rounded-lg text-ds-text hover:bg-ds-subtle disabled:opacity-30" aria-label="Move down">↓</button>
                {q.type !== "nps" && (
                  <button type="button" onClick={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))} className="grid h-8 w-8 place-items-center rounded-lg text-ds-text hover:bg-bad-bg hover:text-bad" aria-label="Delete question">
                    <TrashIcon size={16} />
                  </button>
                )}
              </div>
            </div>
            <input value={q.label} onChange={(e) => update(q.id, { label: e.target.value })} maxLength={300} placeholder="Write the question" className="input" aria-label={`Question ${i + 1}`} />
            {q.type === "nps" && <p className="mt-1.5 text-xs text-ds-text">Trainer scores and tiers come from this question, so it can be reworded but not removed.</p>}
            {q.type === "choice" && (
              <div className="mt-3 space-y-2">
                {(q.options ?? []).map((o, k) => (
                  <div key={k} className="flex gap-2">
                    <input
                      value={o}
                      maxLength={120}
                      onChange={(e) => update(q.id, { options: (q.options ?? []).map((x, n) => (n === k ? e.target.value : x)) })}
                      placeholder={`Choice ${k + 1}`}
                      className="input py-1.5 text-sm"
                    />
                    <button type="button" disabled={(q.options ?? []).length <= 2} onClick={() => update(q.id, { options: (q.options ?? []).filter((_, n) => n !== k) })} className="btn-quiet btn-sm disabled:opacity-30">
                      Remove
                    </button>
                  </div>
                ))}
                {(q.options ?? []).length < 10 && (
                  <button type="button" onClick={() => update(q.id, { options: [...(q.options ?? []), ""] })} className="text-sm font-medium text-ds-primary hover:underline">
                    + Add choice
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {questions.length < MAX_QUESTIONS && (
          <div className="ds-card flex flex-wrap items-center gap-2 border-dashed p-4">
            <span className="mr-1 text-sm font-medium text-ds-heading">Add a question:</span>
            {ADDABLE.map((t) => (
              <button key={t} type="button" onClick={() => add(t)} className="inline-flex items-center gap-1 rounded-full border border-ds-border px-3 py-1.5 text-sm text-ds-heading hover:border-ds-primary/50">
                <PlusIcon size={14} /> {QTYPE_LABEL[t]}
              </button>
            ))}
          </div>
        )}

        <div className="sticky bottom-0 z-10 -mx-1 space-y-3 rounded-2xl border border-ds-border bg-white/95 p-4 backdrop-blur">
          <Note m={m} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={reset} disabled={pending} className="btn-quiet btn-sm">Reset to the original form</button>
            <div className="flex items-center gap-3">
              {dirty && <span className="text-xs font-medium text-warn">Unsaved changes</span>}
              <button type="button" onClick={save} disabled={pending || !dirty} className="ds-btn ds-btn-primary">
                {pending ? "Saving…" : "Save & publish"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside className="xl:sticky xl:top-20">
        <div className="ds-card overflow-hidden">
          <div className="border-b border-ds-border bg-ds-subtle/60 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-ds-text">Preview: what participants see</div>
          <div className="max-h-[75vh] space-y-6 overflow-y-auto p-5">
            <h3 className="text-lg font-semibold text-ds-heading">How was today&apos;s session?</h3>
            {questions.map((q, i) =>
              q.label.trim() ? (
                <QuestionField key={q.id} q={{ ...q, options: (q.options ?? []).filter((o) => o.trim()) }} n={i + 1} value={preview[q.id] ?? ""} onChange={(v) => setPreview((p) => ({ ...p, [q.id]: v }))} />
              ) : (
                <p key={q.id} className="text-sm italic text-ds-text">{i + 1}. (write the question)</p>
              ),
            )}
            <button type="button" disabled className="btn w-full py-3 text-base opacity-60">Send feedback</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
