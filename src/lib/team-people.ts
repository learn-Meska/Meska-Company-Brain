import "server-only";
import { db } from "./supabase";
import { leaderOptions, TEAMS, visibleOwners, type Team } from "./team-access";

// Reads for the three layers (portal admin, team leader, member). No auth checks here, so never export
// these from a "use server" file.

export type Person = {
  id: string;
  email: string;
  full_name: string;
  roles: string[] | null;
  team_admin_of: string[] | null;
  team_leader_of: string[] | null;
  reports_to: Record<string, string> | null;
  permissions: string[] | null;
};
export const PERSON_SELECT = "id, email, full_name, roles, team_admin_of, team_leader_of, reports_to, permissions";

// Everyone with team access, by name.
export async function teamPeople(): Promise<Person[]> {
  const { data } = await db().from("app_users").select(PERSON_SELECT).order("full_name");
  return ((data ?? []) as Person[]).filter((p) => (p.roles ?? []).length > 0);
}

export type LeaderChoice = { id: string; name: string };

// For each portal, the people a member can be assigned to (its team leaders and admins, and company admins).
export function leaderChoices(people: Person[], exceptId?: string): Record<Team, LeaderChoice[]> {
  const out = {} as Record<Team, LeaderChoice[]>;
  for (const t of TEAMS) out[t] = leaderOptions(people, t, exceptId).map((p) => ({ id: p.id, name: p.full_name }));
  return out;
}

// The Growth deal owners this login may see: null for everyone (admins, other portals), otherwise its own
// id plus, for a team leader, the members assigned to them.
export async function growthOwnerIds(me: { id: string; role: string; real_role: string; team_admin_of?: string[] | null; team_leader_of?: string[] | null }): Promise<string[] | null> {
  const own = visibleOwners(me, []);
  if (own === null || own.length === 1 && !(me.team_leader_of ?? []).includes("growth")) return own;
  const { data } = await db().from("app_users").select("id, roles, reports_to").contains("roles", ["growth"]).eq("reports_to->>growth", me.id);
  return visibleOwners(me, (data ?? []) as { id: string; roles: string[] | null; reports_to: Record<string, string> | null }[]);
}

// May this login see a Growth deal created by this person?
export async function seesDealOf(me: Parameters<typeof growthOwnerIds>[0], createdBy: string | null) {
  const ids = await growthOwnerIds(me);
  return ids === null || (!!createdBy && ids.includes(createdBy));
}
