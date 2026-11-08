import "server-only";
import { db } from "./supabase";
import { emailLayout, sendEmail, siteUrl } from "./email";
import { accessLink } from "./access-link";

// Shared by Team & access (company admins) and My team (team admins). These skip auth checks,
// so they live here and never in a "use server" file.

export const STAFF_ROLES = ["admin", "approver", "growth", "content"] as const;
const ROLE_TEXT: Record<string, string> = { admin: "Admin", approver: "Training Excellence", growth: "Growth", content: "Content" };
export const rolesText = (roles: string[]) => roles.map((r) => ROLE_TEXT[r] ?? r).join(" + ");

export async function ensureAuthUser(email: string) {
  const { data: existing } = await db().from("app_users").select("id").eq("email", email).maybeSingle();
  if (existing) return { id: (existing as { id: string }).id, isNew: false };
  const { data, error } = await db().auth.admin.createUser({ email, email_confirm: true });
  if (error) {
    // An auth user may already exist without an app profile (e.g. a removed member being re-added).
    const { data: list } = await db().auth.admin.listUsers({ perPage: 1000 });
    const found = list?.users.find((x) => x.email?.toLowerCase() === email);
    if (found) return { id: found.id, isNew: false };
    throw new Error(error.message);
  }
  return { id: data.user.id, isNew: true };
}

export async function sendInvite(email: string, name: string, roleText: string) {
  const link = await accessLink(email, "recovery");
  await sendEmail(
    email,
    "You're invited to Meska Company Brain",
    emailLayout({
      greeting: `Dear ${name.split(" ")[0]},`,
      intro: `You've been given access to Meska Company Brain as <b>${roleText}</b>. Use the button below to set your password and sign in. The link works once; if it expires, use “Forgot your password?” on the sign-in page.`,
      button: { label: "Set my password", url: link },
    }),
  );
}

// For someone who already signs in (e.g. a Growth member added to Content): no set-password link.
export async function sendTeamAdded(email: string, name: string, teamText: string) {
  await sendEmail(
    email,
    `You've been added to ${teamText} in Meska Company Brain`,
    emailLayout({
      greeting: `Dear ${name.split(" ")[0]},`,
      intro: `You now have <b>${teamText}</b> access in Meska Company Brain. Sign in with your usual email and password, then pick <b>${teamText}</b> under “Switch access”.`,
      button: { label: "Sign in", url: `${siteUrl()}/login` },
      footnote: "Never set a password, or forgot it? Use “Forgot your password?” on the sign-in page.",
    }),
  );
}

// Logins that have signed in at least once ("Active"); the others are still "Invited".
export async function activeLoginIds(): Promise<Set<string>> {
  const { data } = await db().auth.admin.listUsers({ perPage: 1000 });
  return new Set((data?.users ?? []).filter((u) => !!u.last_sign_in_at).map((u) => u.id));
}
