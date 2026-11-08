import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Form, Submit } from "@/components/form";
import { PlusIcon } from "@/components/icons";
import { Banner } from "@/components/people-table";
import { UserAccessForm } from "@/components/user-access-form";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { fmtDateTime, isUuid } from "@/lib/format";
import { inviteCutoff, isCategory, TEAM_LABEL, type Category } from "@/lib/team-access";
import { activeLoginIds } from "@/lib/team-invite";
import { cancelAccessInvite, removeFromCategory, removeTeamMember, resendTeamInvite, updateTeamMember } from "../../actions";

type U = { id: string; email: string; full_name: string; roles: string[] | null; team_admin_of: string[] | null; permissions: string[] | null };

const ORDER: Category[] = ["approver", "growth", "content", "admin"];
const LABEL: Record<Category, string> = { ...TEAM_LABEL, admin: "Company admin" };

export default async function EditUserPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  const me = await requireRole("admin");
  const { id } = await params;
  const { category: asked, add, saved, pending, unsent } = await searchParams;
  if (!isUuid(id)) notFound();
  const since = inviteCutoff();
  const [{ data }, active, { data: invites }] = await Promise.all([
    db().from("app_users").select("id, email, full_name, roles, team_admin_of, permissions").eq("id", id).maybeSingle(),
    activeLoginIds(),
    db().from("access_invites").select("category, created_at").eq("user_id", id).is("accepted_at", null).gte("created_at", since).order("created_at"),
  ]);
  const waiting = ((invites ?? []) as { category: string; created_at: string }[]).filter((i) => isCategory(i.category)) as { category: Category; created_at: string }[];
  const u = data as U | null;
  if (!u || !(u.roles ?? []).length) notFound();

  const held = ORDER.filter((c) => (u.roles ?? []).includes(c));
  const adding = add === "1";
  const current: Category | null = adding ? null : isCategory(asked) && held.includes(asked) ? asked : (held[0] ?? null);
  const base = `/admin/users/${u.id}`;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/admin/users" className="text-sm text-blue hover:underline">← Team &amp; access</Link>
      <PageHeader kicker={active.has(u.id) ? "Active" : "Invited"} title={u.full_name} lead={u.email} />
      {saved && <Banner>Access saved.</Banner>}
      {typeof pending === "string" && <Banner>A confirmation email was sent. They get <b>{typeof asked === "string" ? asked : "the new access"}</b> once they confirm it.</Banner>}
      {typeof unsent === "string" && <Banner tone="warn">The confirmation was saved, but the email to <b>{unsent}</b> couldn&apos;t be sent. Add the category again to resend it.</Banner>}
      {waiting.length > 0 && (
        <section className="ds-card divide-y divide-ds-border overflow-hidden">
          {waiting.map((w) => (
            <div key={w.category} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <p className="text-sm text-ds-heading">
                <span className="badge mr-2 bg-warn-bg text-warn">Waiting for confirmation</span>
                <b>{LABEL[w.category]}</b> <span className="text-ds-text">· sent {fmtDateTime(w.created_at)}</span>
              </p>
              <Form action={cancelAccessInvite}>
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="category" value={w.category} />
                <Submit className="btn-quiet btn-sm text-bad" pending="Cancelling…">Cancel</Submit>
              </Form>
            </div>
          ))}
        </section>
      )}

      <nav className="flex flex-wrap items-center gap-2" aria-label="Categories">
        {held.map((c) => (
          <Link key={c} href={`${base}?category=${c}`} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${c === current ? "bg-ds-primary text-white" : "border border-ds-border bg-ds-surface text-ds-heading hover:border-ds-primary/50"}`}>
            {LABEL[c]}
          </Link>
        ))}
        {held.length < ORDER.length && (
          <Link href={`${base}?add=1`} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium ${adding ? "bg-ds-primary text-white" : "text-ds-primary hover:bg-ds-primary-soft"}`}>
            <PlusIcon size={14} /> Add category
          </Link>
        )}
      </nav>

      {adding ? (
        <UserAccessForm
          key="add"
          action={updateTeamMember}
          categories={ORDER.filter((c) => !held.includes(c))}
          hidden={{ id: u.id }}
          submitLabel="Add category"
          pendingLabel="Saving…"
          cancelHref={base}
        />
      ) : (
        current && (
          <UserAccessForm
            key={current}
            action={updateTeamMember}
            categories={[current]}
            initial={{ category: current, access: u.permissions ?? [], portalAdmin: current !== "admin" && (u.team_admin_of ?? []).includes(current) }}
            hidden={{ id: u.id }}
            submitLabel="Save access"
            pendingLabel="Saving…"
            cancelHref="/admin/users"
          />
        )
      )}

      <section className="ds-card space-y-4 border-ds-danger/30 p-5">
        <h2 className="text-base font-semibold text-ds-heading">Invitation &amp; removal</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ds-text">Send the set-your-password email again.</p>
          <Form action={resendTeamInvite}>
            <input type="hidden" name="id" value={u.id} />
            <Submit className="btn-ghost btn-sm" pending="Sending…">Resend invite</Submit>
          </Form>
        </div>
        {current && held.length > 1 && !(u.id === me.id && current === "admin") && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ds-border pt-4">
            <p className="text-sm text-ds-text">Take them out of {LABEL[current]} only. Their other categories stay.</p>
            <Form action={removeFromCategory}>
              <input type="hidden" name="id" value={u.id} />
              <input type="hidden" name="category" value={current} />
              <Submit className="btn-quiet btn-sm text-bad" pending="Removing…">Remove from {LABEL[current]}</Submit>
            </Form>
          </div>
        )}
        {u.id !== me.id && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ds-border pt-4">
            <p className="text-sm text-ds-text">Remove all their access. Their name stays on past records.</p>
            <Form action={removeTeamMember}>
              <input type="hidden" name="id" value={u.id} />
              <Submit className="btn-danger btn-sm" pending="Removing…">Remove user</Submit>
            </Form>
          </div>
        )}
      </section>
    </div>
  );
}
