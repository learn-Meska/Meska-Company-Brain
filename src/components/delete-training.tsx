"use client";

import { useState } from "react";
import { Form, Submit } from "@/components/form";
import { TrashIcon } from "@/components/icons";
import { deleteTraining } from "@/app/(app)/bookings/actions";

// Company admins only: delete a training and everything attached to it, after typing DELETE.
export function DeleteTraining({ id, days, isDeal }: { id: string; days: number; isDeal: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <section className="ds-card overflow-hidden border-ds-danger/30">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-bad-bg text-bad"><TrashIcon size={18} /></span>
          <div>
            <h2 className="text-base font-semibold text-ds-heading">Delete this {isDeal ? "deal" : "training"}</h2>
            <p className="max-w-xl text-sm text-ds-text">
              Removes it from the app for good: {days === 1 ? "the training day" : `all ${days} training days`}
              {isDeal ? ", participants, proposal, content and files" : " and its files"}, briefs and feedback. Nobody is emailed. This can&apos;t be undone.
            </p>
          </div>
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="btn-danger btn-sm">
            Delete…
          </button>
        )}
      </div>
      {open && (
        <Form action={deleteTraining} className="space-y-3 border-t border-ds-border bg-bad-bg/40 p-5">
          <input type="hidden" name="id" value={id} />
          <label className="block text-sm text-ds-heading" htmlFor="confirm-delete">
            Type <b>DELETE</b> to confirm
          </label>
          <div className="flex flex-wrap gap-2">
            <input id="confirm-delete" name="confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" className="input max-w-xs" placeholder="DELETE" />
            {text.trim().toUpperCase() === "DELETE" ? (
              <Submit className="btn-danger" pending="Deleting…">Delete permanently</Submit>
            ) : (
              <button type="button" disabled className="btn-danger opacity-50">Delete permanently</button>
            )}
            <button type="button" className="btn-quiet" onClick={() => { setOpen(false); setText(""); }}>
              Cancel
            </button>
          </div>
        </Form>
      )}
    </section>
  );
}
