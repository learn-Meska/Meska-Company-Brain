import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { UserAccessForm } from "@/components/user-access-form";
import { requireUser } from "@/lib/auth";
import { ledTeam, TEAM_LABEL } from "@/lib/team-access";
import { addToMyTeam } from "../actions";

export default async function NewMemberPage() {
  const me = await requireUser();
  const team = ledTeam(me);
  if (!team) redirect("/");
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/team" className="text-sm text-blue hover:underline">← My team</Link>
      <PageHeader kicker="My team" title={`Add someone to ${TEAM_LABEL[team]}`} lead="Add their details, then turn on what they can do." />
      <UserAccessForm action={addToMyTeam} categories={[team]} withWho submitLabel="Add & send invite" pendingLabel="Adding…" cancelHref="/team" />
    </div>
  );
}
