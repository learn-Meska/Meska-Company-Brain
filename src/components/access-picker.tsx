import { ACCESS, TEAM_LABEL, type Team } from "@/lib/team-access";

// The accesses of one portal as tick boxes (form fields "access" and "team_admin").
// Portal admins get every access, so their boxes are informational; the server ignores them.
export function AccessPicker({ team, picked, isAdmin, withRole, inRole }: { team: Team; picked: string[]; isAdmin: boolean; withRole?: boolean; inRole?: boolean }) {
  return (
    <fieldset className="rounded-xl border border-ds-border p-4">
      <legend className="px-1 text-sm font-semibold text-ds-heading">
        {withRole ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="roles" value={team} defaultChecked={inRole} /> {TEAM_LABEL[team]}
          </label>
        ) : (
          TEAM_LABEL[team]
        )}
      </legend>
      <label className="mb-3 flex items-start gap-2 rounded-lg bg-ds-primary-soft px-3 py-2 text-sm">
        <input type="checkbox" name="team_admin" value={team} defaultChecked={isAdmin} className="mt-0.5" />
        <span>
          <span className="font-semibold text-ds-primary">Portal admin</span>
          <span className="block text-xs text-ds-text">Has every access below and can add members and set their accesses.</span>
        </span>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        {ACCESS[team].map((a) => (
          <label key={a.key} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="access" value={a.key} defaultChecked={isAdmin || picked.includes(a.key)} className="mt-0.5" />
            <span>
              <span className="font-medium text-ds-heading">{a.label}</span>
              <span className="block text-xs text-ds-text">{a.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// A short summary of someone's access in one portal, for tables.
export function AccessSummary({ team, picked, isAdmin }: { team: Team; picked: string[]; isAdmin: boolean }) {
  const total = ACCESS[team].length;
  const n = ACCESS[team].filter((a) => picked.includes(a.key)).length;
  return (
    <span className={isAdmin ? "ds-chip" : "ds-badge"}>
      {TEAM_LABEL[team]} · {isAdmin ? "Portal admin" : `${n} of ${total} accesses`}
    </span>
  );
}
