"use server";

import { redirect } from "next/navigation";
import { authClient, db } from "@/lib/supabase";
import { emailLayout, sendEmail, siteUrl } from "@/lib/email";
import { getCurrentUser, homeFor, VIEW_COOKIE, type Role } from "@/lib/auth";
import { cookies } from "next/headers";

export async function signIn(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const supabase = await authClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Wrong email or password." };
  const u = await getCurrentUser();
  if (!u) {
    await supabase.auth.signOut();
    return { error: "This account doesn't have access to the booking system." };
  }
  const next = String(fd.get("next") ?? "");
  redirect(next.startsWith("/") ? next : homeFor(u));
}

export async function signOut() {
  const supabase = await authClient();
  await supabase.auth.signOut();
  (await cookies()).delete(VIEW_COOKIE);
  redirect("/login");
}

// Builds a one-time link to /auth/confirm (invite or password reset) without using Supabase's own emails.
export async function accessLink(email: string, kind: "invite" | "recovery") {
  const redirectTo = `${siteUrl()}/auth/set-password`;
  const { data, error } = await db().auth.admin.generateLink({ type: kind, email, options: { redirectTo } });
  if (error || !data?.properties?.hashed_token) throw new Error(error?.message ?? "Could not create link");
  return `${siteUrl()}/auth/confirm?token_hash=${data.properties.hashed_token}&type=${kind}`;
}

export async function requestReset(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const { data: u } = await db().from("app_users").select("full_name").eq("email", email).maybeSingle();
  // Same answer either way so the form can't be used to discover accounts.
  const ok = { ok: "If that email has an account, a reset link is on its way." };
  if (!u) return ok;
  const link = await accessLink(email, "recovery");
  await sendEmail(
    email,
    "Reset your Meska Training Center password",
    emailLayout({
      greeting: `Dear ${(u as { full_name: string }).full_name.split(" ")[0]},`,
      intro: "We received a request to reset your password. Use the button below to choose a new one. The link works once.",
      button: { label: "Set a new password", url: link },
      footnote: "If you didn't ask for this, you can ignore this email.",
    }),
  );
  return ok;
}

export async function setPassword(fd: FormData) {
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The passwords don't match." };
  const supabase = await authClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  const u = await getCurrentUser();
  redirect(u ? homeFor(u) : "/login");
}

// Switches the view in use: admins preview any role, others move between the roles they hold.
export async function setViewAs(fd: FormData) {
  const u = await getCurrentUser();
  if (!u || u.views.length < 2) redirect("/");
  const view = String(fd.get("view") ?? u.real_role) as Role;
  if (!u.views.includes(view)) redirect("/");
  const jar = await cookies();
  if (view !== u.real_role) jar.set(VIEW_COOKIE, view, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  else jar.delete(VIEW_COOKIE);
  redirect(homeFor({ ...u, role: view }));
}
