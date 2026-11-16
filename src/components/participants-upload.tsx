"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { saveParticipants } from "@/app/(app)/bookings/deal-actions";
import { PlusIcon } from "@/components/icons";
import { parseParticipants, PARTICIPANTS_TEMPLATE_CSV, PARTICIPANTS_TEMPLATE_NAME } from "@/lib/deal";

// Adds or replaces a deal's participant list from the CSV template, after the deal was sent.
export function ParticipantsUpload({ bookingId, hasList }: { bookingId: string; hasList: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<{ error?: string; ok?: string } | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setM(null);
    if (!/\.csv$/i.test(file.name)) setM({ error: "Upload the participants as a .csv file (use the template)." });
    else if (file.size > 2 * 1024 * 1024) setM({ error: "The participants file is too large (2 MB at most)." });
    else {
      const { participants, error } = parseParticipants(await file.text());
      if (error) setM({ error: `${file.name}: ${error}` });
      else if (!hasList || window.confirm(`Replace the current list with the ${participants.length} participants in ${file.name}?`)) {
        setBusy(true);
        const r = await saveParticipants(bookingId, participants).catch(() => ({ error: "That didn't go through. Check your connection and try again." }));
        setBusy(false);
        setM(r);
        if (!("error" in r && r.error)) router.refresh();
      }
    }
    if (input.current) input.current.value = "";
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      <a className="text-xs font-medium text-ds-primary hover:underline" download={PARTICIPANTS_TEMPLATE_NAME} href={`data:text/csv;charset=utf-8,${encodeURIComponent(PARTICIPANTS_TEMPLATE_CSV)}`}>
        Download template
      </a>
      <label className={`ds-btn ds-btn-outline cursor-pointer ${busy ? "pointer-events-none opacity-70" : ""}`}>
        <PlusIcon size={16} /> {busy ? "Saving…" : hasList ? "Replace list" : "Upload participants"}
        <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      {m?.error && <p className="w-full rounded-lg bg-bad-bg px-3 py-2 text-xs text-bad">{m.error}</p>}
      {m?.ok && <p className="w-full rounded-lg bg-good-bg px-3 py-2 text-xs text-good">{m.ok}</p>}
    </div>
  );
}
