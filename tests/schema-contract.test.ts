// The New deal fields must line up in three places: the migration, tests/schema.json, and every query in the code.
// `npm run check:db` checks the fourth place, the live Supabase database, against the same tests/schema.json.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");
const schema = JSON.parse(read("tests/schema.json")) as Record<string, string[]>;
const migrations = readdirSync(new URL("supabase/migrations/", root))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => read(`supabase/migrations/${f}`))
  .join("\n");

function sourceFiles(dir: string): string[] {
  return readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(`${dir}${e.name}/`) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}
const code = sourceFiles("src/").map((f) => ({ f, text: read(f) }));

// columns named in .from("<table>").select("a, b") / .insert({...}) for the deal tables
function selectedColumns(table: string) {
  const out = new Set<string>();
  const re = new RegExp(`from\\("${table}"\\)\\s*\\.select\\("([^"]+)"`, "g");
  for (const { text } of code) for (const m of text.matchAll(re)) for (const c of m[1].split(",")) if (!c.includes("(")) out.add(c.trim());
  return [...out].filter((c) => c && c !== "*");
}

describe("schema contract", () => {
  it.each(["deals", "deal_participants"])("the migration creates every %s column the app relies on", (table) => {
    const body = migrations.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? "";
    const declared = body
      .split("\n")
      .map((l) => l.trim().match(/^([a-z_]+)\s+(uuid|text|integer|bigint|numeric|timestamptz|boolean)/)?.[1])
      .filter(Boolean);
    expect(declared.sort()).toEqual([...schema[table]].sort());
  });

  it("the migration links bookings to deals and creates the proposals bucket", () => {
    expect(migrations).toMatch(/alter table public\.bookings add column if not exists deal_id uuid references public\.deals \(id\) on delete set null/);
    expect(migrations).toMatch(/'proposals', 'proposals', false/);
    expect(migrations).toMatch(/alter table public\.deals enable row level security/);
    expect(migrations).toMatch(/alter table public\.deal_participants enable row level security/);
  });

  it("every column createRequest writes exists (golden writes vs schema)", () => {
    const writes = JSON.parse(read("tests/golden/create-request.writes.json")) as { table: string; payload: unknown }[];
    for (const w of writes) {
      const rows = (Array.isArray(w.payload) ? w.payload : [w.payload]) as Record<string, unknown>[];
      for (const r of rows) for (const k of Object.keys(r)) expect(schema[w.table], `${w.table}.${k}`).toContain(k);
    }
  });

  it.each(["deals", "deal_participants", "bookings"])("every column the code selects from %s exists", (table) => {
    for (const c of selectedColumns(table)) expect(schema[table], `${table}.${c}`).toContain(c);
  });

  it("deal data is never read on trainer pages", () => {
    const trainerPages = code.filter(({ f }) => f.replace(/\\/g, "/").includes("/me/"));
    for (const { f, text } of trainerPages) {
      expect(text, f).not.toMatch(/deals|deal_participants|DealCard|proposalLink/);
    }
    // the shared ticket (trainers see it too) must not show the deal either
    expect(read("src/components/ticket.tsx")).not.toMatch(/deal_id|"deals"|deal_participants|DealCard|proposal/);
  });
});
