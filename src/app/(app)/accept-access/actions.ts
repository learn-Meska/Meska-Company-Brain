"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mainRole, requireUser, VIEW_COOKIE } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { audit } from "@/lib/notify";
import { applyCategory, inviteProblem, isCategory } from "@/lib/team-access";

type Invite = { id: string; user_id: string; category: string; portal_admin: boolean; permissions: string[]; created_at: string; accepted_at: string | null };

// The signed-in person confirms access that an admin offered them by email.
export async function acceptAccess(fd: FormData) {
  const me = await requireUser();
  const token = String(fd.get("token") ?? "");
  if (!token || token.length > 100) return { error: "This link isn't valid. Ask your admin to send it again." };
  const { data } = await db().from("access_invites").select("id, user_id, category, portal_admin, permissions, created_at, accepted_at").eq("token", token).maybeSingle();
  const inv = data as Invite | null;
  const problem = inviteProblem(inv, me.id);
  if (problem || !inv) return { error: problem ?? "This link isn't valid." };
  if (!isCategory(inv.category)) return { error: "This link isn't valid. Ask your admin to send it again." };
  // Claim the invite first so a double click can't apply it twice.
  const { data: claimed } = await db().from("access_invites").update({ accepted_at: new Date().toISOString() }).eq("id", inv.id).is("accepted_at", null).select("id");
  if (!claimed?.length) return { error: "This access was already confirmed." };
  const { data: row } = await db().from("app_users").select("roles, team_admin_of, permissions").eq("id", me.id).maybeSingle();
  const cur = row as { roles: string[] | null; team_admin_of: string[] | null; permissions: string[] | null } | null;
  const next = applyCategory({ roles: cur?.roles ?? [], team_admin_of: cur?.team_admin_of ?? [], permissions: cur?.permissions ?? [] }, inv.category, inv.permissions, inv.portal_admin);
  const { error } = await db().from("app_users").update({ role: mainRole(next.roles), ...next }).eq("id", me.id);
  if (error) {
    console.error("[acceptAccess]", error.message);
    await db().from("access_invites").update({ accepted_at: null }).eq("id", inv.id);
    return { error: "Couldn't confirm. Please try again." };
  }
  await audit(me.id, "access_accepted", null, { category: inv.category, portal_admin: inv.portal_admin });
  // Open the app in the new portal straight away.
  (await cookies()).set(VIEW_COOKIE, inv.category, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  revalidatePath("/", "layout");
  redirect("/");
}
