"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mainRole, requireUser, type CurrentUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { isUuid } from "@/lib/format";
import { audit } from "@/lib/notify";
import { cleanTeamAdmin, ledTeam, memberChangeError, TEAM_LABEL, withoutTeam, type Team } from "@/lib/team-access";
import { ensureAuthUser, sendInvite, sendTeamAdded, STAFF_ROLES } from "@/lib/team-invite";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Member = { id: string; email: string; full_name: string; roles: string[] | null; team_admin_of: string[] | null };

// Every action here works on the team the signed-in team admin is leading right now.
async function requireTeamAdmin(): Promise<{ me: CurrentUser; team: Team }> {
  const me = await requireUser();
  const team = ledTeam(me);
  if (!team) redirect("/");
  return { me, team };
}

async function loadMember(id: string) {
  if (!isUuid(id)) return null;
  const { data } = await db().from("app_users").select("id, email, full_name, roles, team_admin_of").eq("id", id).maybeSingle();
  return (data as Member | null) ?? null;
}

function done(ok: string) {
  revalidatePath("/team");
  revalidatePath("/admin/users");
  return { ok };
}

export async function addToMyTeam(fd: FormData) {
  const { me, team } = await requireTeamAdmin();
  const email = str(fd, "email").toLowerCase();
  const full_name = str(fd, "full_name");
  const makeAdmin = fd.get("team_admin") === "on";
  if (!email || !full_name) return { error: "Enter a name and email." };
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  if (full_name.length > 120) return { error: "Keep the name under 120 characters." };
  const label = TEAM_LABEL[team];

  const { data: existing } = await db().from("app_users").select("id, full_name, roles, team_admin_of").eq("email", email).maybeSingle();
  const cur = existing as { id: string; full_name: string; roles: string[] | null; team_admin_of: string[] | null } | null;
  const held = cur?.roles ?? [];
  if (held.includes(team)) return { error: `That person is already in ${label}.` };
  // Someone already on another team keeps their access and simply gets this team too.
  const alreadyStaff = held.some((r) => (STAFF_ROLES as readonly string[]).includes(r));
  try {
    const { id } = await ensureAuthUser(email);
    const { data: authUser } = await db().auth.admin.getUserById(id);
    const signsIn = alreadyStaff || !!authUser?.user?.last_sign_in_at;
    // A previously removed member was blocked from signing in; adding them back lifts that.
    await db().auth.admin.updateUserById(id, { ban_duration: "none" });
    const roles = [...new Set([...held, team])];
    const team_admin_of = cleanTeamAdmin(roles, [...(cur?.team_admin_of ?? []), ...(makeAdmin ? [team] : [])]);
    const { error } = await db()
      .from("app_users")
      .upsert({ id, email, full_name: cur?.full_name ?? full_name, role: mainRole(roles), roles, team_admin_of });
    if (error) {
      console.error("[addToMyTeam]", error.message);
      return { error: "Couldn't save. Please try again." };
    }
    await audit(me.id, "team_member_added", null, { email, roles: [team], team_admin: makeAdmin, by_team_admin: team });
    if (signsIn) await sendTeamAdded(email, cur?.full_name ?? full_name, label);
    else await sendInvite(email, full_name, label);
  } catch (e) {
    console.error("[addToMyTeam]", e instanceof Error ? e.message : e);
    return { error: "The member was saved but the email couldn't be sent. Use “Resend invite” to try again." };
  }
  return done(`${full_name} was added to ${label} and emailed.`);
}

export async function setTeamAdmin(fd: FormData) {
  const { me, team } = await requireTeamAdmin();
  const lead = str(fd, "lead") === "1";
  const m = await loadMember(str(fd, "id"));
  const err = memberChangeError(me, team, m, lead ? "lead" : "unlead");
  if (err || !m) return { error: err ?? "Member not found." };
  const next = lead ? [...(m.team_admin_of ?? []), team] : (m.team_admin_of ?? []).filter((t) => t !== team);
  const { error } = await db()
    .from("app_users")
    .update({ team_admin_of: cleanTeamAdmin(m.roles ?? [], next) })
    .eq("id", m.id);
  if (error) {
    console.error("[setTeamAdmin]", error.message);
    return { error: "Couldn't save. Please try again." };
  }
  await audit(me.id, "team_admin_changed", null, { id: m.id, team, team_admin: lead });
  return done(lead ? `${m.full_name} is now a ${TEAM_LABEL[team]} admin.` : `${m.full_name} is now a member.`);
}

// Takes away this team only. Someone left with no team and no trainer profile can't sign in any more.
export async function removeFromMyTeam(fd: FormData) {
  const { me, team } = await requireTeamAdmin();
  const m = await loadMember(str(fd, "id"));
  const err = memberChangeError(me, team, m, "remove");
  if (err || !m) return { error: err ?? "Member not found." };
  const next = withoutTeam(m, team);
  const { error } = await db()
    .from("app_users")
    .update({ roles: next.roles, team_admin_of: next.team_admin_of, role: mainRole(next.roles) })
    .eq("id", m.id)
    // only if they're still in the team we checked
    .contains("roles", [team]);
  if (error) {
    console.error("[removeFromMyTeam]", error.message);
    return { error: "Couldn't save. Please try again." };
  }
  const stillStaff = next.roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r));
  if (!stillStaff) {
    const { data: t } = await db().from("trainers").select("id").eq("user_id", m.id).maybeSingle();
    if (!t) {
      const { error: banError } = await db().auth.admin.updateUserById(m.id, { ban_duration: "876000h" });
      if (banError) console.error("[removeFromMyTeam ban]", banError.message);
    }
  }
  await audit(me.id, "team_member_removed", null, { id: m.id, team });
  return done(`${m.full_name} was removed from ${TEAM_LABEL[team]}.`);
}

export async function resendMyTeamInvite(fd: FormData) {
  const { me, team } = await requireTeamAdmin();
  const m = await loadMember(str(fd, "id"));
  const err = memberChangeError(me, team, m, "invite");
  if (err || !m) return { error: err ?? "Member not found." };
  try {
    await sendInvite(m.email, m.full_name, TEAM_LABEL[team]);
  } catch (e) {
    console.error("[resendMyTeamInvite]", e instanceof Error ? e.message : e);
    return { error: "The invitation couldn't be sent. Please try again." };
  }
  return { ok: `Invitation re-sent to ${m.email}.` };
}
