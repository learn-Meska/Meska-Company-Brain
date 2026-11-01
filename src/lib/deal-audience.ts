import "server-only";
import { db } from "./supabase";
import { splitLabel, type Audience } from "./deal";

type Opt = { id: string; name: string };
export type DealAudience = { participant_count: number; all_departments: boolean; levels: Opt[]; departments: Opt[] };

// A New deal's audience with names, in the admin lists' order. Not commercial, so trainers may see it too.
export async function getDealAudience(dealId: string | null | undefined): Promise<DealAudience | null> {
  if (!dealId) return null;
  const [{ data: deal }, { data: rows }] = await Promise.all([
    db().from("deals").select("participant_count, all_departments").eq("id", dealId).maybeSingle(),
    db().from("deal_audience").select("lookup_id, lookups(id, kind, name, sort)").eq("deal_id", dealId),
  ]);
  if (!deal) return null;
  const tags = ((rows ?? []) as unknown as { lookups: Opt & { kind: string; sort: number } | null }[])
    .map((r) => r.lookups)
    .filter((l): l is Opt & { kind: string; sort: number } => !!l)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const d = deal as { participant_count: number; all_departments: boolean };
  return {
    participant_count: d.participant_count,
    all_departments: d.all_departments,
    levels: tags.filter((t) => t.kind === "audience").map(({ id, name }) => ({ id, name })),
    departments: tags.filter((t) => t.kind === "function").map(({ id, name }) => ({ id, name })),
  };
}

// The picked ids must be real seniority levels and departments (the browser can send anything).
export async function audienceLookupsError(a: Audience) {
  const ids = [...a.level_ids, ...a.department_ids];
  const { data } = await db().from("lookups").select("id, kind").in("id", ids);
  const kind = new Map(((data ?? []) as { id: string; kind: string }[]).map((l) => [l.id, l.kind]));
  if (!a.level_ids.every((id) => kind.get(id) === "audience")) return "Pick the seniority levels again.";
  if (!a.department_ids.every((id) => kind.get(id) === "function")) return "Pick the departments again.";
  return null;
}

// Rows for emails and tickets: "Seniority", "Departments", "Participants".
export function audienceSummary(a: DealAudience): [string, string][] {
  return [
    ["Seniority", a.levels.map((l) => splitLabel(l.name).main).join(", ") || "—"],
    ["Departments", a.all_departments ? "Mixed / all departments" : a.departments.map((d) => d.name).join(", ") || "—"],
    ["Participants", a.participant_count.toLocaleString("en-US")],
  ];
}
