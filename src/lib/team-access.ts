// Who may manage whom in a team. Pure rules, tested in tests/team-access.test.ts.
// A team is one of the staff roles below. Company admins manage every team (Team & access);
// a team admin manages only the people in the team they lead, from "My team" in that team's view.

export const TEAMS = ["approver", "growth", "content"] as const;
export type Team = (typeof TEAMS)[number];

export const TEAM_LABEL: Record<Team, string> = { approver: "Training Excellence", growth: "Growth", content: "Content" };

export const isTeam = (v: unknown): v is Team => typeof v === "string" && (TEAMS as readonly string[]).includes(v);

type Actor = { id: string; role: string; real_role: string; team_admin_of?: string[] | null };
type Member = { id: string; roles: string[] | null; team_admin_of?: string[] | null };

// Team admin rights only count while working in that team's view (or as a company admin).
export function ledTeam(u: Actor): Team | null {
  return isTeam(u.role) && (u.team_admin_of ?? []).includes(u.role) ? u.role : null;
}

export function canManageTeam(u: Actor, team: Team) {
  return (u.role === "admin" && u.real_role === "admin") || ledTeam(u) === team;
}

// Team admins only lead teams they belong to.
export const cleanTeamAdmin = (roles: string[], teamAdminOf: string[]) => TEAMS.filter((t) => roles.includes(t) && teamAdminOf.includes(t));

// What a team admin may not do to someone; null when allowed. Company admins are checked elsewhere.
export function memberChangeError(u: Actor, team: Team, target: Member | null, change: "remove" | "lead" | "unlead" | "invite") {
  if (!canManageTeam(u, team)) return "Only this team's admins can do that.";
  if (!target || !(target.roles ?? []).includes(team)) return "That person isn't in this team.";
  if (u.role === "admin") return null;
  // Company admins are managed only in Team & access.
  if ((target.roles ?? []).includes("admin")) return "Company admins are managed in Team & access.";
  if (target.id === u.id && (change === "remove" || change === "unlead")) return "You can't take away your own team access. Ask another team admin.";
  return null;
}

// The roles left after someone is taken out of one team.
export function withoutTeam(member: Member, team: Team) {
  const roles = (member.roles ?? []).filter((r) => r !== team);
  return { roles, team_admin_of: cleanTeamAdmin(roles, member.team_admin_of ?? []) };
}
