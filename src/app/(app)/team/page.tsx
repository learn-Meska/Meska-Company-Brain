import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Form, Submit } from "@/components/form";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { ledTeam, TEAM_LABEL } from "@/lib/team-access";
import { addToMyTeam, removeFromMyTeam, resendMyTeamInvite, setTeamAdmin } from "./actions";

type M = { id: string; email: string; full_name: string; roles: string[] | null; team_admin_of: string[] | null };

// "My team": a team admin adds, promotes and removes the people in the team they lead.
export default async function MyTeamPage() {
  const me = await requireUser();
  const team = ledTeam(me);
  if (!team) redirect("/");
  const label = TEAM_LABEL[team];
  const { data } = await db().from("app_users").select("id, email, full_name, roles, team_admin_of").contains("roles", [team]).order("full_name");
  const members = (data ?? []) as M[];
  const admins = members.filter((m) => (m.team_admin_of ?? []).includes(team)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="My team"
        title={label}
        lead={<>Add the people who work in {label}, and choose who else can manage the team. New people get an email to set their password. Company admins are managed in Team &amp; access.</>}
      />

      <div className="flex flex-wrap gap-2">
        <span className="ds-chip">{members.length} {members.length === 1 ? "person" : "people"}</span>
        <span className="ds-badge">{admins} team {admins === 1 ? "admin" : "admins"}</span>
      </div>

      <section className="ds-card p-5">
        <h2 className="h2 mb-3">Add someone to {label}</h2>
        <Form action={addToMyTeam} reset className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="team-name">Full name</label>
            <input id="team-name" name="full_name" required maxLength={120} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="team-email">Email</label>
            <input id="team-email" name="email" type="email" required className="input" />
          </div>
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" name="team_admin" /> Team admin
          </label>
          <Submit className="ds-btn ds-btn-primary" pending="Sending invite…">Add &amp; send invite</Submit>
        </Form>
      </section>

      <section className="ds-card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Access</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isCompanyAdmin = (m.roles ?? []).includes("admin");
              const isLead = (m.team_admin_of ?? []).includes(team);
              const isMe = m.id === me.id;
              return (
                <tr key={m.id}>
                  <td>
                    <div className="font-medium">
                      {m.full_name} {isMe && <span className="text-xs font-normal text-muted">(you)</span>}
                    </div>
                    <div className="text-xs text-muted">{m.email}</div>
                  </td>
                  <td>
                    {isCompanyAdmin ? <span className="ds-chip">Company admin</span> : isLead ? <span className="ds-chip">Team admin</span> : <span className="ds-badge">Member</span>}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {!isCompanyAdmin && (
                      <>
                        {!isMe && (
                          <Form action={setTeamAdmin} className="inline">
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="lead" value={isLead ? "0" : "1"} />
                            <Submit className="btn-ghost btn-sm" pending="Saving…">{isLead ? "Make member" : "Make team admin"}</Submit>
                          </Form>
                        )}{" "}
                        <Form action={resendMyTeamInvite} className="inline">
                          <input type="hidden" name="id" value={m.id} />
                          <Submit className="btn-ghost btn-sm" pending="Sending…">Resend invite</Submit>
                        </Form>{" "}
                        {!isMe && (
                          <Form action={removeFromMyTeam} className="inline">
                            <input type="hidden" name="id" value={m.id} />
                            <Submit className="btn-quiet btn-sm text-bad" pending="Removing…">Remove</Submit>
                          </Form>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {!members.length && (
              <tr>
                <td colSpan={3} className="py-8 text-center text-sm text-muted">No one in {label} yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
