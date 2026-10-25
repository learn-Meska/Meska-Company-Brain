import { PageHeader } from "@/components/page-header";
import { Form, Submit } from "@/components/form";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { addTeamMember, removeTeamMember, resendTeamInvite, updateTeamMember } from "../actions";

type U = { id: string; email: string; full_name: string; role: string; roles: string[] | null; can_manage_trainers: boolean };

const ROLE_OPTIONS = [
  ["approver", "Booking manager"],
  ["growth", "Growth"],
  ["admin", "Admin"],
] as const;

function RoleBoxes({ checked }: { checked: string[] }) {
  return (
    <>
      {ROLE_OPTIONS.map(([v, l]) => (
        <label key={v} className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="roles" value={v} defaultChecked={checked.includes(v)} /> {l}
        </label>
      ))}
    </>
  );
}

export default async function UsersPage() {
  const me = await requireRole("admin");
  const { data } = await db().from("app_users").select("*").order("full_name");
  // trainers without team access are managed from their profile, not here
  const users = ((data ?? []) as U[]).filter((u) => (u.roles ?? []).length > 0);
  return (
    <div className="space-y-6">
      <PageHeader kicker="Access" title={<>Team &amp; access</>} lead={<>Booking managers (e.g. Amr Fahmy, Mahmoud) and admins book trainers; Growth finds trainers and downloads their profiles. Tick more than one role to give the same email several kinds of access; they switch between them from the menu. Trainers are invited from their profile page — a team member can be a trainer too.</>} />

      <section className="card">
        <h2 className="h2 mb-3">Add a team member</h2>
        <Form action={addTeamMember} reset className="grid gap-3 sm:grid-cols-2 sm:items-end">
          <div>
            <label className="label">Full name</label>
            <input name="full_name" required className="input" />
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" required className="input" />
          </div>
          <fieldset className="sm:col-span-2">
            <legend className="label">Access (tick one or more)</legend>
            <div className="flex flex-wrap gap-4">
              <RoleBoxes checked={["approver"]} />
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="can_manage_trainers" /> Can manage trainer profiles, scores and invitations
          </label>
          <Submit pending="Sending invite…">Add &amp; send invite</Submit>
        </Form>
      </section>

      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role &amp; permissions</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="font-medium">{u.full_name}</div>
                  <div className="text-xs text-muted">{u.email}</div>
                </td>
                <td>
                  <Form action={updateTeamMember} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <RoleBoxes checked={u.roles ?? [u.role]} />
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" name="can_manage_trainers" defaultChecked={u.can_manage_trainers} /> Manages trainers
                    </label>
                    <Submit className="btn-ghost btn-sm">Save</Submit>
                  </Form>
                </td>
                <td className="whitespace-nowrap text-right">
                  <Form action={resendTeamInvite} className="inline">
                    <input type="hidden" name="id" value={u.id} />
                    <Submit className="btn-ghost btn-sm" pending="Sending…">Resend invite</Submit>
                  </Form>{" "}
                  {u.id !== me.id && (
                    <Form action={removeTeamMember} className="inline">
                      <input type="hidden" name="id" value={u.id} />
                      <Submit className="btn-ghost btn-sm text-bad" pending="Removing…">Remove</Submit>
                    </Form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
