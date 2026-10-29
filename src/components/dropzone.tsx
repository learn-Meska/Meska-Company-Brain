"use client";

import { useRef, useState } from "react";

// A dashed "choose or drop" area for one file. Clicking opens the file picker; dropping a file works too.
export function Dropzone({
  title,
  hint,
  accept,
  busy = false,
  file,
  onFile,
}: {
  title: string;
  hint: string;
  accept: string;
  busy?: boolean;
  // the chosen file's summary, e.g. "attendees.csv · 24 participants"; the zone then offers to replace it
  file?: string | null;
  onFile: (f: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = (f: File | undefined) => {
    if (f && !busy) onFile(f);
    if (input.current) input.current.value = "";
  };
  return (
    <label
      className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
        over ? "border-blue bg-ice" : file ? "border-good/40 bg-good-bg/40" : "border-line bg-surface2 hover:border-blue/50"
      } ${busy ? "pointer-events-none opacity-70" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files?.[0]);
      }}
    >
      <svg aria-hidden width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={file ? "text-good" : "text-blue"}>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="m9 14 2 2 4-4" />
      </svg>
      <span className="mt-1 text-sm font-semibold text-ink">{busy ? "Uploading…" : file ? file : title}</span>
      <span className="text-xs text-muted">{file && !busy ? "Click or drop another file to replace it" : hint}</span>
      <input ref={input} type="file" accept={accept} className="sr-only" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
    </label>
  );
}
