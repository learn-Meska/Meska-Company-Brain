"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createBriefUpload, createMaterialUpload, materialLink, recordBriefFile, recordMaterial, respondBooking, submitBrief } from "@/app/(app)/bookings/actions";

const OFFLINE = { error: "That didn't go through. Check your connection and try again." };

function Msg({ m }: { m: { error?: string; ok?: string } | null }) {
  if (!m) return null;
  return m.error ? <p className="mt-2 rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">{m.error}</p> : m.ok ? <p className="mt-2 rounded-xl bg-good-bg px-3 py-2 text-sm text-good">{m.ok}</p> : null;
}

export function RespondBox({ id }: { id: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [declining, setDeclining] = useState(false);
  const [m, setM] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const go = (accept: boolean) =>
    start(async () => {
      const r = await respondBooking(id, accept, comment).catch(() => OFFLINE);
      setM(r);
      // a declined training is no longer theirs, so go back to the list
      if (!r.error) {
        if (accept) router.refresh();
        else router.push("/me/bookings?declined=1");
      }
    });
  return (
    <div className="rounded-2xl border-2 border-blue bg-[#F3F7FF] p-4">
      <h2 className="h2">Please confirm this assignment</h2>
      <p className="mb-3 text-sm text-muted">Confirm that you received it and will deliver the training.</p>
      {declining && <textarea className="input mb-2" rows={2} placeholder="Why can't you take it?" value={comment} onChange={(e) => setComment(e.target.value)} />}
      <div className="flex flex-wrap gap-2">
        {!declining ? (
          <>
            <button className="btn" disabled={pending} onClick={() => go(true)}>✓ I confirm</button>
            <button className="btn-ghost" disabled={pending} onClick={() => setDeclining(true)}>I can&apos;t take it</button>
          </>
        ) : (
          <>
            <button className="btn-danger" disabled={pending} onClick={() => go(false)}>Send decline</button>
            <button className="btn-ghost" onClick={() => setDeclining(false)}>Back</button>
          </>
        )}
      </div>
      <Msg m={m} />
    </div>
  );
}

export function MaterialUploader({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [m, setM] = useState<{ error?: string; ok?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setM(null);
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    try {
      for (const file of Array.from(files)) {
        const u = await createMaterialUpload(bookingId, file.name);
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
        const r = await recordMaterial(bookingId, path, file.name, file.size);
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
  return (
    <div>
      <label className="btn-ghost cursor-pointer">
        {busy ? "Uploading…" : "+ Upload material"}
        <input ref={input} type="file" multiple className="hidden" disabled={busy} onChange={(e) => upload(e.target.files)} />
      </label>
      <Msg m={m} />
    </div>
  );
}

export function DownloadButton({ id, name }: { id: string; name: string }) {
  const [err, setErr] = useState("");
  return (
    <button
      className="text-left text-sm font-medium text-blue hover:underline"
      onClick={async () => {
        setErr("");
        const r = await materialLink(id).catch(() => OFFLINE);
        if ("url" in r && r.url) window.location.href = r.url;
        else setErr(r.error ?? "Couldn't download.");
      }}
    >
      ⬇ {name}
      {err && <span className="ml-2 text-xs text-bad">{err}</span>}
    </button>
  );
}

export function BriefBox({ bookingId, initial, submittedAt, finished }: { bookingId: string; initial: string; submittedAt: string | null; finished: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initial);
  const [m, setM] = useState<{ error?: string; ok?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  async function attach(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setM(null);
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    try {
      for (const file of Array.from(files)) {
        const u = await createBriefUpload(bookingId, file.name);
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
        const r = await recordBriefFile(bookingId, path, file.name, file.size);
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
  return (
    <div className="space-y-2">
      <label className="label" htmlFor="brief">
        Brief (required to finish): how did the training go? Key points, attendance, client reactions, follow-ups.
      </label>
      <textarea id="brief" className="input" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn"
          disabled={pending || busy}
          onClick={() =>
            start(async () => {
              const r = await submitBrief(bookingId, text).catch(() => OFFLINE);
              setM(r);
              if (!r.error) router.refresh();
            })
          }
        >
          {pending ? "Sending…" : finished ? "Update brief" : "✓ Mark training as finished"}
        </button>
        <label className="btn-ghost cursor-pointer">
          {busy ? "Uploading…" : "+ Attach document"}
          <input ref={input} type="file" multiple className="hidden" disabled={busy} onChange={(e) => attach(e.target.files)} />
        </label>
        {submittedAt && <span className="text-xs text-muted">Last sent {new Date(submittedAt).toLocaleString("en-GB", { timeZone: "Africa/Cairo", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>}
      </div>
      <Msg m={m} />
    </div>
  );
}
