// Portal access: each portal (Training Excellence, Growth, Content) has a list of accesses and three layers.
// - A portal admin has every access of their portal, creates its accounts and sees every deal.
// - A team leader has the accesses ticked for them and sees the deals of the members assigned to them.
// - A member has the accesses ticked for them, is assigned to one leader (or admin) and sees their own deals.
// Company admins (role "admin") have everything everywhere.
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
    { key: "te.deal_value", label: "See deal value", hint: "Deal value and training outline on the deal card" },
    { key: "te.emails", label: "Get emails", hint: "New deal and training change emails" },
  ],
  growth: [
    { key: "growth.new_deal", label: "Send new deals", hint: "Use New deal, and edit or cancel their own requests" },
    { key: "growth.trainers", label: "Browse trainers", hint: "View trainer profiles and download PDFs" },
    { key: "growth.calendar", label: "Calendar", hint: "See the training calendar" },
    { key: "growth.deal_value", label: "See deal value", hint: "Value and training outline on deals" },
    { key: "growth.emails", label: "Get emails", hint: "Emails about trainings they're on" },
  ],
  content: [
    { key: "content.view", label: "View content requests", hint: "See deals, audience, training outline and training days" },
    { key: "content.write", label: "Write content", hint: "Write the guide and upload or delete files" },
    { key: "content.submit", label: "Submit content", hint: "Send the content to trainers; members need a content admin's approval first" },
    { key: "content.emails", label: "Get emails", hint: "New deal and content emails" },
  ],
};

const ALL_KEYS = TEAMS.flatMap((t) => ACCESS[t].map((a) => a.key));
export const portalOf = (key: string): Team | null => TEAMS.find((t) => ACCESS[t].some((a) => a.key === key)) ?? null;
export const allAccess = (team: Team) => ACCESS[team].map((a) => a.key);

type Actor = { id: string; role: string; real_role: string; team_admin_of?: string[] | null; team_leader_of?: string[] | null; permissions?: string[] | null };
type Member = { id: string; roles: string[] | null; team_admin_of?: string[] | null; team_leader_of?: string[] | null; reports_to?: Record<string, string> | null; permissions?: string[] | null };

/* ---------- The three layers ---------- */

export const LEVELS = ["admin", "leader", "member"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<Level, string> = { admin: "Portal admin", leader: "Team leader", member: "Member" };
export const isLevel = (v: unknown): v is Level => typeof v === "string" && (LEVELS as readonly string[]).includes(v);

// Someone's layer in one portal. Admin wins over leader.
export function levelOf(m: { team_admin_of?: string[] | null; team_leader_of?: string[] | null }, team: Team): Level {
  if ((m.team_admin_of ?? []).includes(team)) return "admin";
  return (m.team_leader_of ?? []).includes(team) ? "leader" : "member";
}

// Who a member can be assigned to in a portal: its team leaders and its admins (an admin counts as a
// team leader), and company admins. Never themselves.
export function leaderOptions<T extends Member>(people: T[], team: Team, exceptId?: string): T[] {
  return people.filter((p) => p.id !== exceptId && ((p.roles ?? []).includes("admin") || ((p.roles ?? []).includes(team) && levelOf(p, team) !== "member")));
}

// The leader a member is assigned to in a portal, if that person can still lead there.
export function leaderOf<T extends Member>(m: Member, team: Team, people: T[]): T | null {
  const id = m.reports_to?.[team];
  return (id && leaderOptions(people, team, m.id).find((p) => p.id === id)) || null;
}

// A member must be assigned to one of the portal's leaders; admins and leaders are assigned to nobody.
export function leaderError(level: Level, leaderId: string | null | undefined, options: { id: string }[]) {
  if (level !== "member") return null;
  if (!leaderId) return "Choose the team leader this member is assigned to.";
  return options.some((o) => o.id === leaderId) ? null : "That team leader isn't available. Choose another one.";
}

// Which Growth deals a login sees in the view it's using: every deal (portal admins, company admins and the
// other portals), its own and its members' (a team leader), or only its own (a member).
export type DealScope = "all" | "team" | "own";
export function dealScope(u: Actor): DealScope {
  if (u.role !== "growth" || u.real_role === "admin") return "all";
  if ((u.team_admin_of ?? []).includes("growth")) return "all";
  return (u.team_leader_of ?? []).includes("growth") ? "team" : "own";
}

// The deal owners a login may see given who reports to it; null means everyone.
export function visibleOwners(u: Actor, people: Member[]): string[] | null {
  const scope = dealScope(u);
  if (scope === "all") return null;
  if (scope === "own") return [u.id];
  return [u.id, ...people.filter((p) => p.id !== u.id && (p.roles ?? []).includes("growth") && p.reports_to?.growth === u.id).map((p) => p.id)];
}

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

// The portal this login is a team leader (not admin) in, in the view it's using. Leaders see their members.
export function leaderTeam(u: Actor): Team | null {
  return isTeam(u.role) && !ledTeam(u) && (u.team_leader_of ?? []).includes(u.role) ? u.role : null;
}

// Content goes straight to the trainer when a content admin, a content team leader or a company admin submits
// it; a content member's submission waits for their team leader's (or a content admin's) approval.
export function approvesContent(u: Actor) {
  if (u.role === "admin") return true;
  return u.role === "content" && (u.real_role === "admin" || (u.team_admin_of ?? []).includes("content") || (u.team_leader_of ?? []).includes("content"));
}

// Whether this approver may approve (or send back) content that this member sent for approval:
// admins approve anyone's, a team leader only their own members'.
export function approvesContentOf(u: Actor, requester: { id: string; reports_to?: Record<string, string> | null } | null) {
  if (!approvesContent(u)) return false;
  if (u.role === "admin" || u.real_role === "admin" || (u.team_admin_of ?? []).includes("content")) return true;
  return !!requester && requester.reports_to?.content === u.id;
}

export function canManageTeam(u: Actor, team: Team) {
  return (u.role === "admin" && u.real_role === "admin") || ledTeam(u) === team;
}

// Portal admins only lead portals they belong to.
export const cleanTeamAdmin = (roles: string[], teamAdminOf: string[]) => TEAMS.filter((t) => roles.includes(t) && teamAdminOf.includes(t));

// Team leaders too, and never in a portal they already admin.
export const cleanTeamLeader = (roles: string[], teamLeaderOf: string[], teamAdminOf: string[]) => TEAMS.filter((t) => roles.includes(t) && teamLeaderOf.includes(t) && !teamAdminOf.includes(t));

// A leader is kept only for portals where the person is a plain member.
export function cleanReportsTo(roles: string[], reportsTo: Record<string, string> | null | undefined, teamAdminOf: string[], teamLeaderOf: string[]) {
  const out: Record<string, string> = {};
  for (const t of TEAMS) {
    const id = reportsTo?.[t];
    if (id && roles.includes(t) && !teamAdminOf.includes(t) && !teamLeaderOf.includes(t)) out[t] = id;
  }
  return out;
}

// Only known accesses of portals the person belongs to.
export const cleanPermissions = (roles: string[], perms: string[]) => ALL_KEYS.filter((k) => perms.includes(k) && roles.includes(portalOf(k)!));

// Replaces one portal's accesses and keeps the others.
export function withPortalAccess(current: string[], team: Team, picked: string[]) {
  const others = current.filter((k) => portalOf(k) !== team);
  const mine = allAccess(team).filter((k) => picked.includes(k));
  return [...others, ...mine];
}

// What a portal admin may not do to someone; null when allowed.
export function memberChangeError(u: Actor, team: Team, target: Pick<Member, "id" | "roles"> | null, change: "remove" | "lead" | "unlead" | "invite" | "access") {
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
  return dropCategory(member, team);
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
  if (ledTeam(u) || leaderTeam(u)) return "/team";
  return u.trainer_id ? "/me" : "/no-access";
}

// Whether someone in this role gets the team's bell and email messages.
export function getsEmails(u: { team_admin_of?: string[] | null; permissions?: string[] | null }, role: string) {
  if (!isTeam(role)) return true;
  const key = ACCESS[role].find((a) => a.key.endsWith(".emails"))!.key;
  return (u.team_admin_of ?? []).includes(role) || (u.permissions ?? []).includes(key);
}

export type Category = Team | "admin";
export const isCategory = (v: unknown): v is Category => v === "admin" || isTeam(v);

type Access = { roles: string[]; team_admin_of: string[]; team_leader_of: string[]; reports_to: Record<string, string>; permissions: string[] };
type AccessInput = { roles?: string[] | null; team_admin_of?: string[] | null; team_leader_of?: string[] | null; reports_to?: Record<string, string> | null; permissions?: string[] | null };

function tidy(roles: string[], admins: string[], leaders: string[], reportsTo: Record<string, string> | null | undefined, permissions: string[]): Access {
  const team_admin_of = cleanTeamAdmin(roles, admins);
  const team_leader_of = cleanTeamLeader(roles, leaders, team_admin_of);
  return { roles, team_admin_of, team_leader_of, reports_to: cleanReportsTo(roles, reportsTo, team_admin_of, team_leader_of), permissions: cleanPermissions(roles, permissions) };
}

// Puts someone in one category at one level with these accesses, keeping their other categories as they are.
// A portal admin is stored with every access of the portal, so un-making them admin keeps everything on.
// `level` also accepts the older true/false "portal admin" flag. A member is assigned to `leaderId`.
export function applyCategory(cur: AccessInput, category: Category, picked: string[], level: Level | boolean, leaderId?: string | null): Access {
  const roles = [...new Set([...(cur.roles ?? []), category])];
  if (category === "admin") return tidy(roles, cur.team_admin_of ?? [], cur.team_leader_of ?? [], cur.reports_to, cur.permissions ?? []);
  const lv: Level = level === true ? "admin" : level === false ? "member" : level;
  const without = (list: string[] | null | undefined) => (list ?? []).filter((t) => t !== category);
  const admins = lv === "admin" ? [...without(cur.team_admin_of), category] : without(cur.team_admin_of);
  const leaders = lv === "leader" ? [...without(cur.team_leader_of), category] : without(cur.team_leader_of);
  const reportsTo = { ...(cur.reports_to ?? {}) };
  // an explicit leader replaces the old one; leaving it out keeps the assignment they had
  if (lv !== "member") delete reportsTo[category];
  else if (leaderId) reportsTo[category] = leaderId;
  const permissions = withPortalAccess(cur.permissions ?? [], category, lv === "admin" ? allAccess(category) : picked);
  return tidy(roles, admins, leaders, reportsTo, permissions);
}

// Takes someone out of one category, keeping the rest.
export function dropCategory(cur: AccessInput, category: Category): Access {
  const roles = (cur.roles ?? []).filter((r) => r !== category);
  return tidy(roles, cur.team_admin_of ?? [], cur.team_leader_of ?? [], cur.reports_to, cur.permissions ?? []);
}

// An emailed access invite works once, for 7 days, and only for the person it was sent to.
export const INVITE_DAYS = 7;
export function inviteProblem(invite: { user_id: string; created_at: string; accepted_at: string | null } | null, userId: string, now = Date.now()) {
  if (!invite) return "This link isn't valid. Ask your admin to send it again.";
  if (invite.accepted_at) return "This access was already confirmed.";
  if (now - new Date(invite.created_at).getTime() > INVITE_DAYS * 86400000) return "This link has expired. Ask your admin to send it again.";
  if (invite.user_id !== userId) return "This link is for another account. Sign out and sign in with the email it was sent to.";
  return null;
}

// Invites sent after this moment are still valid.
export const inviteCutoff = (now = Date.now()) => new Date(now - INVITE_DAYS * 86400000).toISOString();
