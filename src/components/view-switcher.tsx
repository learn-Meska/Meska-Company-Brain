"use client";

import { useRef } from "react";
import { setViewAs } from "@/app/auth/actions";

const LABEL: Record<string, string> = { admin: "Admin", approver: "Booking manager", growth: "Growth", trainer: "Trainer" };

export function ViewSwitcher({ current, views, label = "View as", id = "view_as" }: { current: string; views: string[]; label?: string; id?: string }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={setViewAs} className="rounded-xl bg-white/10 p-2">
      <label htmlFor={id} className="mb-1 block text-[10px] font-medium uppercase tracking-[0.18em] text-[#93C5FD]">
        {label}
      </label>
      <select
        id={id}
        name="view"
        defaultValue={current}
        onChange={() => form.current?.requestSubmit()}
        className="w-full rounded-lg border border-white/20 bg-navy px-2 py-1.5 text-sm text-white outline-none focus:border-[#93C5FD]"
      >
        {views.map((v) => (
          <option key={v} value={v}>
            {LABEL[v]}
          </option>
        ))}
      </select>
    </form>
  );
}
