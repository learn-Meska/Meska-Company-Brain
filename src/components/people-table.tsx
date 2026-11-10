import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "@/components/icons";
import { ACCESS, LEVEL_LABEL, TEAM_LABEL, type Level, type Team } from "@/lib/team-access";

export type Person = { id: string; full_name: string; email: string; chips: ReactNode; active: boolean; you?: boolean };

// Someone's access in one portal as chips: "Growth · Portal admin", "Growth · Team leader · 3 of 5" or
// "Content · 3 of 4" followed by the leader a member is assigned to.
export function AccessChip({ team, picked, level, leader }: { team: Team; picked: string[]; level: Level; leader?: string | null }) {
  const total = ACCESS[team].length;
  const n = ACCESS[team].filter((a) => picked.includes(a.key)).length;
  return (
    <>
      <span className={level === "member" ? "ds-badge" : "ds-chip"}>
        {TEAM_LABEL[team]} · {level === "admin" ? LEVEL_LABEL.admin : level === "leader" ? `${LEVEL_LABEL.leader} · ${n} of ${total}` : `${n} of ${total}`}
      </span>
      {level === "member" && (leader ? <span className="ds-badge">Reports to {leader}</span> : <span className="badge bg-warn-bg text-warn">No team leader</span>)}
    </>
  );
}

export function Banner({ children, tone = "good" }: { children: ReactNode; tone?: "good" | "warn" }) {
  return <p className={`rounded-xl px-4 py-3 text-sm ${tone === "good" ? "bg-good-bg text-good" : "bg-warn-bg text-warn"}`}>{children}</p>;
}

// The people list: one row per person, the whole row opens their page.
// Without hrefFor the rows are read-only (a team leader's view of their members).
export function PeopleTable({ people, hrefFor, empty }: { people: Person[]; hrefFor?: (id: string) => string; empty: string }) {
  const ROW = "grid gap-2 px-5 py-4 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_110px_24px] md:items-center md:gap-4";
  return (
    <section className="ds-card overflow-hidden">
      <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,2fr)_110px_24px] gap-4 border-b border-ds-border bg-ds-subtle/60 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-ds-text md:grid">
        <span>Name</span>
        <span>Category &amp; access</span>
        <span>Status</span>
        <span />
      </div>
      {people.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-ds-text">{empty}</p>
      ) : (
        <ul className="divide-y divide-ds-border">
          {people.map((p) => (
            <li key={p.id}>
              <Row href={hrefFor?.(p.id)} className={ROW}>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ds-heading">
                    {p.full_name} {p.you && <span className="text-xs font-normal text-ds-text">(you)</span>}
                  </span>
                  <span className="block truncate text-xs text-ds-text">{p.email}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">{p.chips}</span>
                <span>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${p.active ? "text-good" : "text-ds-text"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${p.active ? "bg-good" : "bg-ds-border"}`} />
                    {p.active ? "Active" : "Invited"}
                  </span>
                </span>
                {hrefFor ? <ChevronRightIcon className="hidden text-ds-text md:block" /> : <span />}
              </Row>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ href, className, children }: { href?: string; className: string; children: ReactNode }) {
  return href ? <Link href={href} className={`${className} transition hover:bg-ds-primary-soft/50`}>{children}</Link> : <div className={className}>{children}</div>;
}
