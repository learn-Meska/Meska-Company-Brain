"use client";

import { useState, useTransition, type ReactNode } from "react";
import { resetFeedbackForm, saveFeedbackForm, setFeedbackAlwaysOpen } from "@/app/(app)/admin/feedback-form/actions";
import { QuestionField } from "@/components/feedback-form";
import { AwardIcon, CheckIcon, LayersIcon, PenIcon, PlusIcon, TrashIcon, TrendIcon } from "@/components/icons";
import { MAX_QUESTIONS, QTYPE_LABEL, type Question, type QType } from "@/lib/feedback-form";

type Msg = { error?: string; ok?: string } | null;
const OFFLINE = { error: "That didn't go through. Check your connection and try again." };
const ADDABLE: QType[] = ["yes_no", "rating", "choice", "text"];
const newId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const TYPE_META: Record<QType, { icon: ReactNode; hint: string }> = {
  nps: { icon: <TrendIcon size={16} />, hint: "0–10, drives the trainer's score" },
  yes_no: { icon: <CheckIcon size={16} />, hint: "A simple Yes or No" },
  rating: { icon: <AwardIcon size={16} />, hint: "Score from 1 to 5" },
  choice: { icon: <LayersIcon size={16} />, hint: "Pick one of your options" },
  text: { icon: <PenIcon size={16} />, hint: "A written answer" },
};

function Note({ m }: { m: Msg }) {
  if (!m?.error && !m?.ok) return null;
  return <p className={`rounded-xl px-4 py-2.5 text-sm ${m.error ? "bg-bad-bg text-bad" : "bg-good-bg text-good"}`}>{m.error ?? m.ok}</p>;
}

function Switch({ on, disabled, onClick, label }: { on: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-7 w-12 flex-none rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary/30 disabled:opacity-60 ${on ? "bg-ds-primary" : "bg-[#D5DAE3]"}`}
    >
      <span className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition ${on ? "translate-x-5" : ""}`} />
    </button>
  );
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
    <section className="ds-card flex flex-wrap items-center gap-4 p-5">
      <span className={on ? "ds-icon-solid" : "ds-icon-soft"}>
        <TrendIcon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-ds-heading">QR code works any time</h2>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-ds-primary-soft text-ds-primary" : "bg-ds-subtle text-ds-text"}`}>{on ? "On" : "Off"}</span>
        </div>
        <p className="text-sm text-ds-text">
          {on ? "Participants can open the form at any time, once the trainer has confirmed the training day." : "The form opens when the training day starts and closes 6 hours after it ends."}
        </p>
        {m && <div className="mt-2"><Note m={m} /></div>}
      </div>
      <Switch on={on} disabled={pending} onClick={flip} label="QR code works any time" />
    </section>
  );
}

// Build the participant form: compact question cards that open to edit, and a live phone preview.
export function FeedbackFormEditor({ initial }: { initial: Question[] }) {
  const [questions, setQuestions] = useState<Question[]>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [open, setOpen] = useState<string | null>(null);
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(questions) !== saved;

  const update = (id: string, patch: Partial<Question>) => setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) =>
    setQuestions((qs) => {
      const j = i + d;
      if (i === 0 || j < 1 || j >= qs.length) return qs; // the recommend question stays first
      const next = [...qs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const add = (type: QType) => {
    const id = newId();
    setQuestions((qs) => [...qs, { id, type, label: "", required: type !== "text", ...(type === "choice" ? { options: ["", ""] } : {}) }]);
    setOpen(id);
  };
  const apply = (r: Msg & { form?: { questions: Question[] } }) => {
    setM(r);
    if (r.form) {
      setQuestions(r.form.questions);
      setSaved(JSON.stringify(r.form.questions));
      setOpen(null);
    }
  };
  const save = () => start(async () => apply(await saveFeedbackForm({ questions }).catch(() => OFFLINE)));
  const reset = () => confirm("Go back to the original form? The questions here will be replaced.") && start(async () => apply(await resetFeedbackForm().catch(() => OFFLINE)));

  const requiredCount = questions.filter((q) => q.required).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-ds-heading">Questions</h2>
            <p className="text-sm text-ds-text">
              {questions.length} {questions.length === 1 ? "question" : "questions"} · {requiredCount} required. Click a question to edit it.
            </p>
          </div>
        </div>

        <ol className="space-y-2.5">
          {questions.map((q, i) => {
            const isOpen = open === q.id;
            const meta = TYPE_META[q.type];
            return (
              <li key={q.id} className={`ds-card overflow-hidden transition ${isOpen ? "border-ds-primary ring-1 ring-ds-primary" : "hover:border-ds-primary/40"}`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => setOpen(isOpen ? null : q.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-ds-primary-soft text-xs font-semibold text-ds-primary">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-medium ${q.label.trim() ? "text-ds-heading" : "italic text-ds-text"}`}>{q.label.trim() || "Untitled question"}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ds-text">
                        <span className="text-ds-primary">{meta.icon}</span>
                        {QTYPE_LABEL[q.type]}
                        {q.type === "choice" && ` · ${(q.options ?? []).filter((o) => o.trim()).length} choices`}
                        {q.required ? " · Required" : " · Optional"}
                      </span>
                    </span>
                  </button>
                  <div className="flex flex-none items-center">
                    <button type="button" disabled={i <= 1} onClick={() => move(i, -1)} className="grid h-8 w-8 place-items-center rounded-lg text-ds-text hover:bg-ds-subtle disabled:opacity-25" aria-label="Move up">↑</button>
                    <button type="button" disabled={i === 0 || i === questions.length - 1} onClick={() => move(i, 1)} className="grid h-8 w-8 place-items-center rounded-lg text-ds-text hover:bg-ds-subtle disabled:opacity-25" aria-label="Move down">↓</button>
                    {q.type === "nps" ? (
                      <span className="ml-1 rounded-md bg-ds-subtle px-2 py-1 text-[11px] font-medium text-ds-text" title="Trainer scores and tiers come from this question">Fixed</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setQuestions((qs) => qs.filter((x) => x.id !== q.id));
                          if (isOpen) setOpen(null);
                        }}
                        className="grid h-8 w-8 place-items-center rounded-lg text-ds-text hover:bg-bad-bg hover:text-bad"
                        aria-label="Delete question"
                      >
                        <TrashIcon size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="space-y-4 border-t border-ds-border bg-ds-subtle/40 px-4 py-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ds-text" htmlFor={`label-${q.id}`}>Question</label>
                      <input id={`label-${q.id}`} autoFocus value={q.label} onChange={(e) => update(q.id, { label: e.target.value })} maxLength={300} placeholder="Write the question participants will see" className="input bg-ds-surface" />
                      {q.type === "nps" && <p className="mt-1.5 text-xs text-ds-text">Trainer scores and tiers come from this question, so it can be reworded but not removed.</p>}
                    </div>

                    {q.type !== "nps" && (
                      <>
                        <div>
                          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ds-text">Answer type</span>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {ADDABLE.map((t) => {
                              const on = q.type === t;
                              return (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => update(q.id, { type: t, ...(t === "choice" && !(q.options ?? []).length ? { options: ["", ""] } : {}) })}
                                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${on ? "border-ds-primary bg-ds-surface font-medium text-ds-primary ring-1 ring-ds-primary" : "border-ds-border bg-ds-surface text-ds-heading hover:border-ds-primary/50"}`}
                                >
                                  <span className={on ? "text-ds-primary" : "text-ds-text"}>{TYPE_META[t].icon}</span>
                                  {QTYPE_LABEL[t]}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {q.type === "choice" && (
                          <div>
                            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ds-text">Choices</span>
                            <div className="space-y-2">
                              {(q.options ?? []).map((o, k) => (
                                <div key={k} className="flex items-center gap-2">
                                  <span className="h-4 w-4 flex-none rounded-full border-2 border-ds-border" />
                                  <input value={o} maxLength={120} onChange={(e) => update(q.id, { options: (q.options ?? []).map((x, n) => (n === k ? e.target.value : x)) })} placeholder={`Choice ${k + 1}`} className="input bg-ds-surface py-2 text-sm" />
                                  <button type="button" disabled={(q.options ?? []).length <= 2} onClick={() => update(q.id, { options: (q.options ?? []).filter((_, n) => n !== k) })} className="grid h-9 w-9 flex-none place-items-center rounded-lg text-ds-text hover:bg-bad-bg hover:text-bad disabled:opacity-25" aria-label={`Remove choice ${k + 1}`}>
                                    <TrashIcon size={15} />
                                  </button>
                                </div>
                              ))}
                              {(q.options ?? []).length < 10 && (
                                <button type="button" onClick={() => update(q.id, { options: [...(q.options ?? []), ""] })} className="inline-flex items-center gap-1 text-sm font-medium text-ds-primary hover:underline">
                                  <PlusIcon size={14} /> Add choice
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between rounded-xl border border-ds-border bg-ds-surface px-4 py-3">
                          <div>
                            <div className="text-sm font-medium text-ds-heading">Required</div>
                            <div className="text-xs text-ds-text">Participants must answer before sending.</div>
                          </div>
                          <Switch on={q.required} onClick={() => update(q.id, { required: !q.required })} label="Required" />
                        </div>
                      </>
                    )}
                    <div className="flex justify-end">
                      <button type="button" onClick={() => setOpen(null)} className="text-sm font-medium text-ds-primary hover:underline">Done</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {questions.length < MAX_QUESTIONS && (
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ds-text">Add a question</span>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {ADDABLE.map((t) => (
                <button key={t} type="button" onClick={() => add(t)} className="group flex flex-col items-start gap-2 rounded-xl border border-dashed border-ds-border bg-ds-surface p-3 text-left transition hover:border-ds-primary hover:bg-ds-primary-soft/50">
                  <span className="ds-icon-soft h-8 w-8 group-hover:bg-ds-primary group-hover:text-white">{TYPE_META[t].icon}</span>
                  <span>
                    <span className="block text-sm font-medium text-ds-heading">{QTYPE_LABEL[t]}</span>
                    <span className="block text-xs text-ds-text">{TYPE_META[t].hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="sticky bottom-3 z-10 rounded-2xl border border-ds-border bg-white/95 p-3 shadow-[0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur">
          {m && <div className="mb-2"><Note m={m} /></div>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={reset} disabled={pending} className="px-2 text-sm text-ds-text hover:text-ds-heading hover:underline">Reset to the original form</button>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium ${dirty ? "text-warn" : "text-ds-text"}`}>{dirty ? "Unsaved changes" : "All changes published"}</span>
              <button type="button" onClick={save} disabled={pending || !dirty} className="ds-btn ds-btn-primary">
                {pending ? "Saving…" : "Save & publish"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside className="xl:sticky xl:top-20">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-ds-text">Live preview</span>
          <span className="text-xs text-ds-text">What participants see</span>
        </div>
        <div className="mx-auto max-w-[400px] rounded-[2rem] border-[10px] border-[#0B1E3A] bg-[#0B1E3A] shadow-xl">
          <div className="max-h-[72vh] overflow-y-auto rounded-[1.4rem] bg-ds-canvas">
            <div className="h-1 bg-ds-primary" />
            <div className="space-y-3 p-4">
              <div>
                <span className="inline-flex rounded-md bg-ds-primary-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ds-primary">Training feedback</span>
                <h3 className="mt-2 text-lg font-semibold text-ds-heading">How was today&apos;s session?</h3>
              </div>
              {questions.map((q, i) =>
                q.label.trim() ? (
                  <QuestionField key={q.id} q={{ ...q, options: (q.options ?? []).filter((o) => o.trim()) }} n={i + 1} value={preview[q.id] ?? ""} onChange={(v) => setPreview((p) => ({ ...p, [q.id]: v }))} />
                ) : (
                  <div key={q.id} className="rounded-2xl border border-dashed border-ds-border bg-ds-surface px-4 py-5 text-sm italic text-ds-text">
                    {i + 1}. Untitled question
                  </div>
                ),
              )}
              <button type="button" disabled className="ds-btn ds-btn-primary h-11 w-full opacity-60">Send feedback</button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
