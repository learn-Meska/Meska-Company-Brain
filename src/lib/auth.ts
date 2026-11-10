import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { cache } from "react";
import { authClient, db } from "./supabase";
import { hasAccess, hasAnyAccess, homePath } from "./team-access";

export type Role = "admin" | "approver" | "growth" | "content" | "trainer";

export type CurrentUser = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  can_manage_trainers: boolean;
  trainer_id: string | null;
  // The main role; `role` is the one in use now (admins can preview any view, others switch between their own roles).
  real_role: Role;
  // Every view this login can switch to: its staff roles, plus Trainer when it is linked to a trainer profile.
  views: Role[];
  // The teams (staff roles) this login leads as a team admin; see src/lib/team-access.ts.
  team_admin_of: string[];
  // The portals this login is a team leader in, and the leader it is assigned to in each portal as a member.
  team_leader_of: string[];
  reports_to: Record<string, string>;
  // The portal accesses ticked for this login (keys like "te.assign"); see src/lib/team-access.ts.
  permissions: string[];
};

const ROLE_ORDER: Role[] = ["admin", "approver", "growth", "content", "trainer"];
// The highest role in the list becomes the main one.
export const mainRole = (roles: string[]): Role => ROLE_ORDER.find((r) => roles.includes(r)) ?? "trainer";

export const VIEW_COOKIE = "view_as";

// Removing a team member blocks their sign-in (see removeTeamMember); a trainer whose profile was
// deleted is not blocked and still sees the "no profile" page.
async function removedMember(uid: string) {
  const { data } = await db().auth.admin.getUserById(uid);
  const until = (data?.user as { banned_until?: string | null } | undefined)?.banned_until;
  return !!until && new Date(until).getTime() > Date.now();
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await authClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return null;
  const { data: u } = await db().from("app_users").select("*").eq("id", uid).maybeSingle();
  if (!u) return null;
  const { data: t } = await db().from("trainers").select("id").eq("user_id", uid).maybeSingle();
  const base = u as Omit<CurrentUser, "trainer_id" | "real_role" | "views" | "team_admin_of" | "team_leader_of" | "reports_to" | "permissions"> & {
    roles: Role[] | null;
    team_admin_of: string[] | null;
    team_leader_of: string[] | null;
    reports_to: Record<string, string> | null;
    permissions: string[] | null;
  };
  const trainerId = (t as { id: string } | null)?.id ?? null;
  // Removed from the team and not a trainer: no access, even while an old session is still valid.
  if (base.role === "trainer" && !(base.roles ?? []).length && !trainerId && (await removedMember(uid))) return null;
  const views: Role[] =
    base.role === "admin" ? [...ROLE_ORDER] : ROLE_ORDER.filter((r) => (base.roles ?? []).includes(r) || r === base.role || (r === "trainer" && trainerId));
  const view = (await cookies()).get(VIEW_COOKIE)?.value as Role | undefined;
  const role: Role = view && views.includes(view) ? view : base.role;
  return {
    ...base,
    role,
    views,
    // previewing Growth means no trainer-management rights either
    can_manage_trainers: role === "growth" || role === "content" || role === "trainer" ? false : base.can_manage_trainers,
    real_role: base.role,
    trainer_id: trainerId,
    team_admin_of: base.team_admin_of ?? [],
    team_leader_of: base.team_leader_of ?? [],
    reports_to: base.reports_to ?? {},
    permissions: base.permissions ?? [],
  };
});

// True when this session was started from an invite or reset email within the last hour. Only then
// can a password be set without the current one; otherwise an unattended open session could be taken over.
const LINK_METHODS = ["otp", "recovery", "invite", "magiclink", "email/signup", "email_change"];
export async function signedInFromEmailLink() {
  const { data } = await (await authClient()).auth.getClaims();
  const amr = (data?.claims?.amr ?? []) as ({ method: string; timestamp: number } | string)[];
  const freshAfter = Date.now() / 1000 - 3600;
  return amr.some((a) => (typeof a === "string" ? LINK_METHODS.includes(a) : LINK_METHODS.includes(a.method) && a.timestamp >= freshAfter));
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const u = await requireUser();
  if (!roles.includes(u.role)) redirect("/");
  return u;
}

// Any one of these portal accesses (company admins have them all).
export async function requireAccess(...keys: string[]): Promise<CurrentUser> {
  const u = await requireUser();
  if (!hasAnyAccess(u, ...keys)) redirect("/");
  return u;
}
export const can = (u: CurrentUser, key: string) => hasAccess(u, key);

// Admins and Training Excellence create, edit and invite trainer profiles.
export async function requireTrainerManager(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!canManageTrainers(u)) redirect("/");
  return u;
}

// Trainer pages: any login linked to a trainer profile (a staff member can also be a trainer).
export async function requireTrainer(): Promise<CurrentUser & { trainer_id: string }> {
  const u = await requireUser();
  // a trainer login without a linked profile would otherwise bounce between "/" and "/me"
  if (!u.trainer_id) redirect(u.role === "trainer" ? "/no-profile" : "/");
  return u as CurrentUser & { trainer_id: string };
}

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", approver: "Training Excellence", growth: "Growth", content: "Content", trainer: "Trainer" };

export const canManageTrainers = (u: CurrentUser) => hasAccess(u, "te.trainers");
// Scoring & lists (skills, filter lists, score categories, tiers, rules): admins and booking managers.
export const canEditSettings = (u: CurrentUser) => hasAccess(u, "te.settings");

export async function requireSettingsEditor(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!canEditSettings(u)) redirect("/");
  return u;
}
// Booking managers (L&D director, Mahmoud) and admins book trainers once a training is confirmed with the client.
export const canBook = (u: CurrentUser) => hasAccess(u, "te.assign");
export const isStaff = (u: CurrentUser) => u.role !== "trainer";
// The content team (and admins) prepare the guide and files for each deal.
export const canManageContent = (u: CurrentUser) => hasAccess(u, "content.write");

export function homeFor(u: CurrentUser) {
  return homePath(u);
}
