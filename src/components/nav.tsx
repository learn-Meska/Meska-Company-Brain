"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { href: string; label: string };

export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const links = items.map((i) => {
    // "/me" has sibling sections (/me/availability…), so it only matches exactly
    const active = path === i.href || (i.href !== "/me" && path.startsWith(i.href + "/"));
    return (
      <Link
        key={i.href}
        href={i.href}
        onClick={() => setOpen(false)}
        className={`block rounded-xl px-3 py-2 text-sm font-medium transition ${active ? "bg-white/15 text-white" : "text-[#C7D7F5] hover:bg-white/10 hover:text-white"}`}
      >
        {i.label}
      </Link>
    );
  });
  return (
    <>
      <button className="rounded-lg px-2 py-1 text-white lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
        ☰
      </button>
      <nav className="hidden gap-1 lg:flex lg:flex-col">{links}</nav>
      {open && <nav className="brand-gradient absolute inset-x-0 top-14 z-30 flex flex-col gap-1 p-3 shadow-xl lg:hidden">{links}</nav>}
    </>
  );
}
