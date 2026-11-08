// Portal access: each portal (Training Excellence, Growth, Content) has a list of accesses.
// A portal admin has every access of their portal and manages the portal's team; a member has only the
// accesses ticked for them. Company admins (role "admin") have everything everywhere.
// Pure rules, tested in tests/team-access.test.ts.

export const TEAMS = ["approver", "growth", "content"] as const;
export type Team = (typeof TEAMS)[number];

export const TEAM_LABEL: Record<Team, string> = { approver: "Training Excellence", growth: "Growth", content: "Content" };

export const isTeam = (v: unknown): v is Team => typeof v === "string" && (TEAMS as readonly string[]).includes(v);

export type AccessDef = { key: string; label: string; hint: string };

export const ACCESS: Record<Team, AccessDef[]> = {
  approver: [
    { key: "te.dashboard", label: "View dashboard", hint: "See every training and its status" },
    { key: "te.assign", label: "Assign trainers", hint: "Request trainings, assign and reassign trainers" },
    { key: "te.edit", label: "Edit trainings", hint: "Change dates, times, location and client contact" },
    { key: "te.cancel", label: "Cancel trainings", hint: "Cancel one day or a whole training" },
    { key: "te.find", label: "Find a trainer & calendar", hint: "Search free trainers and see the calendar" },
    { key: "te.trainers", label: "Manage trainer profiles", hint: "Create and edit profiles, scores, photo/CV, invite trainers" },
    { key: "te.compensation", label: "Compensation", hint: "Add, edit and delete compensation lines" },
    { key: "te.settings", label: "Scoring & lists", hint: "Skills, industries, tiers, score categories, rules" },
    { key: "te.deal_value", label: "See deal value", hint: "Deal value and proposal on the deal card" },
    { key: "te.emails", label: "Get emails", hint: "New deal and training change emails" },
  ],
  growth: [
    { key: "growth.new_deal", label: "Send new deals", hint: "Use New deal, and edit or cancel their own requests" },
    { key: "growth.all_bookings", label: "See all bookings", hint: "Every deal and booking, not only their own" },
    { key: "growth.trainers", label: "Browse trainers", hint: "View trainer profiles and download PDFs" },
    { key: "growth.calendar", label: "Calendar", hint: "See the training calendar" },
    { key: "growth.deal_value", label: "See deal value", hint: "Value and proposal on deals" },
    { key: "growth.emails", label: "Get emails", hint: "Emails about trainings they're on" },
  ],
  content: [
    { key: "content.view", label: "View content requests", hint: "See deals, audience, proposal and training days" },
    { key: "content.write", label: "Write content", hint: "Write the guide and upload or delete files" },
    { key: "content.submit", label: "Submit content", hint: "Send the content to trainers (notifies everyone)" },
    { key: "content.emails", label: "Get emails", hint: "New deal and content emails" },
  ],
};

const ALL_KEYS = TEAMS.flatMap((t) => ACCESS[t].map((a) => a.key));
export const portalOf = (key: string): Team | null => TEAMS.find((t) => ACCESS[t].some((a) => a.key === key)) ?? null;
export const allAccess = (team: Team) => ACCESS[team].map((a) => a.key);

type Actor = { id: string; role: string; real_role: string; team_admin_of?: string[] | null; permissions?: string[] | null };
type Member = { id: string; roles: string[] | null; team_admin_of?: string[] | null; permissions?: string[] | null };

// Does this login, in the view it's using now, have this access?
export function hasAccess(u: Actor, key: string) {
  if (u.role === "admin") return true;
  const team = portalOf(key);
  if (!team || u.role !== team) return false;
  // a company admin previewing a portal sees it as its admin would
  if (u.real_role === "admin") return true;
  return (u.team_admin_of ?? []).includes(team) || (u.permissions ?? []).includes(key);
}

export const hasAnyAccess = (u: Actor, ...keys: string[]) => keys.some((k) => hasAccess(u, k));

// Portal admin rights only count while working in that portal's view.
export function ledTeam(u: Actor): Team | null {
  return isTeam(u.role) && (u.team_admin_of ?? []).includes(u.role) ? u.role : null;
}

export function canManageTeam(u: Actor, team: Team) {
  return (u.role === "admin" && u.real_role === "admin") || ledTeam(u) === team;
}

// Portal admins only lead portals they belong to.
export const cleanTeamAdmin = (roles: string[], teamAdminOf: string[]) => TEAMS.filter((t) => roles.includes(t) && teamAdminOf.includes(t));

// Only known accesses of portals the person belongs to.
export const cleanPermissions = (roles: string[], perms: string[]) => ALL_KEYS.filter((k) => perms.includes(k) && roles.includes(portalOf(k)!));

// Replaces one portal's accesses and keeps the others.
export function withPortalAccess(current: string[], team: Team, picked: string[]) {
  const others = current.filter((k) => portalOf(k) !== team);
  const mine = allAccess(team).filter((k) => picked.includes(k));
  return [...others, ...mine];
}

// What a portal admin may not do to someone; null when allowed.
export function memberChangeError(u: Actor, team: Team, target: Member | null, change: "remove" | "lead" | "unlead" | "invite" | "access") {
  if (!canManageTeam(u, team)) return "Only this portal's admins can do that.";
  if (!target || !(target.roles ?? []).includes(team)) return "That person isn't in this portal.";
  if (u.role === "admin") return null;
  // Company admins are managed only in Team & access.
  if ((target.roles ?? []).includes("admin")) return "Company admins are managed in Team & access.";
  if (target.id === u.id && change !== "invite") return "You can't change your own access. Ask another portal admin.";
  return null;
}

// What's left after someone is taken out of one portal.
export function withoutTeam(member: Member, team: Team) {
  const roles = (member.roles ?? []).filter((r) => r !== team);
  return { roles, team_admin_of: cleanTeamAdmin(roles, member.team_admin_of ?? []), permissions: cleanPermissions(roles, member.permissions ?? []) };
}

// Where a login lands: the first page of its portal it can open.
export function homePath(u: Actor & { trainer_id?: string | null }): string {
  const has = (k: string) => hasAccess(u, k);
  switch (u.role) {
    case "trainer":
      return "/me";
    case "admin":
      return "/calendar";
    case "approver":
      if (has("te.dashboard")) return "/dashboard";
      if (has("te.find")) return "/find";
      if (has("te.assign")) return "/request";
      if (has("te.trainers")) return "/trainers";
      if (has("te.compensation")) return "/compensation";
      if (has("te.settings")) return "/admin/settings";
      break;
    case "growth":
      if (has("growth.new_deal")) return "/request";
      return "/bookings";
    case "content":
      if (has("content.view")) return "/content";
      break;
  }
  if (ledTeam(u)) return "/team";
  return u.trainer_id ? "/me" : "/no-access";
}

// Whether someone in this role gets the team's bell and email messages.
export function getsEmails(u: { team_admin_of?: string[] | null; permissions?: string[] | null }, role: string) {
  if (!isTeam(role)) return true;
  const key = ACCESS[role].find((a) => a.key.endsWith(".emails"))!.key;
  return (u.team_admin_of ?? []).includes(role) || (u.permissions ?? []).includes(key);
}
