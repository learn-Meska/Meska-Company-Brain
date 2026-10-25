"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState, type FormEvent, type ReactNode } from "react";
import { createTrainer } from "@/app/(app)/admin/actions";
import { checkTrainerFile, uploadTrainerFile } from "@/lib/trainer-upload";

// New profile: saves the fields, then uploads the photo and CV straight to storage, then opens the edit page.
export function TrainerCreateForm({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    const fd = new FormData(e.currentTarget);
    const files = (["photo", "cv"] as const)
      .map((k) => [k, fd.get(k)] as const)
      .filter((x): x is readonly ["photo" | "cv", File] => x[1] instanceof File && x[1].size > 0);
    for (const [k, f] of files) {
      const bad = checkTrainerFile(k, f);
      if (bad) return setErr(bad);
    }
    fd.delete("photo");
    fd.delete("cv");
    setBusy("Saving profile…");
    const r = await createTrainer(fd);
    if (!r || "error" in r || !("id" in r)) {
      setBusy("");
      return setErr((r && "error" in r && r.error) || "Could not create the profile.");
    }
    const problems: string[] = [];
    for (const [k, f] of files) {
      setBusy(k === "photo" ? "Uploading photo…" : "Uploading CV…");
      const u = await uploadTrainerFile(r.id as string, k, f);
      if (u.error) problems.push(`${k === "photo" ? "Photo" : "CV"}: ${u.error}`);
    }
    startTransition(() => router.push(`/trainers/${r.id}/edit?created=1${problems.length ? `&uploadError=${encodeURIComponent(problems.join(" "))}` : ""}`));
  }
  return (
    <form onSubmit={onSubmit} className="card space-y-5">
      <fieldset className="grid gap-4 rounded-2xl border border-ice2 bg-ice p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Photo &amp; CV (optional, can be added later)</legend>
        <div>
          <label className="label" htmlFor="photo">Photo (JPG or PNG, up to 5 MB)</label>
          <input id="photo" name="photo" type="file" accept="image/jpeg,image/png" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="cv">CV (PDF or Word, up to 10 MB)</label>
          <input id="cv" name="cv" type="file" accept=".pdf,.doc,.docx" className="input" />
        </div>
      </fieldset>
      {children}
      {err && <p className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{err}</p>}
      <button type="submit" className="btn" disabled={!!busy}>{busy || "Create profile"}</button>
    </form>
  );
}
