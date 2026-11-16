"use client";

import { useRouter } from "next/navigation";

type Day = { id: string; label: string };

// Edit training: which day of the training to edit. Each day has its own page, so picking one opens it.
export function DayPicker({ days, current }: { days: Day[]; current: string }) {
  const router = useRouter();
  return (
    <div className="mb-3 max-w-sm">
      <label className="label" htmlFor="edit-day">Day to edit</label>
      <select id="edit-day" className="input" value={current} onChange={(e) => router.push(`/bookings/${e.target.value}#edit`)}>
        {days.map((d) => (
          <option key={d.id} value={d.id}>{d.label}</option>
        ))}
      </select>
    </div>
  );
}
