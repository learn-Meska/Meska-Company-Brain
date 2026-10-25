"use client";

import { useState, useTransition } from "react";
import { submitParticipantFeedback } from "@/app/f/[token]/actions";

function Stars({ name, label, value, onChange }: { name: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink">{label}</legend>
      <div className="flex gap-2" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={`grid h-12 w-12 cursor-pointer place-items-center rounded-xl border text-lg font-semibold transition ${value >= n ? "border-blue bg-blue text-white" : "border-line bg-surface text-muted hover:border-blue"}`}>
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" />
            {n}
          </label>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-faint" style={{ width: 272 }}>
        <span>Poor</span>
        <span>Excellent</span>
      </div>
    </fieldset>
  );
}

export function FeedbackForm({ token }: { token: string }) {
  const [trainer, setTrainer] = useState(0);
  const [content, setContent] = useState(0);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg?.ok) return <p className="rounded-xl bg-good-bg px-4 py-6 text-center text-base font-medium text-good">{msg.ok}</p>;
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => setMsg(await submitParticipantFeedback(token, fd)));
      }}
    >
      <Stars name="trainer_score" label="How would you rate the trainer?" value={trainer} onChange={setTrainer} />
      <Stars name="content_score" label="How would you rate the content?" value={content} onChange={setContent} />
      <div>
        <label htmlFor="liked" className="mb-1 block text-sm font-semibold text-ink">What did you like?</label>
        <textarea id="liked" name="liked" rows={3} className="input" />
      </div>
      <div>
        <label htmlFor="improve" className="mb-1 block text-sm font-semibold text-ink">What could be improved?</label>
        <textarea id="improve" name="improve" rows={3} className="input" />
      </div>
      {msg?.error && <p className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{msg.error}</p>}
      <button className="btn w-full py-3 text-base" disabled={pending || !trainer || !content}>{pending ? "Sending…" : "Send feedback"}</button>
      <p className="text-center text-xs text-faint">Your feedback is anonymous.</p>
    </form>
  );
}
