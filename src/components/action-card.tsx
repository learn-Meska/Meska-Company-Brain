import type { ReactNode } from "react";
import { ChevronRightIcon } from "@/components/icons";

// A row-style action (icon, title, one line) that opens to show its form. Danger tints it red.
export function ActionCard({ icon, title, lead, tone = "default", children }: { icon: ReactNode; title: string; lead: string; tone?: "default" | "danger"; children: ReactNode }) {
  const danger = tone === "danger";
  return (
    <details className={`group rounded-2xl border transition ${danger ? "border-bad/20 bg-gradient-to-br from-white to-bad-bg/60 open:border-bad/40" : "border-ice2 bg-gradient-to-br from-white to-ice open:border-blue/40"}`}>
      <summary className="flex cursor-pointer list-none items-center gap-4 p-4 [&::-webkit-details-marker]:hidden">
        <span className={`grid h-11 w-11 flex-none place-items-center rounded-xl ${danger ? "bg-bad-bg text-bad" : "bg-ice2 text-royal"}`}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className={`block font-semibold ${danger ? "text-bad" : "text-ink"}`}>{title}</span>
          <span className="block text-sm text-muted">{lead}</span>
        </span>
        <span className={`grid h-8 w-8 flex-none place-items-center rounded-lg transition group-open:rotate-90 ${danger ? "bg-bad-bg text-bad" : "bg-ice2 text-royal"}`}>
          <ChevronRightIcon size={16} />
        </span>
      </summary>
      <div className="space-y-3 border-t border-line/70 px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}
