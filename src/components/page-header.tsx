import type { ReactNode } from "react";

// Meska section banner: gradient band with kicker, title and one-line lead.
export function PageHeader({ kicker, title, lead, actions }: { kicker: string; title: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="band">
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-[#93C5FD]">{kicker}</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[26px]">{title}</h1>
          {lead && <p className="mt-1 max-w-3xl text-sm font-light text-[#CBD5E1]">{lead}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
