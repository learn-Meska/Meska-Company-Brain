"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { uploadTrainerFile } from "@/lib/trainer-upload";

export function PhotoUploader({ trainerId, url, initials }: { trainerId: string; url: string | null; initials: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMsg(await uploadTrainerFile(trainerId, "photo", file));
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }
  return (
    <div className="flex items-center gap-4">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Trainer photo" className="h-20 w-20 rounded-full object-cover ring-2 ring-ice2" />
      ) : (
        <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-blue to-navy text-xl font-semibold text-white">{initials}</div>
      )}
      <div>
        <label className="btn-ghost btn-sm cursor-pointer">
          {busy ? "Uploading…" : url ? "Change photo" : "Upload photo"}
          <input ref={input} type="file" accept="image/jpeg,image/png" className="hidden" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        <p className="mt-1 text-xs text-muted">Square JPG or PNG, used on the profile PDF.</p>
        {msg?.error && <p className="mt-1 text-xs text-bad">{msg.error}</p>}
        {msg?.ok && <p className="mt-1 text-xs text-good">{msg.ok}</p>}
      </div>
    </div>
  );
}

export function CvUploader({ trainerId, cvName }: { trainerId: string; cvName: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMsg(await uploadTrainerFile(trainerId, "cv", file));
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }
  return (
    <div className="flex items-center gap-4">
      <div className="grid h-20 w-20 flex-none place-items-center rounded-2xl border border-ice2 bg-ice text-xs font-semibold text-royal">CV</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {cvName && (
            <a href={`/trainers/${trainerId}/cv`} className="truncate text-sm font-medium text-blue hover:underline">
              ⬇ {cvName}
            </a>
          )}
          <label className="btn-ghost btn-sm cursor-pointer">
            {busy ? "Uploading…" : cvName ? "Replace CV" : "Upload CV"}
            <input ref={input} type="file" accept=".pdf,.doc,.docx" className="hidden" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </div>
        <p className="mt-1 text-xs text-muted">PDF or Word, up to 10 MB. Visible to admins, booking managers, Growth and the trainer.</p>
        {msg?.error && <p className="mt-1 text-xs text-bad">{msg.error}</p>}
        {msg?.ok && <p className="mt-1 text-xs text-good">{msg.ok}</p>}
      </div>
    </div>
  );
}
