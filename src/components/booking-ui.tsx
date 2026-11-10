"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createMaterialUpload, materialLink, proposalLink, recordMaterial, respondBooking } from "@/app/(app)/bookings/actions";
import { contentLink } from "@/app/(app)/content/actions";
import { DownloadIcon, EyeIcon } from "@/components/icons";

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
    <div className="ds-card relative overflow-hidden border-ds-primary/40 bg-ds-primary-soft/60 p-5">
      <div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-ds-primary" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ds-heading">Please confirm this training</h2>
          <p className="text-sm text-ds-text">Confirm that you received it and will deliver it. The feedback QR code unlocks once you confirm.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!declining ? (
            <>
              <button className="ds-btn ds-btn-primary" disabled={pending} onClick={() => go(true)}>✓ I confirm</button>
              <button className="ds-btn border border-ds-border bg-ds-surface text-ds-heading hover:border-ds-primary/50" disabled={pending} onClick={() => setDeclining(true)}>I can&apos;t take it</button>
            </>
          ) : (
            <>
              <button className="ds-btn bg-bad text-white hover:brightness-110" disabled={pending} onClick={() => go(false)}>Send decline</button>
              <button className="ds-btn border border-ds-border bg-ds-surface text-ds-heading" onClick={() => setDeclining(false)}>Back</button>
            </>
          )}
        </div>
      </div>
      {declining && <textarea className="mt-3 w-full rounded-xl border border-ds-border bg-ds-surface px-4 py-3 text-sm outline-none focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/20" rows={2} placeholder="Why can't you take it?" value={comment} onChange={(e) => setComment(e.target.value)} />}
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

// kind "proposal": id is the deal id, and the file is the deal's proposal (Meska team only).
// kind "content": id is a file the content team uploaded for the deal.
export function DownloadButton({ id, name, kind = "material" }: { id: string; name: string; kind?: "material" | "proposal" | "content" }) {
  const [err, setErr] = useState("");
  return (
    <button
      className="text-left text-sm font-medium text-blue hover:underline"
      onClick={async () => {
        setErr("");
        const r = await (kind === "proposal" ? proposalLink(id) : kind === "content" ? contentLink(id) : materialLink(id)).catch(() => OFFLINE);
        if ("url" in r && r.url) window.location.href = r.url;
        else setErr(r.error ?? "Couldn't download.");
      }}
    >
      ⬇ {name}
      {err && <span className="ml-2 text-xs text-bad">{err}</span>}
    </button>
  );
}

// The proposal's two actions on the deal card: preview (PDF only, opens in a new tab) and download.
export function ProposalActions({ dealId, canPreview }: { dealId: string; canPreview: boolean }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function open(preview: boolean) {
    setErr("");
    setBusy(true);
    // a blank tab opened during the click, so the browser doesn't block it as a popup
    const tab = preview ? window.open("", "_blank") : null;
    const r = await proposalLink(dealId, preview).catch(() => OFFLINE);
    setBusy(false);
    if ("url" in r && r.url) {
      if (tab) tab.location.href = r.url;
      else window.location.href = r.url;
    } else {
      tab?.close();
      setErr(r.error ?? "Couldn't open the training outline.");
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {err && <span className="text-xs text-bad">{err}</span>}
      {canPreview && (
        <button type="button" onClick={() => open(true)} disabled={busy} title="Preview" aria-label="Preview the training outline" className="ds-btn ds-btn-outline w-10 px-0">
          <EyeIcon size={16} />
        </button>
      )}
      <button type="button" onClick={() => open(false)} disabled={busy} className="ds-btn ds-btn-outline">
        <DownloadIcon size={16} /> Download
      </button>
    </div>
  );
}

