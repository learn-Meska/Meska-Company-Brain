"use client";

import { useRef } from "react";

type Option = [id: string, name: string];

// Picking a person applies the filter straight away, so the page needs no separate button.
export function DashboardFilters({ stage, when, growth, trainer, requesters, trainers }: { stage: string | null; when: string; growth: string; trainer: string; requesters: Option[]; trainers: Option[] }) {
  const form = useRef<HTMLFormElement>(null);
  const select = (name: string, value: string, label: string, options: Option[]) => (
    <select name={name} defaultValue={value} aria-label={label} onChange={() => form.current?.requestSubmit()} className="input w-full py-1.5 sm:w-44">
      <option value="">{label}</option>
      {options.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
    </select>
  );
  return (
    <form ref={form} action="/dashboard" className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
      {stage && <input type="hidden" name="stage" value={stage} />}
      {!stage && when !== "active" && <input type="hidden" name="when" value={when} />}
      {select("growth", growth, "Anyone requesting", requesters)}
      {select("trainer", trainer, "All trainers", trainers)}
    </form>
  );
}
