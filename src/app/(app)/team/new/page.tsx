import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { UserAccessForm } from "@/components/user-access-form";
import { requireUser } from "@/lib/auth";
import { ledTeam, TEAM_LABEL } from "@/lib/team-access";
import { leaderChoices, teamPeople } from "@/lib/team-people";
import { addToMyTeam } from "../actions";

export default async function NewMemberPage() {
  const me = await requireUser();
  const team = ledTeam(me);
  if (!team) redirect("/");
  const leaders = leaderChoices(await teamPeople());
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/team" className="text-sm text-blue hover:underline">← My team</Link>
      <PageHeader kicker="My team" title={`Add someone to ${TEAM_LABEL[team]}`} lead="Add their details, choose their level, then turn on what they can do. A member is assigned to a team leader (you or another one)." />
      <UserAccessForm action={addToMyTeam} categories={[team]} leaders={leaders} withWho submitLabel="Add & send invite" pendingLabel="Adding…" cancelHref="/team" />
    </div>
  );
}
