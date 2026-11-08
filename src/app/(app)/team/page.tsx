import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Form, Submit } from "@/components/form";
import { AccessPicker, AccessSummary } from "@/components/access-picker";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { ledTeam, TEAM_LABEL } from "@/lib/team-access";
import { addToMyTeam, removeFromMyTeam, resendMyTeamInvite, setMemberAccess } from "./actions";

type M = { id: string; email: string; full_name: string; roles: string[] | null; team_admin_of: string[] | null; permissions: string[] | null };

// "My team": a portal admin adds people to their portal and chooses what each one can do.
export default async function MyTeamPage() {
  const me = await requireUser();
  const team = ledTeam(me);
  if (!team) redirect("/");
  const label = TEAM_LABEL[team];
  const { data } = await db().from("app_users").select("id, email, full_name, roles, team_admin_of, permissions").contains("roles", [team]).order("full_name");
  const members = (data ?? []) as M[];
  const admins = members.filter((m) => (m.team_admin_of ?? []).includes(team)).length;

  return (
    <div className="space-y-6">
      <PageHeader kicker="My team" title={label} lead={<>Add the people who work in {label} and choose their accesses. A portal admin has every access and can manage the team too. New people get an email to set their password.</>} />

      <div className="flex flex-wrap gap-2">
        <span className="ds-chip">{members.length} {members.length === 1 ? "person" : "people"}</span>
        <span className="ds-badge">{admins} portal {admins === 1 ? "admin" : "admins"}</span>
      </div>

      <section className="ds-card space-y-4 p-5">
        <h2 className="h2">Add someone to {label}</h2>
        <Form action={addToMyTeam} reset className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="team-name">Full name</label>
              <input id="team-name" name="full_name" required maxLength={120} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="team-email">Email</label>
              <input id="team-email" name="email" type="email" required className="input" />
            </div>
          </div>
          <AccessPicker team={team} picked={[]} isAdmin={false} />
          <Submit className="ds-btn ds-btn-primary" pending="Sending invite…">Add &amp; send invite</Submit>
        </Form>
      </section>

      <section className="ds-card overflow-hidden">
        <ul className="divide-y divide-ds-border">
          {members.map((m) => {
            const isCompanyAdmin = (m.roles ?? []).includes("admin");
            const isLead = (m.team_admin_of ?? []).includes(team);
            const isMe = m.id === me.id;
            const locked = isCompanyAdmin || isMe;
            return (
              <li key={m.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-ds-heading">
                      {m.full_name} {isMe && <span className="text-xs font-normal text-muted">(you)</span>}
                    </div>
                    <div className="text-xs text-muted">{m.email}</div>
                    <div className="mt-2">{isCompanyAdmin ? <span className="ds-chip">Company admin</span> : <AccessSummary team={team} picked={m.permissions ?? []} isAdmin={isLead} />}</div>
                  </div>
                  {!isCompanyAdmin && (
                    <div className="flex flex-wrap gap-1">
                      <Form action={resendMyTeamInvite} className="inline">
                        <input type="hidden" name="id" value={m.id} />
                        <Submit className="btn-ghost btn-sm" pending="Sending…">Resend invite</Submit>
                      </Form>
                      {!isMe && (
                        <Form action={removeFromMyTeam} className="inline">
                          <input type="hidden" name="id" value={m.id} />
                          <Submit className="btn-quiet btn-sm text-bad" pending="Removing…">Remove</Submit>
                        </Form>
                      )}
                    </div>
                  )}
                </div>
                {!locked && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium text-blue">Edit access</summary>
                    <Form action={setMemberAccess} className="mt-3 space-y-3">
                      <input type="hidden" name="id" value={m.id} />
                      <AccessPicker team={team} picked={m.permissions ?? []} isAdmin={isLead} />
                      <Submit className="ds-btn ds-btn-primary">Save access</Submit>
                    </Form>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
