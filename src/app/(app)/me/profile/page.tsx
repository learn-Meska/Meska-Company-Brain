import { notFound } from "next/navigation";
import { TrainerForm } from "@/components/trainer-form";
import { TierBadge } from "@/components/profile";
import { CvUploader, PhotoUploader } from "@/components/photo-uploader";
import { requireTrainer } from "@/lib/auth";
import { initials } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { getTrainerProfiles } from "@/lib/scoring";
import { updateMyProfile } from "@/app/(app)/admin/actions";

export default async function EditMyProfilePage() {
  const me = await requireTrainer();
  const [t] = await getTrainerProfiles([me.trainer_id]);
  if (!t) notFound();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="h1">Edit my profile</h1>
        <TierBadge tier={t.tier} />
      </div>
      <p className="text-sm text-muted">This is the profile Growth shares with clients. Your email, status and scores are managed by Meska.</p>
      <section className="card grid gap-5 md:grid-cols-2">
        <PhotoUploader trainerId={t.id} url={await photoUrl(t.photo_path)} initials={initials(t.full_name)} />
        <CvUploader trainerId={t.id} cvName={t.cv_name} />
      </section>
      <TrainerForm action={updateMyProfile} t={t} self />
    </div>
  );
}
