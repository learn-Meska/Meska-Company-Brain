import type { ReactNode } from "react";
import { ChevronRightIcon } from "@/components/icons";

// An outlined action row (icon, title, one line, chevron) that opens to show its form, so the confirmation
// step stays. Danger gives it a subtle red outline and a red icon and title.
export function ActionCard({ icon, title, lead, tone = "default", children }: { icon: ReactNode; title: string; lead: string; tone?: "default" | "danger"; children: ReactNode }) {
  const danger = tone === "danger";
  return (
    <details className={`group rounded-xl border bg-ds-surface transition ${danger ? "border-ds-danger/30 open:border-ds-danger/50" : "border-ds-border open:border-ds-heading/20"}`}>
      <summary className={`flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3.5 transition [&::-webkit-details-marker]:hidden ${danger ? "hover:bg-ds-danger/[0.03]" : "hover:bg-ds-subtle"}`}>
        <span className={`grid h-9 w-9 flex-none place-items-center rounded-[10px] border ${danger ? "border-ds-danger/25 text-ds-danger" : "border-transparent bg-ds-primary-soft text-ds-primary"}`}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold ${danger ? "text-ds-danger" : "text-ds-heading"}`}>{title}</span>
          <span className="block text-xs text-ds-text">{lead}</span>
        </span>
        <ChevronRightIcon size={16} className={`flex-none transition group-open:rotate-90 ${danger ? "text-ds-danger" : "text-ds-text"}`} />
      </summary>
      <div className="space-y-3 border-t border-ds-border px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}
