"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The years offered: last year to next year (worked out from today, so it moves on by itself each January),
// widened to include the month on screen.
export function yearOptions(shownYear: number, thisYear: number) {
  const from = Math.min(shownYear, thisYear - 1);
  const to = Math.max(shownYear, thisYear + 1);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

// Builds the calendar URL with one search param changed; an empty value drops it.
function useGo(path: string, params: Record<string, string>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (key: string, value: string) => {
    const next = new URLSearchParams({ ...params, [key]: value });
    if (!value) next.delete(key);
    start(() => router.push(`${path}?${next.toString()}`));
  };
  return { go, pending };
}

// Month and year dropdowns: picking one opens that month at once.
export function MonthPicker({ path, params, month, thisYear }: { path: string; params: Record<string, string>; month: string; thisYear: number }) {
  const { go, pending } = useGo(path, params);
  const [y, m] = month.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className={`flex gap-2 ${pending ? "opacity-60" : ""}`}>
      <select aria-label="Month" value={m} onChange={(e) => go("m", `${y}-${pad(Number(e.target.value))}`)} className="input w-36 py-1.5">
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>{name}</option>
        ))}
      </select>
      <select aria-label="Year" value={y} onChange={(e) => go("m", `${e.target.value}-${pad(m)}`)} className="input w-24 py-1.5">
        {yearOptions(y, thisYear).map((yr) => (
          <option key={yr} value={yr}>{yr}</option>
        ))}
      </select>
    </div>
  );
}

// A dropdown filter that applies as soon as an option is picked (no Filter button needed).
export function ParamSelect({
  path,
  params,
  name,
  value,
  label,
  options,
  className = "w-48",
}: {
  path: string;
  params: Record<string, string>;
  name: string;
  value: string;
  label: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const { go, pending } = useGo(path, params);
  return (
    <select aria-label={label} value={value} onChange={(e) => go(name, e.target.value)} className={`input py-1.5 ${className} ${pending ? "opacity-60" : ""}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
