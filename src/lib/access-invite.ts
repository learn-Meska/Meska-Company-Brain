import "server-only";
import { randomBytes } from "crypto";
import { db } from "./supabase";
import { emailLayout, esc, sendEmail, siteUrl } from "./email";
import { ACCESS, INVITE_DAYS, TEAM_LABEL, type Category } from "./team-access";

const CATEGORY_TEXT: Record<Category, string> = { ...TEAM_LABEL, admin: "Company admin" };

// Adding a category to someone who already signs in: nothing changes until they confirm from the email.
// A new invite for the same person and category replaces the one still waiting.
export async function sendAccessInvite(opts: { user: { id: string; email: string; full_name: string }; category: Category; portalAdmin: boolean; picked: string[]; by: { id: string; full_name: string } }) {
  const { user, category, portalAdmin, by } = opts;
  const permissions = category === "admin" ? [] : ACCESS[category].map((a) => a.key).filter((k) => portalAdmin || opts.picked.includes(k));
  await db().from("access_invites").delete().eq("user_id", user.id).eq("category", category).is("accepted_at", null);
  const token = randomBytes(24).toString("base64url");
  const { error } = await db().from("access_invites").insert({ user_id: user.id, category, portal_admin: portalAdmin, permissions, token, created_by: by.id });
  if (error) throw new Error(error.message);
  const what = category === "admin" ? "Company admin" : portalAdmin ? `${CATEGORY_TEXT[category]} (portal admin)` : CATEGORY_TEXT[category];
  const list = category === "admin" || portalAdmin ? [] : ACCESS[category].filter((a) => permissions.includes(a.key)).map((a) => [a.label, a.hint] as [string, string]);
  return sendEmail(
    user.email,
    `Confirm your ${CATEGORY_TEXT[category]} access in Meska Company Brain`,
    emailLayout({
      greeting: `Dear ${esc(user.full_name.split(" ")[0])},`,
      intro: `<b>${esc(by.full_name)}</b> gave you <b>${what}</b> access in Meska Company Brain. Confirm it to start using it. Sign in with your usual email and password if asked. The link works for ${INVITE_DAYS} days.`,
      rows: list.length ? list : undefined,
      button: { label: "Confirm my access", url: `${siteUrl()}/accept-access?token=${token}` },
      footnote: "Didn't expect this? Ignore this email and nothing changes.",
    }),
  );
}
