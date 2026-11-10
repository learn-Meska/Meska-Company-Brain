import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PlusIcon } from "@/components/icons";
import { AccessChip, Banner, PeopleTable } from "@/components/people-table";
import { requireUser } from "@/lib/auth";
import { leaderOf, leaderTeam, ledTeam, levelOf, TEAM_LABEL } from "@/lib/team-access";
import { activeLoginIds } from "@/lib/team-invite";
import { teamPeople } from "@/lib/team-people";

// "My team". A portal admin sees everyone in the portal, with their level and team leader, and manages them.
// A team leader sees the members assigned to them, read-only: accounts and access are the admin's job.
export default async function MyTeamPage({ searchParams }: PageProps<"/team">) {
  const me = await requireUser();
  const admin = ledTeam(me);
  const team = admin ?? leaderTeam(me);
  if (!team) redirect("/");
  const { added, unsent, removed, pending } = await searchParams;
  const label = TEAM_LABEL[team];
  const [people, active] = await Promise.all([teamPeople(), activeLoginIds()]);
  const inTeam = people.filter((p) => (p.roles ?? []).includes(team));
  // a leader's list: only the members assigned to them
  const members = admin ? inTeam : inTeam.filter((p) => levelOf(p, team) === "member" && p.reports_to?.[team] === me.id);
  const unassigned = admin ? inTeam.filter((p) => !(p.roles ?? []).includes("admin") && levelOf(p, team) === "member" && !leaderOf(p, team, people)).length : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="My team"
        title={label}
        lead={
          admin ? (
            <>The people in {label}, their level and what each one can do. Open a person to change their access, their level or their team leader.</>
          ) : (
            <>The members assigned to you in {label}. You see their deals; the portal admin creates accounts and changes access.</>
          )
        }
        actions={
          admin ? (
            <Link href="/team/new" className="ds-btn ds-btn-primary">
              <PlusIcon size={16} /> Add member
            </Link>
          ) : undefined
        }
      />
      {typeof added === "string" && <Banner>Member added. An email was sent to <b>{added}</b>.</Banner>}
      {typeof pending === "string" && <Banner><b>{pending}</b> already has an account, so they were emailed to confirm joining {label}. They appear here once they confirm.</Banner>}
      {typeof unsent === "string" && <Banner tone="warn">Member added, but the email to <b>{unsent}</b> couldn&apos;t be sent. Open them and use “Resend invite”.</Banner>}
      {removed && <Banner>Removed from {label}.</Banner>}
      {unassigned > 0 && (
        <Banner tone="warn">
          {unassigned} {unassigned === 1 ? "member has" : "members have"} no team leader yet. Open {unassigned === 1 ? "them" : "each one"} and choose the team leader they&apos;re assigned to.
        </Banner>
      )}

      <PeopleTable
        empty={admin ? `No one in ${label} yet. Use Add member to add the first person.` : "No member is assigned to you yet. The portal admin assigns members to team leaders."}
        hrefFor={admin ? (id) => `/team/${id}` : undefined}
        people={members.map((m) => ({
          id: m.id,
          full_name: m.full_name,
          email: m.email,
          active: active.has(m.id),
          you: m.id === me.id,
          chips: (m.roles ?? []).includes("admin") ? (
            <span className="ds-chip">Company admin</span>
          ) : (
            <AccessChip team={team} picked={m.permissions ?? []} level={levelOf(m, team)} leader={admin ? leaderOf(m, team, people)?.full_name : me.full_name} />
          ),
        }))}
      />
    </div>
  );
}
