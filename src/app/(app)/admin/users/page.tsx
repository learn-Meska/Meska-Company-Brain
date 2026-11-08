import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PlusIcon } from "@/components/icons";
import { AccessChip, Banner, PeopleTable } from "@/components/people-table";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { inviteCutoff, isTeam, TEAM_LABEL, TEAMS } from "@/lib/team-access";
import { activeLoginIds } from "@/lib/team-invite";

type U = { id: string; email: string; full_name: string; roles: string[] | null; team_admin_of: string[] | null; permissions: string[] | null };

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requireRole("admin");
  const { added, unsent, removed, pending, category } = await searchParams;
  const since = inviteCutoff();
  const [{ data }, active, { data: invites }] = await Promise.all([
    db().from("app_users").select("id, email, full_name, roles, team_admin_of, permissions").order("full_name"),
    activeLoginIds(),
    db().from("access_invites").select("user_id, category").is("accepted_at", null).gte("created_at", since),
  ]);
  const waiting = new Map<string, string[]>();
  for (const i of (invites ?? []) as { user_id: string; category: string }[]) waiting.set(i.user_id, [...(waiting.get(i.user_id) ?? []), i.category]);
  // trainers without team access are managed from their profile, not here
  const users = ((data ?? []) as U[]).filter((u) => (u.roles ?? []).length > 0);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Access"
        title={<>Team &amp; access</>}
        lead={<>Everyone who works in the app, their category and what they can do. Open a person to change their access.</>}
        actions={
          <Link href="/admin/users/new" className="ds-btn ds-btn-primary">
            <PlusIcon size={16} /> Create user
          </Link>
        }
      />
      {typeof added === "string" && <Banner>User created. An invitation was emailed to <b>{added}</b>.</Banner>}
      {typeof pending === "string" && (
        <Banner>
          A confirmation email was sent to <b>{pending}</b>. They get <b>{typeof category === "string" ? category : "the new access"}</b> once they confirm it.
        </Banner>
      )}
      {typeof unsent === "string" && <Banner tone="warn">{pending ? "Saved" : "User created"}, but the email to <b>{unsent}</b> couldn&apos;t be sent. Open them and use “Resend invite”.</Banner>}
      {removed && <Banner>Access removed. They can no longer sign in to the team pages.</Banner>}

      <PeopleTable
        empty="No one yet. Use Create user to add the first person."
        hrefFor={(id) => `/admin/users/${id}`}
        people={users.map((u) => ({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          active: active.has(u.id),
          you: u.id === me.id,
          chips: (
            <>
              {(u.roles ?? []).includes("admin") && <span className="ds-chip">Company admin</span>}
              {TEAMS.filter((t) => (u.roles ?? []).includes(t)).map((t) => (
                <AccessChip key={t} team={t} picked={u.permissions ?? []} isAdmin={(u.team_admin_of ?? []).includes(t)} />
              ))}
              {(waiting.get(u.id) ?? []).map((c) => (
                <span key={c} className="badge bg-warn-bg text-warn">{isTeam(c) ? TEAM_LABEL[c] : "Company admin"} · waiting for confirmation</span>
              ))}
            </>
          ),
        }))}
      />
    </div>
  );
}
