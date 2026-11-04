"use client";

import { useEffect, useRef, useState } from "react";
import { COMPENSATION_STATUSES, COMPENSATION_STATUS_LABEL, type CompensationLine } from "@/lib/compensation";

export type TrainerOption = { id: string; full_name: string };
export type TrainingOption = { id: string; trainer_id: string; label: string };

// The training list follows the chosen trainer: only the trainings assigned to them can be picked.
export function CompensationFields({ trainers, trainings, line, trainerId }: { trainers: TrainerOption[]; trainings: TrainingOption[]; line?: CompensationLine; trainerId: string }) {
  const initialTrainer = line?.trainer_id ?? trainerId;
  const initialTraining = line?.booking_id ?? "";
  const [trainer, setTrainer] = useState(initialTrainer);
  const [training, setTraining] = useState(initialTraining);
  // Remounts the selects when the form is reset after adding a line.
  const [version, setVersion] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    const onReset = () => {
      setTrainer(initialTrainer);
      setTraining(initialTraining);
      setVersion((v) => v + 1);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [initialTrainer, initialTraining]);

  const options = trainings.filter((t) => t.trainer_id === trainer);
  const placeholder = !trainer ? "Choose a trainer first" : options.length ? "Choose a training…" : "No trainings assigned to this trainer";

  return (
    <div ref={root} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="trainer_id">Trainer</label>
        <select
          key={`trainer-${version}`}
          id="trainer_id"
          name="trainer_id"
          required
          value={trainer}
          onChange={(e) => {
            setTrainer(e.target.value);
            setTraining("");
          }}
          className="input"
        >
          <option value="">Choose a trainer…</option>
          {trainers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="booking_id">Training</label>
        <select key={`training-${version}`} id="booking_id" name="booking_id" required disabled={!options.length} value={training} onChange={(e) => setTraining(e.target.value)} className="input">
          <option value="">{placeholder}</option>
          {options.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="hours">Hours</label>
        <input id="hours" name="hours" inputMode="decimal" required defaultValue={line?.hours} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="rate">Rate (EGP per hour)</label>
        <input id="rate" name="rate" inputMode="decimal" required defaultValue={line?.rate} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="amount">Amount (EGP)</label>
        <input id="amount" name="amount" inputMode="decimal" required defaultValue={line?.amount} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={line?.status ?? "pending"} className="input">
          {COMPENSATION_STATUSES.map((s) => <option key={s} value={s}>{COMPENSATION_STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="payment_date">Payment date (optional)</label>
        <input id="payment_date" name="payment_date" type="date" defaultValue={line?.payment_date ?? ""} className="input" />
      </div>
    </div>
  );
}
