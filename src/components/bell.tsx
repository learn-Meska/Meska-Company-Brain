"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type N = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

export function Bell() {
  const [items, setItems] = useState<N[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (r.ok) setItems((await r.json()).items);
    } catch {}
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 30000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);
  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  const unread = items.filter((i) => !i.read_at).length;
  async function markAll() {
    await fetch("/api/notifications", { method: "POST" });
    load();
  }
  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-full bg-surface2 p-2 text-ink hover:bg-line" aria-label="Notifications">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <b className="text-sm">Notifications</b>
            {unread > 0 && <button onClick={markAll} className="text-xs text-blue hover:underline">Mark all as read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">Nothing yet.</p>}
            {items.map((n) => (
              <Link key={n.id} href={n.link ?? "#"} onClick={() => setOpen(false)} className={`block border-b border-line px-4 py-3 hover:bg-surface2 ${n.read_at ? "" : "bg-[#F3F7FF]"}`}>
                <div className="flex items-start gap-2">
                  {!n.read_at && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-blue" />}
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{n.title}</div>
                    {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</div>}
                    <div className="mt-1 text-[11px] text-faint">{new Date(n.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
