"use client";

import { useRef, type ReactNode } from "react";
import { EyeIcon } from "@/components/icons";

// "Show feedback" button that opens the participant feedback of one training day in a clean modal.
export function FeedbackDialog({ count, subtitle, children }: { count: number; subtitle: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="ds-btn border border-ds-border bg-ds-surface text-ds-heading hover:border-ds-primary/50" onClick={() => dialog.current?.showModal()}>
        <EyeIcon size={16} /> Show feedback
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ds-primary-soft px-1.5 text-xs font-semibold text-ds-primary">{count}</span>
      </button>
      <dialog
        ref={dialog}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="m-auto w-[min(720px,calc(100vw-24px))] rounded-2xl border border-ds-border bg-ds-surface p-0 shadow-2xl backdrop:bg-[#0B1E3A]/50"
      >
        <div className="flex max-h-[88vh] flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-ds-border px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-ds-heading">Participant feedback</h2>
              <p className="text-sm text-ds-text">{subtitle}</p>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} className="grid h-9 w-9 place-items-center rounded-lg text-xl leading-none text-ds-text hover:bg-ds-subtle hover:text-ds-heading" aria-label="Close">
              ×
            </button>
          </header>
          <div className="overflow-y-auto bg-ds-canvas/60 p-6">{children}</div>
        </div>
      </dialog>
    </>
  );
}
