import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { UserAccessForm } from "@/components/user-access-form";
import { requireRole } from "@/lib/auth";
import { addTeamMember } from "../../actions";

export default async function NewUserPage() {
  await requireRole("admin");
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/admin/users" className="text-sm text-blue hover:underline">← Team &amp; access</Link>
      <PageHeader kicker="Team & access" title="Create user" lead="Add their details, choose the category they work in, then turn on what they can do." />
      <UserAccessForm action={addTeamMember} categories={["approver", "growth", "content", "admin"]} withWho submitLabel="Create & send invite" pendingLabel="Creating…" cancelHref="/admin/users" />
    </div>
  );
}
