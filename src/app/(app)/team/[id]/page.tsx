import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Form, Submit } from "@/components/form";
import { Banner } from "@/components/people-table";
import { UserAccessForm } from "@/components/user-access-form";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { isUuid } from "@/lib/format";
import { ledTeam, memberChangeError, TEAM_LABEL } from "@/lib/team-access";
import { activeLoginIds } from "@/lib/team-invite";
import { removeFromMyTeam, resendMyTeamInvite, setMemberAccess } from "../actions";

type M = { id: string; email: string; full_name: string; roles: string[] | null; team_admin_of: string[] | null; permissions: string[] | null };

export default async function MemberPage({ params, searchParams }: PageProps<"/team/[id]">) {
  const me = await requireUser();
  const team = ledTeam(me);
  if (!team) redirect("/");
  const { id } = await params;
  const { saved } = await searchParams;
  if (!isUuid(id)) notFound();
  const [{ data }, active] = await Promise.all([db().from("app_users").select("id, email, full_name, roles, team_admin_of, permissions").eq("id", id).maybeSingle(), activeLoginIds()]);
  const m = data as M | null;
  if (!m || !(m.roles ?? []).includes(team)) notFound();
  const label = TEAM_LABEL[team];
  const blocked = memberChangeError(me, team, m, "access");

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/team" className="text-sm text-blue hover:underline">← My team</Link>
      <PageHeader kicker={`${label} · ${active.has(m.id) ? "Active" : "Invited"}`} title={m.full_name} lead={m.email} />
      {saved && <Banner>Access saved.</Banner>}

      {blocked ? (
        <section className="ds-card p-5 text-sm text-ds-text">{blocked}</section>
      ) : (
        <UserAccessForm
          action={setMemberAccess}
          categories={[team]}
          initial={{ category: team, access: m.permissions ?? [], portalAdmin: (m.team_admin_of ?? []).includes(team) }}
          hidden={{ id: m.id }}
          submitLabel="Save access"
          pendingLabel="Saving…"
          cancelHref="/team"
        />
      )}

      {!(m.roles ?? []).includes("admin") && (
        <section className="ds-card space-y-4 p-5">
          <h2 className="text-base font-semibold text-ds-heading">Invitation &amp; removal</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ds-text">Send the set-your-password email again.</p>
            <Form action={resendMyTeamInvite}>
              <input type="hidden" name="id" value={m.id} />
              <Submit className="btn-ghost btn-sm" pending="Sending…">Resend invite</Submit>
            </Form>
          </div>
          {m.id !== me.id && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ds-border pt-4">
              <p className="text-sm text-ds-text">Take them out of {label}. Their name stays on past records.</p>
              <Form action={removeFromMyTeam}>
                <input type="hidden" name="id" value={m.id} />
                <Submit className="btn-danger btn-sm" pending="Removing…">Remove from {label}</Submit>
              </Form>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
