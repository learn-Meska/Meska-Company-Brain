import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfileView } from "@/components/profile";
import { canManageTrainers, requireRole } from "@/lib/auth";
import { getTrainerProfiles } from "@/lib/scoring";

export default async function TrainerPage({ params }: PageProps<"/trainers/[id]">) {
  const me = await requireRole("admin", "approver", "growth");
  const { id } = await params;
  const [t] = await getTrainerProfiles([id]);
  if (!t) notFound();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/trainers" className="text-sm text-blue hover:underline">← All trainers</Link>
        <div className="flex flex-wrap gap-2">
          {t.cv_path && <a href={`/trainers/${id}/cv`} className="btn-ghost">⬇ Download CV</a>}
          <a href={`/trainers/${id}/bio`} className="btn-ghost">⬇ Profile PDF</a>
          {canManageTrainers(me) && <Link href={`/trainers/${id}/edit`} className="btn-ghost">Edit profile &amp; scores</Link>}
        </div>
      </div>
      <ProfileView t={t} />
    </div>
  );
}
