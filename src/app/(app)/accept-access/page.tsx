import Link from "next/link";
import { Form, Submit } from "@/components/form";
import { CheckIcon, ShieldIcon } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { ACCESS, inviteProblem, isTeam, TEAM_LABEL } from "@/lib/team-access";
import { acceptAccess } from "./actions";

type Invite = { user_id: string; category: string; portal_admin: boolean; permissions: string[]; created_at: string; accepted_at: string | null; created_by: string | null };

// Where the "Confirm my access" email lands. Signing in first is handled by the sign-in redirect.
export default async function AcceptAccessPage({ searchParams }: PageProps<"/accept-access">) {
  const me = await requireUser();
  const { token } = await searchParams;
  const { data } = typeof token === "string" && token.length <= 100 ? await db().from("access_invites").select("user_id, category, portal_admin, permissions, created_at, accepted_at, created_by").eq("token", token).maybeSingle() : { data: null };
  const inv = data as Invite | null;
  const problem = inviteProblem(inv, me.id);
  const { data: by } = inv?.created_by ? await db().from("app_users").select("full_name").eq("id", inv.created_by).maybeSingle() : { data: null };
  const label = inv ? (isTeam(inv.category) ? TEAM_LABEL[inv.category] : "Company admin") : "";
  const list = inv && isTeam(inv.category) && !inv.portal_admin ? ACCESS[inv.category].filter((a) => inv.permissions.includes(a.key)) : [];

  return (
    <div className="mx-auto max-w-xl py-6">
      <section className="ds-card relative overflow-hidden p-6 sm:p-8">
        <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-ds-primary" />
        <span className="ds-icon-solid"><ShieldIcon /></span>
        {problem || !inv ? (
          <>
            <h1 className="mt-4 text-xl font-semibold text-ds-heading">Can&apos;t confirm this access</h1>
            <p className="mt-2 text-sm text-ds-text">{problem}</p>
            <Link href="/" className="ds-btn ds-btn-primary mt-6">Go to the app</Link>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-semibold text-ds-heading">Confirm your {label} access</h1>
            <p className="mt-2 text-sm text-ds-text">
              {(by as { full_name: string } | null)?.full_name ?? "An admin"} gave <b>{me.email}</b>{" "}
              {inv.category === "admin" ? "company admin access: everything in every portal." : inv.portal_admin ? `portal admin access to ${label}: every access, and managing its team.` : `these accesses in ${label}:`}
            </p>
            {list.length > 0 && (
              <ul className="mt-4 space-y-2">
                {list.map((a) => (
                  <li key={a.key} className="flex items-start gap-2.5 rounded-lg bg-ds-subtle/60 px-3 py-2">
                    <CheckIcon size={16} className="mt-0.5 flex-none text-ds-primary" />
                    <span>
                      <span className="block text-sm font-medium text-ds-heading">{a.label}</span>
                      <span className="block text-xs text-ds-text">{a.hint}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Form action={acceptAccess} className="mt-6 flex flex-wrap items-center gap-3">
              <input type="hidden" name="token" value={token as string} />
              <Submit className="ds-btn ds-btn-primary" pending="Confirming…">Confirm access</Submit>
              <Link href="/" className="btn-quiet">Not now</Link>
            </Form>
          </>
        )}
      </section>
    </div>
  );
}
