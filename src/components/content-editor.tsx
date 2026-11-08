"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { contentLink, createContentUpload, deleteContentFile, recordContentFile, returnContent, submitContent } from "@/app/(app)/content/actions";
import { FileBadge } from "@/components/file-badge";
import { CheckIcon, DownloadIcon, LayersIcon, PenIcon, TrashIcon } from "@/components/icons";

type File_ = { id: string; file_name: string; size_bytes: number | null };
type Msg = { error?: string; ok?: string } | null;
// pendingBy/pendingAt: a member's content waiting for approval; note: why a content admin sent it back.
export type Review = { pendingBy: string | null; pendingAt: string | null; note: string | null };

const OFFLINE = { error: "That didn't go through. Check your connection and try again." };
const mb = (n: number | null) => (n ? `${Math.max(0.1, n / 1048576).toFixed(1)} MB` : "");

function Note({ m }: { m: Msg }) {
  if (!m?.error && !m?.ok) return null;
  return <p className={`rounded-xl px-4 py-3 text-sm ${m.error ? "bg-bad-bg text-bad" : "bg-good-bg text-good"}`}>{m.error ?? m.ok}</p>;
}

// The content team's workspace for one deal: write the guide, upload files, then submit so the trainer sees them.
// canWrite: upload and remove files; canSubmit: save the guide and send it on (portal accesses).
// approver: a content admin, whose submit goes straight to the trainer; a member's goes to a content admin first.
export function ContentEditor({
  dealId,
  initialGuide,
  submittedAt,
  files,
  canWrite = true,
  canSubmit = true,
  approver = true,
  review = { pendingBy: null, pendingAt: null, note: null },
}: {
  dealId: string;
  initialGuide: string;
  submittedAt: string | null;
  files: File_[];
  canWrite?: boolean;
  canSubmit?: boolean;
  approver?: boolean;
  review?: Review;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [guide, setGuide] = useState(initialGuide);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const waiting = !!review.pendingAt;
  const changed = guide.trim() !== initialGuide.trim();

  async function upload(list: FileList | null) {
    if (!list?.length || !canWrite) return;
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

  const download = async (id: string) => {
    const r = await contentLink(id).catch(() => OFFLINE);
    if ("url" in r && r.url) window.location.assign(r.url);
    else setM({ error: r.error ?? "Couldn't download." });
  };

  const submit = () =>
    start(async () => {
      const r = await submitContent(dealId, guide).catch(() => OFFLINE);
      setM(r);
      if (!r.error) router.refresh();
    });

  const sendBack = () =>
    start(async () => {
      const r = await returnContent(dealId, note).catch(() => OFFLINE);
      setM(r);
      if (!r.error) {
        setReturning(false);
        setNote("");
        router.refresh();
      }
    });

  return (
    <section className="ds-card overflow-hidden">
      {/* Guide */}
      <div className="border-b border-ds-border p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 text-base font-semibold text-ds-heading">
            <span className="ds-icon-soft h-9 w-9"><PenIcon size={17} /></span>
            Guide for the trainer
          </h2>
          {changed && canSubmit && <span className="text-xs font-medium text-warn">Unsaved changes</span>}
        </div>
        <textarea
          id="guide"
          aria-label="Guide for the trainer"
          rows={12}
          readOnly={!canSubmit}
          value={guide}
          onChange={(e) => setGuide(e.target.value)}
          placeholder={"Objectives\nAgenda for each day\nExercises and case studies\nTips for this audience…"}
          className="w-full resize-y rounded-xl border border-ds-border bg-ds-surface px-4 py-3 text-sm leading-relaxed text-ds-heading outline-none transition placeholder:text-ds-text/60 focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/20 read-only:bg-ds-subtle/50"
        />
        <div className="mt-1.5 text-right text-xs text-ds-text">{guide.trim().length.toLocaleString()} characters</div>
      </div>

      {/* Files */}
      <div className="border-b border-ds-border p-5 sm:p-6">
        <h2 className="mb-3 flex items-center gap-2.5 text-base font-semibold text-ds-heading">
          <span className="ds-icon-soft h-9 w-9"><LayersIcon size={17} /></span>
          Files <span className="text-sm font-normal text-ds-text">({files.length})</span>
        </h2>

        {canWrite && (
          <label
            className={`mb-4 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-6 py-7 text-center transition ${
              over ? "border-ds-primary bg-ds-primary-soft" : "border-ds-border bg-ds-subtle/40 hover:border-ds-primary/50"
            } ${busy ? "pointer-events-none opacity-70" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              upload(e.dataTransfer.files);
            }}
          >
            <span className="ds-icon-soft"><DownloadIcon size={18} className="rotate-180" /></span>
            <span className="mt-1 text-sm font-semibold text-ds-heading">{busy ? "Uploading…" : "Drop files here or click to upload"}</span>
            <span className="text-xs text-ds-text">Slides, documents, sheets, images, audio/video or a .zip</span>
            <input ref={input} type="file" multiple className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files)} />
          </label>
        )}

        {files.length === 0 ? (
          <p className="rounded-xl bg-ds-subtle/50 px-4 py-6 text-center text-sm text-ds-text">No files yet.</p>
        ) : (
          <ul className="divide-y divide-ds-border rounded-xl border border-ds-border">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                <FileBadge name={f.file_name} small />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ds-heading" title={f.file_name}>{f.file_name}</div>
                  <div className="text-xs text-ds-text">{mb(f.size_bytes)}</div>
                </div>
                <button type="button" onClick={() => download(f.id)} className="grid h-8 w-8 place-items-center rounded-lg text-ds-text hover:bg-ds-subtle hover:text-ds-primary" title="Download" aria-label={`Download ${f.file_name}`}>
                  <DownloadIcon size={16} />
                </button>
                {canWrite && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => confirm(`Remove ${f.file_name}?`) && remove(f.id)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-ds-text hover:bg-bad-bg hover:text-bad"
                    title="Remove"
                    aria-label={`Remove ${f.file_name}`}
                  >
                    <TrashIcon size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Submit / approval */}
      <div className="space-y-3 bg-ds-subtle/40 p-5 sm:px-6">
        {waiting && (
          <div className="flex items-start gap-3 rounded-xl border border-ds-primary/25 bg-ds-primary-soft px-4 py-3">
            <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-ds-primary text-white"><CheckIcon size={13} /></span>
            <p className="text-sm text-ds-heading">
              {approver ? (
                <><b>{review.pendingBy ?? "A team member"}</b> sent this content for your approval{review.pendingAt ? ` on ${review.pendingAt}` : ""}. Check the guide and files, edit if needed, then approve it or send it back.</>
              ) : (
                <>Waiting for a content admin to approve{review.pendingAt ? ` (sent ${review.pendingAt})` : ""}. The trainer sees it only after approval. You can still change it and resend.</>
              )}
            </p>
          </div>
        )}
        {!waiting && review.note && (
          <div className="rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-ds-heading">
            <div className="font-semibold text-warn">Changes requested by the content admin</div>
            <p className="mt-1 whitespace-pre-line">{review.note}</p>
          </div>
        )}
        <Note m={m} />
        {!canSubmit ? (
          <p className="text-xs text-ds-text">You can read this content. Submitting is done by someone with the Submit content access.</p>
        ) : approver ? (
          returning ? (
            <div className="space-y-2">
              <label htmlFor="return-note" className="text-sm font-semibold text-ds-heading">What needs to change?</label>
              <textarea
                id="return-note"
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Add a case study for day 2 and shorten the agenda."
                className="w-full resize-y rounded-xl border border-ds-border bg-ds-surface px-4 py-3 text-sm text-ds-heading outline-none focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/20"
              />
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="ds-btn" disabled={pending} onClick={() => setReturning(false)}>Cancel</button>
                <button type="button" className="ds-btn ds-btn-primary" disabled={pending || !note.trim()} onClick={sendBack}>{pending ? "Sending…" : "Send back with note"}</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-md text-xs text-ds-text">
                {waiting ? "Approving sends the guide and files to the trainer and tells Training Excellence and the team member." : submittedAt ? "Already submitted. Sending an update notifies the trainer and Training Excellence again." : "The trainer sees the guide and files only after you submit. Training Excellence is notified too."}
              </p>
              <div className="flex flex-wrap gap-2">
                {waiting && <button type="button" className="ds-btn" disabled={pending || busy} onClick={() => setReturning(true)}>Send back</button>}
                <button type="button" className="ds-btn ds-btn-primary" disabled={pending || busy} onClick={submit}>
                  {pending ? "Saving…" : waiting ? "Approve & submit to the trainer" : submittedAt ? "Send update to the trainer" : "Submit to the trainer"}
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-xs text-ds-text">A content admin approves your content before the trainer sees it. They get an email as soon as you send it.</p>
            <button type="button" className="ds-btn ds-btn-primary" disabled={pending || busy} onClick={submit}>
              {pending ? "Sending…" : waiting ? "Update & resend for approval" : "Send for approval"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
