"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Form, Submit, type ActionResult } from "@/components/form";
import { AwardIcon, CheckIcon, PenIcon, ShieldIcon, TrendIcon } from "@/components/icons";
import { ACCESS, type Team } from "@/lib/team-access";

export type Category = Team | "admin";

const CATEGORIES: { value: Category; label: string; blurb: string; icon: ReactNode }[] = [
  { value: "approver", label: "Training Excellence", blurb: "Books trainers and follows every training", icon: <AwardIcon /> },
  { value: "growth", label: "Growth", blurb: "Sends new deals and follows their bookings", icon: <TrendIcon /> },
  { value: "content", label: "Content", blurb: "Prepares the guide and files for each deal", icon: <PenIcon /> },
  { value: "admin", label: "Company admin", blurb: "Everything, in every portal", icon: <ShieldIcon /> },
];

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="ds-card p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-ds-primary text-xs font-semibold text-white">{n}</span>
        <div>
          <h2 className="text-base font-semibold text-ds-heading">{title}</h2>
          {hint && <p className="text-sm text-ds-text">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

// A switch-style tick box (still a real checkbox, so it posts with the form).
function Toggle({ name, value, checked, disabled, onChange }: { name: string; value: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className="relative inline-flex h-6 w-11 flex-none items-center">
      <input type="checkbox" name={name} value={value} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed" />
      <span className="h-6 w-11 rounded-full bg-ds-subtle ring-1 ring-ds-border transition peer-checked:bg-ds-primary peer-checked:ring-ds-primary peer-disabled:opacity-60" />
      <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
    </span>
  );
}

// Create or edit someone's access: who they are, one category, then only that category's accesses.
// `categories` with a single entry locks the category (edit page, My team).
export function UserAccessForm({
  action,
  categories,
  initial,
  withWho,
  hidden,
  submitLabel,
  pendingLabel,
  cancelHref,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  categories: Category[];
  initial?: { category?: Category; access?: string[]; portalAdmin?: boolean };
  withWho?: boolean;
  hidden?: Record<string, string>;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
}) {
  const locked = categories.length === 1;
  const [category, setCategory] = useState<Category | null>(initial?.category ?? (locked ? categories[0] : null));
  const [picked, setPicked] = useState<string[]>(initial?.access ?? []);
  const [portalAdmin, setPortalAdmin] = useState(!!initial?.portalAdmin);
  const list = category && category !== "admin" ? ACCESS[category] : [];
  const step = withWho ? 2 : 1;

  function choose(c: Category) {
    setCategory(c);
    // a fresh category starts with nothing ticked
    if (c !== initial?.category) {
      setPicked([]);
      setPortalAdmin(false);
    } else {
      setPicked(initial?.access ?? []);
      setPortalAdmin(!!initial?.portalAdmin);
    }
  }
  const toggle = (key: string, on: boolean) => setPicked((p) => (on ? [...new Set([...p, key])] : p.filter((k) => k !== key)));
  const allOn = list.length > 0 && list.every((a) => portalAdmin || picked.includes(a.key));

  return (
    <Form action={action} className="space-y-5 pb-24">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {category && <input type="hidden" name="category" value={category} />}

      {withWho && (
        <Step n={1} title="Who is it?" hint="They'll get an email to set their password.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ua-name">Full name</label>
              <input id="ua-name" name="full_name" required maxLength={120} className="input" autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="ua-email">Work email</label>
              <input id="ua-email" name="email" type="email" required className="input" autoComplete="off" />
            </div>
          </div>
        </Step>
      )}

      {!locked && (
        <Step n={step} title="Choose a category" hint="The portal this person works in.">
          <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
            {CATEGORIES.filter((c) => categories.includes(c.value)).map((c) => {
              const on = category === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => choose(c.value)}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary/30 ${
                    on ? "border-ds-primary bg-ds-primary-soft ring-1 ring-ds-primary" : "border-ds-border bg-ds-surface hover:border-ds-primary/50"
                  }`}
                >
                  <span className={on ? "ds-icon-solid" : "ds-icon-soft"}>{c.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ds-heading">{c.label}</span>
                    <span className="block text-sm text-ds-text">{c.blurb}</span>
                  </span>
                  {on && <CheckIcon className="mt-1 flex-none text-ds-primary" />}
                </button>
              );
            })}
          </div>
        </Step>
      )}

      {category && (
        <Step n={locked ? step : step + 1} title="Access" hint={category === "admin" ? undefined : "Turn on what this person can do."}>
          {category === "admin" ? (
            <div className="flex items-start gap-3 rounded-xl bg-ds-primary-soft p-4">
              <span className="ds-icon-solid"><ShieldIcon /></span>
              <p className="text-sm text-ds-heading">
                A company admin has <b>every access in every portal</b>, plus Team &amp; access, feedback import and the activity log.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <label className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 ${portalAdmin ? "border-ds-primary bg-ds-primary-soft" : "border-ds-border"}`}>
                <span className="ds-icon-soft"><ShieldIcon /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ds-heading">Portal admin</span>
                  <span className="block text-sm text-ds-text">Has every access below and can add people to this portal.</span>
                </span>
                <Toggle name="portal_admin" value="on" checked={portalAdmin} onChange={setPortalAdmin} />
              </label>

              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ds-text">
                  {portalAdmin ? list.length : list.filter((a) => picked.includes(a.key)).length} of {list.length} on
                </span>
                {!portalAdmin && (
                  <button type="button" className="text-sm font-medium text-ds-primary hover:underline" onClick={() => setPicked(allOn ? [] : list.map((a) => a.key))}>
                    {allOn ? "Clear all" : "Select all"}
                  </button>
                )}
              </div>

              <ul className="grid gap-2 md:grid-cols-2">
                {list.map((a) => {
                  const on = portalAdmin || picked.includes(a.key);
                  return (
                    <li key={a.key}>
                      <label className={`flex h-full items-center gap-3 rounded-xl border px-4 py-3 ${on ? "border-ds-primary/40 bg-ds-surface" : "border-ds-border bg-ds-surface"} ${portalAdmin ? "" : "cursor-pointer hover:border-ds-primary/50"}`}>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ds-heading">{a.label}</span>
                          <span className="block text-xs text-ds-text">{a.hint}</span>
                        </span>
                        <Toggle name="access" value={a.key} checked={on} disabled={portalAdmin} onChange={(v) => toggle(a.key, v)} />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Step>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ds-border bg-white/95 backdrop-blur lg:left-[240px]">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 px-4 py-3 sm:px-8">
          <Link href={cancelHref} className="btn-quiet">Cancel</Link>
          {category ? (
            <Submit className="ds-btn ds-btn-primary" pending={pendingLabel}>{submitLabel}</Submit>
          ) : (
            <button type="button" disabled className="ds-btn ds-btn-primary">Choose a category</button>
          )}
        </div>
      </div>
    </Form>
  );
}
