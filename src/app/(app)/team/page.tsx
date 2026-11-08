import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PlusIcon } from "@/components/icons";
import { AccessChip, Banner, PeopleTable } from "@/components/people-table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { ledTeam, TEAM_LABEL } from "@/lib/team-access";
import { activeLoginIds } from "@/lib/team-invite";

type M = { id: string; email: string; full_name: string; roles: string[] | null; team_admin_of: string[] | null; permissions: string[] | null };

// "My team": a portal admin's list of the people in their portal.
export default async function MyTeamPage({ searchParams }: PageProps<"/team">) {
  const me = await requireUser();
  const team = ledTeam(me);
  if (!team) redirect("/");
  const { added, unsent, removed, pending } = await searchParams;
  const label = TEAM_LABEL[team];
  const [{ data }, active] = await Promise.all([
    db().from("app_users").select("id, email, full_name, roles, team_admin_of, permissions").contains("roles", [team]).order("full_name"),
    activeLoginIds(),
  ]);
  const members = (data ?? []) as M[];

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="My team"
        title={label}
        lead={<>The people in {label} and what each one can do. Open a person to change their access.</>}
        actions={
          <Link href="/team/new" className="ds-btn ds-btn-primary">
            <PlusIcon size={16} /> Add member
          </Link>
        }
      />
      {typeof added === "string" && <Banner>Member added. An email was sent to <b>{added}</b>.</Banner>}
      {typeof pending === "string" && <Banner><b>{pending}</b> already has an account, so they were emailed to confirm joining {label}. They appear here once they confirm.</Banner>}
      {typeof unsent === "string" && <Banner tone="warn">Member added, but the email to <b>{unsent}</b> couldn&apos;t be sent. Open them and use “Resend invite”.</Banner>}
      {removed && <Banner>Removed from {label}.</Banner>}

      <PeopleTable
        empty={`No one in ${label} yet. Use Add member to add the first person.`}
        hrefFor={(id) => `/team/${id}`}
        people={members.map((m) => ({
          id: m.id,
          full_name: m.full_name,
          email: m.email,
          active: active.has(m.id),
          you: m.id === me.id,
          chips: (m.roles ?? []).includes("admin") ? <span className="ds-chip">Company admin</span> : <AccessChip team={team} picked={m.permissions ?? []} isAdmin={(m.team_admin_of ?? []).includes(team)} />,
        }))}
      />
    </div>
  );
}
