import { PageHeader } from "@/components/page-header";
import { Form, Submit } from "@/components/form";
import { AccessPicker, AccessSummary } from "@/components/access-picker";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { TEAMS } from "@/lib/team-access";
import { addTeamMember, removeTeamMember, resendTeamInvite, updateTeamMember } from "../actions";

type U = { id: string; email: string; full_name: string; role: string; roles: string[] | null; team_admin_of: string[] | null; permissions: string[] | null };

// Every portal with its accesses; ticking the portal name puts the person in it.
function PortalFields({ u }: { u?: U }) {
  const roles = u?.roles ?? [];
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {TEAMS.map((t) => (
        <AccessPicker key={t} team={t} withRole inRole={roles.includes(t)} isAdmin={(u?.team_admin_of ?? []).includes(t)} picked={u?.permissions ?? []} />
      ))}
    </div>
  );
}

function CompanyAdminBox({ checked }: { checked: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="roles" value="admin" defaultChecked={checked} className="mt-0.5" />
      <span>
        <span className="font-semibold text-ds-heading">Company admin</span>
        <span className="block text-xs text-ds-text">Everything in every portal, plus Team &amp; access, feedback import and the activity log.</span>
      </span>
    </label>
  );
}

export default async function UsersPage() {
  const me = await requireRole("admin");
  const { data } = await db().from("app_users").select("*").order("full_name");
  // trainers without team access are managed from their profile, not here
  const users = ((data ?? []) as U[]).filter((u) => (u.roles ?? []).length > 0);
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Access"
        title={<>Team &amp; access</>}
        lead={<>Each portal (Training Excellence, Growth, Content) has its own accesses. A <b>portal admin</b> has all of them and can add members to the portal from <b>My team</b>; a member gets only the accesses ticked. One email can be in several portals and switches between them from the menu. Trainers are invited from their profile page.</>}
      />

      <section className="ds-card space-y-4 p-5">
        <h2 className="h2">Add a team member</h2>
        <Form action={addTeamMember} reset className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="new-name">Full name</label>
              <input id="new-name" name="full_name" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="new-email">Email</label>
              <input id="new-email" name="email" type="email" required className="input" />
            </div>
          </div>
          <p className="text-xs text-ds-text">Tick each portal the person works in, then their accesses there.</p>
          <PortalFields />
          <CompanyAdminBox checked={false} />
          <Submit className="ds-btn ds-btn-primary" pending="Sending invite…">Add &amp; send invite</Submit>
        </Form>
      </section>

      <section className="ds-card overflow-hidden">
        <ul className="divide-y divide-ds-border">
          {users.map((u) => {
            const roles = u.roles ?? [u.role];
            return (
              <li key={u.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-ds-heading">{u.full_name}</div>
                    <div className="text-xs text-muted">{u.email}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {roles.includes("admin") && <span className="ds-chip">Company admin</span>}
                      {TEAMS.filter((t) => roles.includes(t)).map((t) => (
                        <AccessSummary key={t} team={t} picked={u.permissions ?? []} isAdmin={(u.team_admin_of ?? []).includes(t)} />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Form action={resendTeamInvite} className="inline">
                      <input type="hidden" name="id" value={u.id} />
                      <Submit className="btn-ghost btn-sm" pending="Sending…">Resend invite</Submit>
                    </Form>
                    {u.id !== me.id && (
                      <Form action={removeTeamMember} className="inline">
                        <input type="hidden" name="id" value={u.id} />
                        <Submit className="btn-quiet btn-sm text-bad" pending="Removing…">Remove</Submit>
                      </Form>
                    )}
                  </div>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-blue">Edit access</summary>
                  <Form action={updateTeamMember} className="mt-3 space-y-4">
                    <input type="hidden" name="id" value={u.id} />
                    <PortalFields u={u} />
                    <CompanyAdminBox checked={roles.includes("admin")} />
                    <Submit className="ds-btn ds-btn-primary">Save access</Submit>
                  </Form>
                </details>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
