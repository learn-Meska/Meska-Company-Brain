// Creates (or re-links) the first admin and prints a one-time link to set the password.
// Usage: node --env-file=.env.local scripts/create-admin.mjs "Full Name" email@example.com
import { createClient } from "@supabase/supabase-js";

const [name, emailArg] = process.argv.slice(2);
if (!name || !emailArg) {
  console.error('Usage: node --env-file=.env.local scripts/create-admin.mjs "Full Name" email@example.com');
  process.exit(1);
}
const email = emailArg.toLowerCase();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

let { data: created, error } = await sb.auth.admin.createUser({ email, email_confirm: true });
let id = created?.user?.id;
if (error) {
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 });
  id = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
  if (!id) throw error;
}
const { error: e2 } = await sb.from("app_users").upsert({ id, email, full_name: name, role: "admin", can_manage_trainers: true });
if (e2) throw e2;
const site = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const { data: link, error: e3 } = await sb.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${site}/auth/set-password` } });
if (e3) throw e3;
console.log(`Admin ready: ${name} <${email}>`);
console.log(`Open this link once to set the password:\n${site}/auth/confirm?token_hash=${link.properties.hashed_token}&type=recovery`);
