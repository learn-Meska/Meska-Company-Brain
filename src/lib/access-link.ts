import "server-only";
import { db } from "./supabase";
import { siteUrl } from "./email";

// Builds a one-time link to /auth/confirm (invite or password reset) without using Supabase's own emails.
// Not a server action: it signs anyone in, so only code that has already checked access may call it.
export async function accessLink(email: string, kind: "invite" | "recovery") {
  const redirectTo = `${siteUrl()}/auth/set-password`;
  const { data, error } = await db().auth.admin.generateLink({ type: kind, email, options: { redirectTo } });
  if (error || !data?.properties?.hashed_token) throw new Error(error?.message ?? "Could not create link");
  return `${siteUrl()}/auth/confirm?token_hash=${data.properties.hashed_token}&type=${kind}`;
}
