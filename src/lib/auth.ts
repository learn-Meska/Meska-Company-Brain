import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { cache } from "react";
import { authClient, db } from "./supabase";

export type Role = "admin" | "approver" | "growth" | "trainer";

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
};

const ROLE_ORDER: Role[] = ["admin", "approver", "growth", "trainer"];
// The highest role in the list becomes the main one.
export const mainRole = (roles: string[]): Role => ROLE_ORDER.find((r) => roles.includes(r)) ?? "trainer";

export const VIEW_COOKIE = "view_as";

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await authClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return null;
  const { data: u } = await db().from("app_users").select("*").eq("id", uid).maybeSingle();
  if (!u) return null;
  const { data: t } = await db().from("trainers").select("id").eq("user_id", uid).maybeSingle();
  const base = u as Omit<CurrentUser, "trainer_id" | "real_role" | "views"> & { roles: Role[] | null };
  const trainerId = (t as { id: string } | null)?.id ?? null;
  const views: Role[] =
    base.role === "admin" ? [...ROLE_ORDER] : ROLE_ORDER.filter((r) => (base.roles ?? []).includes(r) || r === base.role || (r === "trainer" && trainerId));
  const view = (await cookies()).get(VIEW_COOKIE)?.value as Role | undefined;
  const role: Role = view && views.includes(view) ? view : base.role;
  return {
    ...base,
    role,
    views,
    // previewing Growth means no trainer-management rights either
    can_manage_trainers: role === "growth" || role === "trainer" ? false : base.can_manage_trainers,
    real_role: base.role,
    trainer_id: trainerId,
  };
});

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

// Admin, or a booking manager allowed to manage trainer profiles (e.g. Mahmoud)
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

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", approver: "Booking manager", growth: "Growth", trainer: "Trainer" };

export const canManageTrainers = (u: CurrentUser) => u.role === "admin" || u.can_manage_trainers;
// Scoring & lists (skills, filter lists, score categories, tiers, rules): admins and booking managers.
export const canEditSettings = (u: CurrentUser) => u.role === "admin" || u.role === "approver" || u.can_manage_trainers;

export async function requireSettingsEditor(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!canEditSettings(u)) redirect("/");
  return u;
}
// Booking managers (L&D director, Mahmoud) and admins book trainers once a training is confirmed with the client.
export const canBook = (u: CurrentUser) => u.role === "admin" || u.role === "approver";
export const isStaff = (u: CurrentUser) => u.role !== "trainer";

export function homeFor(u: CurrentUser) {
  switch (u.role) {
    case "trainer":
      return "/me";
    case "approver":
      return "/calendar";
    case "growth":
      return "/request";
    default:
      return "/calendar";
  }
}
