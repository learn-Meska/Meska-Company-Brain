"use client";

import { createContext, startTransition, useActionState, useContext, useRef, type FormEvent, type ReactNode } from "react";

export type ActionResult = { error?: string; ok?: string } | void | undefined;

const Pending = createContext(false);

// Submits through onSubmit (not the form `action` prop) so React doesn't clear what
// the user typed when the server returns an error, e.g. a long cancellation reason.
export function Form({
  action,
  children,
  className,
  reset,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  reset?: boolean;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useActionState(async (_: ActionResult, fd: FormData) => {
    const r = (await action(fd)) ?? { ok: undefined };
    if (reset && !r.error) ref.current?.reset();
    return r;
  }, undefined);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => run(fd));
  }
  return (
    <form ref={ref} onSubmit={onSubmit} className={className}>
      <Pending.Provider value={pending}>{children}</Pending.Provider>
      {state?.error && <p className="mt-2 rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{state.error}</p>}
      {state?.ok && <p className="mt-2 rounded-xl bg-good-bg px-3 py-2 text-sm text-good">{state.ok}</p>}
    </form>
  );
}

export function Submit({ children, className = "btn", pending }: { children: ReactNode; className?: string; pending?: string }) {
  const busy = useContext(Pending);
  return (
    <button type="submit" className={className} disabled={busy}>
      {busy ? (pending ?? "Saving…") : children}
    </button>
  );
}
