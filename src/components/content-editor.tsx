"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { DownloadButton } from "@/components/booking-ui";
import { createContentUpload, deleteContentFile, recordContentFile, submitContent } from "@/app/(app)/content/actions";
import { fmtDateTime } from "@/lib/format";

type File_ = { id: string; file_name: string; size_bytes: number | null };
type Msg = { error?: string; ok?: string } | null;

const OFFLINE = { error: "That didn't go through. Check your connection and try again." };

function Note({ m }: { m: Msg }) {
  if (!m) return null;
  return m.error ? <p className="mt-2 rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{m.error}</p> : m.ok ? <p className="mt-2 rounded-xl bg-good-bg px-3 py-2 text-sm text-good">{m.ok}</p> : null;
}

// The content team's workspace for one deal: write the guide, upload files, then submit so the trainer sees them.
// canWrite: upload and remove files; canSubmit: save the guide and send it to the trainer (portal accesses).
export function ContentEditor({ dealId, initialGuide, submittedAt, files, canWrite = true, canSubmit = true }: { dealId: string; initialGuide: string; submittedAt: string | null; files: File_[]; canWrite?: boolean; canSubmit?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [guide, setGuide] = useState(initialGuide);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setM(null);
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    try {
      for (const file of Array.from(list)) {
        const u = await createContentUpload(dealId, file.name);
        if ("error" in u && u.error) {
          setM({ error: u.error });
          break;
        }
        const { path, token } = u as { path: string; token: string };
        const { error } = await sb.storage.from("materials").uploadToSignedUrl(path, token, file);
        if (error) {
          setM({ error: `${file.name}: ${error.message}` });
          break;
        }
        const r = await recordContentFile(dealId, path, file.name, file.size);
        setM(r);
        if (r.error) break;
      }
    } catch {
      setM(OFFLINE);
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  const remove = (id: string) =>
    start(async () => {
      const r = await deleteContentFile(id).catch(() => OFFLINE);
      setM(r);
      router.refresh();
    });

  const submit = () =>
    start(async () => {
      const r = await submitContent(dealId, guide).catch(() => OFFLINE);
      setM(r);
      if (!r.error) router.refresh();
    });

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="eyebrow">Your content</div>
          <h2 className="h2">Guide &amp; files for the trainer</h2>
          <p className="text-sm text-muted">Write the guide and upload the files the trainer needs. The trainer sees them on their training only after you submit.</p>
        </div>
        {submittedAt ? <span className="badge bg-good-bg text-good">Submitted {fmtDateTime(submittedAt)}</span> : <span className="badge bg-warn-bg text-warn">Not submitted yet</span>}
      </div>

      <div>
        <label className="label" htmlFor="guide">Guide for the trainer</label>
        <textarea id="guide" rows={10} className="input" readOnly={!canSubmit} value={guide} onChange={(e) => setGuide(e.target.value)} placeholder="Objectives, agenda per day, exercises, tips for this audience…" />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Files ({files.length})</h3>
          {canWrite && (
            <label className="btn-ghost btn-sm cursor-pointer">
              {busy ? "Uploading…" : "+ Upload files"}
              <input ref={input} type="file" multiple className="hidden" disabled={busy} onChange={(e) => upload(e.target.files)} />
            </label>
          )}
        </div>
        {files.length === 0 ? (
          <p className="text-sm text-muted">No files yet. Slides, documents, sheets, images, audio/video or a .zip.</p>
        ) : (
          <ul className="space-y-1.5">
            {files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface2 px-3 py-2">
                <DownloadButton id={f.id} name={f.file_name} kind="content" />
                <span className="flex items-center gap-3 text-xs text-muted">
                  {f.size_bytes ? `${(f.size_bytes / 1048576).toFixed(1)} MB` : ""}
                  {canWrite && (
                    <button type="button" className="text-bad hover:underline" disabled={pending} onClick={() => confirm(`Remove ${f.file_name}?`) && remove(f.id)}>
                      Remove
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canSubmit && (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" disabled={pending || busy} onClick={submit}>
          {pending ? "Saving…" : submittedAt ? "Send update to the trainer" : "Submit to the trainer"}
        </button>
        <span className="text-xs text-muted">Saves the guide and notifies the assigned trainer and Training Excellence.</span>
      </div>
      )}
      <Note m={m} />
    </section>
  );
}
