"use client";

import { useId, useMemo, useRef, useState } from "react";
import { COMMON_DEPARTMENTS, splitLabel, type Audience } from "@/lib/deal";

type Opt = { id: string; name: string };

const chip = (on: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
    on ? "border-blue bg-blue text-white" : "border-line bg-surface text-ink hover:border-blue/60"
  }`;

// Step 2 of a New deal: who the training is for. Seniority levels are few, so they are all shown as toggle chips;
// departments are many, so the common ones are one-tap chips and the rest are found by typing.
export function AudiencePicker({ levels, departments, value, onChange }: { levels: Opt[]; departments: Opt[]; value: Audience; onChange: (a: Audience) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const byId = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const common = useMemo(() => COMMON_DEPARTMENTS.map((n) => departments.find((d) => d.name.toLowerCase() === n.toLowerCase())).filter((d): d is Opt => !!d), [departments]);
  const picked = new Set(value.department_ids);
  const matches = q.trim() ? departments.filter((d) => !picked.has(d.id) && d.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];

  const set = (p: Partial<Audience>) => onChange({ ...value, ...p });
  const toggleLevel = (id: string) => set({ level_ids: value.level_ids.includes(id) ? value.level_ids.filter((x) => x !== id) : [...value.level_ids, id] });
  const toggleDept = (id: string) => set({ all_departments: false, department_ids: picked.has(id) ? value.department_ids.filter((x) => x !== id) : [...value.department_ids, id] });
  const addDept = (d: Opt | undefined) => {
    if (!d) return;
    if (!picked.has(d.id)) toggleDept(d.id);
    setQ("");
    setActive(0);
    input.current?.focus();
  };

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="label">Seniority level * <span className="font-normal normal-case text-faint">(pick one or more)</span></legend>
        <div className="flex flex-wrap gap-2">
          {levels.map((l) => {
            const on = value.level_ids.includes(l.id);
            const { main, sub } = splitLabel(l.name);
            return (
              <button key={l.id} type="button" aria-pressed={on} title={l.name} className={chip(on)} onClick={() => toggleLevel(l.id)}>
                {on && <span aria-hidden>✓</span>}
                <span className="font-medium">{main}</span>
                {sub && <span className={`hidden text-xs sm:inline ${on ? "text-white/80" : "text-muted"}`}>{sub}</span>}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2.5">
        <legend className="label">Departments * <span className="font-normal normal-case text-faint">(pick one or more)</span></legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={value.all_departments} className={chip(value.all_departments)} onClick={() => set({ all_departments: !value.all_departments, department_ids: [] })}>
            {value.all_departments && <span aria-hidden>✓</span>}
            <span className="font-medium">Mixed / all departments</span>
          </button>
          {common.map((d) => (
            <button key={d.id} type="button" aria-pressed={picked.has(d.id)} className={chip(picked.has(d.id))} onClick={() => toggleDept(d.id)}>
              {picked.has(d.id) && <span aria-hidden>✓</span>}
              <span className="font-medium">{d.name}</span>
            </button>
          ))}
        </div>

        {!value.all_departments && (
          <div className="relative max-w-md">
            <input
              ref={input}
              className="input"
              role="combobox"
              aria-expanded={open && matches.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-label="Search more departments"
              placeholder="Search more departments, e.g. Legal, Procurement…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, matches.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  addDept(matches[active]);
                } else if (e.key === "Escape") setOpen(false);
                else if (e.key === "Backspace" && !q && value.department_ids.length) toggleDept(value.department_ids[value.department_ids.length - 1]);
              }}
            />
            {open && matches.length > 0 && (
              <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-lg">
                {matches.map((d, i) => (
                  <li
                    key={d.id}
                    role="option"
                    aria-selected={i === active}
                    className={`cursor-pointer px-3 py-1.5 text-sm ${i === active ? "bg-ice text-ink" : "text-ink"}`}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addDept(d);
                    }}
                  >
                    {d.name}
                  </li>
                ))}
              </ul>
            )}
            {open && q.trim() && matches.length === 0 && <p className="mt-1 text-xs text-muted">No other department matches “{q.trim()}”.</p>}
          </div>
        )}

        {!value.all_departments && value.department_ids.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">Selected:</span>
            {value.department_ids.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-ice px-2.5 py-0.5 text-xs font-medium text-ink">
                {byId.get(id)?.name ?? "?"}
                <button type="button" aria-label={`Remove ${byId.get(id)?.name ?? "department"}`} className="text-muted hover:text-bad" onClick={() => toggleDept(id)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </fieldset>

      <div className="max-w-[200px]">
        <label className="label" htmlFor="participant_count">Number of participants *</label>
        <input
          id="participant_count"
          type="number"
          min={1}
          max={10000}
          step={1}
          inputMode="numeric"
          className="input tabular-nums"
          placeholder="e.g. 25"
          value={value.participant_count || ""}
          onChange={(e) => set({ participant_count: e.target.value === "" ? 0 : Number(e.target.value) })}
        />
      </div>
    </div>
  );
}
