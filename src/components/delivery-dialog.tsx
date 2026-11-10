"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { createAudioUpload, createBriefUpload, recordAudioFile, recordBriefFile, submitBrief } from "@/app/(app)/bookings/actions";
import { CheckIcon, LayersIcon } from "@/components/icons";
import { ENGAGEMENT_LABEL, type DeliveryReport } from "@/lib/delivery";
import { AUDIO_MAX_BYTES, checkAudioFile } from "@/lib/files";

const OFFLINE = { error: "That didn't go through. Check your connection and try again." };
type Msg = { error?: string; ok?: string } | null;
type Attached = { id: string; file_name: string; audio: boolean };

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ds-heading">
          {label} {required ? <span className="text-bad">*</span> : <span className="text-xs font-normal text-ds-text">(optional)</span>}
        </span>
        {hint && <span className="text-xs text-ds-text">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const box = "w-full rounded-xl border border-ds-border bg-ds-surface px-3.5 py-2.5 text-sm text-ds-heading outline-none transition focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/20";

// The trainer marks a training day as delivered: a short report, plus optional notes, documents and audio.
export function DeliveryDialog({
  bookingId,
  dayNumber,
  expected,
  report,
  brief,
  finished,
  files,
}: {
  bookingId: string;
  dayNumber: number;
  expected: number | null;
  report: DeliveryReport | null;
  brief: string;
  finished: boolean;
  files: Attached[];
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const [attended, setAttended] = useState(report ? String(report.attended) : "");
  const [topics, setTopics] = useState(report?.topics ?? "");
  const [engagement, setEngagement] = useState(report?.engagement ?? 0);
  const [challenges, setChallenges] = useState(report?.challenges ?? "");
  const [followUp, setFollowUp] = useState(report?.follow_up ?? "");
  const [notes, setNotes] = useState(brief);
  const [busy, setBusy] = useState<"" | "audio" | "doc">("");
  const [m, setM] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const audios = files.filter((f) => f.audio);
  const docs = files.filter((f) => !f.audio);

  const sb = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);

  async function addAudio(file: File | undefined) {
    if (!file) return;
    const bad = checkAudioFile(file.name) ?? (file.size > AUDIO_MAX_BYTES ? "The audio must be under 100 MB. Compress it or split it into parts." : null);
    if (bad) {
      setM({ error: bad });
    } else {
      setBusy("audio");
      setM(null);
      try {
        const u = await createAudioUpload(bookingId, file.name);
        if ("error" in u && u.error) setM({ error: u.error });
        else {
          const { path, token } = u as { path: string; token: string };
          const { error } = await sb().storage.from("materials").uploadToSignedUrl(path, token, file);
          setM(error ? { error: `${file.name}: ${error.message}` } : await recordAudioFile(bookingId, path, file.name, file.size));
        }
      } catch {
        setM(OFFLINE);
      }
      setBusy("");
      router.refresh();
    }
    if (audioInput.current) audioInput.current.value = "";
  }

  async function addDocs(list: FileList | null) {
    if (!list?.length) return;
    setBusy("doc");
    setM(null);
    try {
      for (const file of Array.from(list)) {
        const u = await createBriefUpload(bookingId, file.name);
        if ("error" in u && u.error) {
          setM({ error: u.error });
          break;
        }
        const { path, token } = u as { path: string; token: string };
        const { error } = await sb().storage.from("materials").uploadToSignedUrl(path, token, file);
        if (error) {
          setM({ error: `${file.name}: ${error.message}` });
          break;
        }
        const r = await recordBriefFile(bookingId, path, file.name, file.size);
        setM(r);
        if (r.error) break;
      }
    } catch {
      setM(OFFLINE);
    }
    setBusy("");
    if (docInput.current) docInput.current.value = "";
    router.refresh();
  }

  const submit = () =>
    start(async () => {
      const r = await submitBrief(bookingId, { attended, topics, engagement: String(engagement), challenges, follow_up: followUp, brief: notes }).catch(() => OFFLINE);
      setM(r);
      if (!r.error) {
        dialog.current?.close();
        router.refresh();
      }
    });

  return (
    <>
      {finished ? (
        <button type="button" className="ds-btn border border-ds-border bg-ds-surface text-ds-heading hover:border-ds-primary/50" onClick={() => dialog.current?.showModal()}>
          Edit report
        </button>
      ) : (
        <button type="button" className="ds-btn ds-btn-primary" onClick={() => dialog.current?.showModal()}>
          <CheckIcon size={16} /> Mark as delivered
        </button>
      )}
      {m?.ok && <p className="mt-3 rounded-xl bg-good-bg px-4 py-3 text-sm text-good">{m.ok}</p>}

      <dialog ref={dialog} className="m-auto w-[min(680px,calc(100vw-24px))] rounded-2xl border border-ds-border bg-ds-surface p-0 shadow-2xl backdrop:bg-[#0B1E3A]/50">
        <div className="flex max-h-[88vh] flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-ds-border px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-ds-heading">{finished ? `Day ${dayNumber} delivery report` : `Mark Day ${dayNumber} as delivered`}</h2>
              <p className="text-sm text-ds-text">Training Excellence and the team see this report.</p>
            </div>
            <button type="button" aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-xl text-ds-text hover:bg-ds-subtle" onClick={() => dialog.current?.close()}>
              ×
            </button>
          </header>

          <div className="space-y-5 overflow-y-auto px-6 py-5">
            <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
              <Field label="Attended" required hint={expected ? `of ${expected}` : undefined}>
                <input type="number" min={0} inputMode="numeric" value={attended} onChange={(e) => setAttended(e.target.value)} className={box} placeholder="0" />
              </Field>
              <Field label="Engagement" required hint={engagement ? ENGAGEMENT_LABEL[engagement] : undefined}>
                <div className="flex gap-1.5" role="radiogroup" aria-label="Engagement">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={engagement === n}
                      title={ENGAGEMENT_LABEL[n]}
                      onClick={() => setEngagement(n)}
                      className={`h-10 flex-1 rounded-xl border text-sm font-semibold transition ${n <= engagement ? "border-ds-primary bg-ds-primary text-white" : "border-ds-border bg-ds-surface text-ds-text hover:border-ds-primary/50"}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <Field label="Topics covered" required>
              <textarea rows={3} value={topics} onChange={(e) => setTopics(e.target.value)} className={box} placeholder="What you went through today" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Challenges">
                <textarea rows={3} value={challenges} onChange={(e) => setChallenges(e.target.value)} className={box} placeholder="Anything that got in the way" />
              </Field>
              <Field label="Follow-up">
                <textarea rows={3} value={followUp} onChange={(e) => setFollowUp(e.target.value)} className={box} placeholder="Suggestions for next steps" />
              </Field>
            </div>
            <Field label="Brief / notes">
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={box} placeholder="Client reactions, highlights, anything else" />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-ds-border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-ds-heading">
                    Audio <span className="text-xs font-normal text-ds-text">(optional)</span>
                  </span>
                  {audios.length > 0 && <span className="text-xs font-medium text-good">{audios.length} added</span>}
                </div>
                {audios.map((f) => (
                  <div key={f.id} className="truncate text-xs text-ds-text">♪ {f.file_name}</div>
                ))}
                <label className="mt-2 inline-flex cursor-pointer text-sm font-medium text-ds-primary hover:underline">
                  {busy === "audio" ? "Uploading…" : audios.length ? "+ Add more audio" : "+ Add the training audio"}
                  <input ref={audioInput} type="file" accept=".mp3,.m4a,.wav,audio/*" className="sr-only" disabled={!!busy} onChange={(e) => addAudio(e.target.files?.[0])} />
                </label>
              </div>
              <div className="rounded-xl border border-ds-border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-ds-heading">
                    <LayersIcon size={15} /> Documents
                  </span>
                  {docs.length > 0 && <span className="text-xs text-ds-text">{docs.length}</span>}
                </div>
                {docs.map((f) => (
                  <div key={f.id} className="truncate text-xs text-ds-text">{f.file_name}</div>
                ))}
                <label className="mt-2 inline-flex cursor-pointer text-sm font-medium text-ds-primary hover:underline">
                  {busy === "doc" ? "Uploading…" : "+ Attach documents"}
                  <input ref={docInput} type="file" multiple className="sr-only" disabled={!!busy} onChange={(e) => addDocs(e.target.files)} />
                </label>
              </div>
            </div>
          </div>

          <footer className="space-y-3 border-t border-ds-border bg-ds-subtle/40 px-6 py-4">
            {m?.error && <p className="rounded-xl bg-bad-bg px-4 py-2.5 text-sm text-bad">{m.error}</p>}
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button type="button" className="btn-quiet" onClick={() => dialog.current?.close()}>
                Cancel
              </button>
              <button type="button" className="ds-btn ds-btn-primary" disabled={pending || !!busy} onClick={submit}>
                {pending ? "Sending…" : finished ? "Save report" : "Submit & mark delivered"}
              </button>
            </div>
          </footer>
        </div>
      </dialog>
    </>
  );
}
