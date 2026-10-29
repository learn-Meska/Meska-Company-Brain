"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { authClient, db } from "@/lib/supabase";
import { emailLayout, sendEmail } from "@/lib/email";
import { accessLink } from "@/lib/access-link";
import { getCurrentUser, homeFor, signedInFromEmailLink, VIEW_COOKIE, type Role } from "@/lib/auth";
import { cookies } from "next/headers";

export async function signIn(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const supabase = await authClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.status === 429) return { error: "Too many sign-in attempts. Please wait a few minutes and try again." };
    if (!error.status || error.status >= 500) return { error: "Sign-in is unavailable right now. Please try again shortly." };
    return { error: "Wrong email or password." };
  }
  const u = await getCurrentUser();
  if (!u) {
    await supabase.auth.signOut();
    return { error: "This account doesn't have access to the booking system." };
  }
  redirect(safeNext(String(fd.get("next") ?? "")) ?? homeFor(u));
}

// Only same-site paths. Browsers drop tabs/newlines and treat "\" like "/", so "/\t/evil.com"
// or "/\evil.com" would leave the site; anything with those characters is refused outright.
function safeNext(next: string) {
  if (!next.startsWith("/") || /[\x00-\x1f\\]/.test(next)) return null;
  const u = new URL(next, "http://local");
  // "/a/../..//evil.com" normalises to "//evil.com", so the final path is checked too.
  if (u.origin !== "http://local" || u.pathname.startsWith("//") || u.pathname.startsWith("/login") || u.pathname.startsWith("/auth/")) return null;
  return u.pathname + u.search + u.hash;
}

// Uses the one-time token from an invite or reset email and starts a session for setting the password.
export async function confirmLink(fd: FormData) {
  const token_hash = String(fd.get("token_hash") ?? "");
  const type = String(fd.get("type") ?? "");
  if (!token_hash || (type !== "invite" && type !== "recovery")) redirect("/login?expired=1");
  const supabase = await authClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  redirect(error ? "/login?expired=1" : "/auth/set-password");
}

export async function signOut() {
  const supabase = await authClient();
  await supabase.auth.signOut();
  (await cookies()).delete(VIEW_COOKIE);
  redirect("/login");
}

const RESET_SUBJECT = "Reset your Meska Company Brain password";

export async function requestReset(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 320);
  // Same answer, and the same speed, either way so the form can't be used to discover accounts:
  // the lookup and the email happen after the response is sent.
  const ok = { ok: "If that email has an account, a reset link is on its way." };
  if (!email.includes("@")) return ok;
  after(async () => {
    try {
      const { data: u } = await db().from("app_users").select("full_name").eq("email", email).maybeSingle();
      if (!u) return;
      // At most one reset email per address every 5 minutes, so the form can't flood an inbox or the Gmail quota.
      const since = new Date(Date.now() - 5 * 60_000).toISOString();
      const { count } = await db().from("email_outbox").select("id", { count: "exact", head: true }).eq("to_email", email).eq("subject", RESET_SUBJECT).gte("created_at", since);
      if (count) return;
      const link = await accessLink(email, "recovery");
      await sendEmail(
        email,
        RESET_SUBJECT,
        emailLayout({
          greeting: `Dear ${(u as { full_name: string }).full_name.split(" ")[0]},`,
          intro: "We received a request to reset your password. Use the button below to choose a new one. The link works once.",
          button: { label: "Set a new password", url: link },
          footnote: "If you didn't ask for this, you can ignore this email.",
        }),
      );
    } catch (e) {
      console.error("[reset email failed]", e instanceof Error ? e.message : e);
    }
  });
  return ok;
}

export async function setPassword(fd: FormData) {
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password.length > 72) return { error: "Use at most 72 characters." };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The passwords don't match." };
  const supabase = await authClient();
  if (!(await signedInFromEmailLink())) {
    const me = await getCurrentUser();
    if (!me) redirect("/login");
    const current = String(fd.get("current") ?? "");
    if (!current) return { error: "Enter your current password." };
    const { error: wrong } = await supabase.auth.signInWithPassword({ email: me.email, password: current });
    if (wrong) return { error: wrong.status === 429 ? "Too many attempts. Please wait a few minutes." : "Your current password isn't right." };
  }
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
