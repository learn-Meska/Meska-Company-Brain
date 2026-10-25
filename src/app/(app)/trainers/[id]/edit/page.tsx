import Link from "next/link";
import { notFound } from "next/navigation";
import { Form, Submit } from "@/components/form";
import { TierBadge } from "@/components/profile";
import { TrainerForm } from "@/components/trainer-form";
import { requireTrainerManager } from "@/lib/auth";
import { getTrainerProfiles } from "@/lib/scoring";
import { fmtDateTime, initials } from "@/lib/format";
import { CvUploader, PhotoUploader } from "@/components/photo-uploader";
import { photoUrl } from "@/lib/photos";
import { inviteTrainer, saveTrainerScores, updateTrainer } from "@/app/(app)/admin/actions";

export default async function EditTrainerPage({ params, searchParams }: PageProps<"/trainers/[id]/edit">) {
  await requireTrainerManager();
  const { id } = await params;
  const { created, uploadError } = await searchParams;
  const [t] = await getTrainerProfiles([id]);
  if (!t) notFound();
  return (
    <div className="space-y-5">
      <Link href={`/trainers/${id}`} className="text-sm text-blue hover:underline">← View profile</Link>
      {created && <p className="rounded-xl bg-good-bg px-4 py-3 text-sm text-good">Profile created. Add scores below, then send the invitation.</p>}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="h1">{t.full_name}</h1>
          <TierBadge tier={t.tier} />
          <span className="badge bg-surface2">Total {t.total}</span>
        </div>
        <a href={`/trainers/${t.id}/bio`} className="btn-ghost">Download profile (PDF)</a>
      </div>
      {typeof uploadError === "string" && <p className="rounded-xl bg-bad-bg px-4 py-3 text-sm text-bad">The profile was saved, but an upload failed: {uploadError} Try again below.</p>}
      <section className="card grid gap-5 md:grid-cols-2">
        <PhotoUploader trainerId={t.id} url={await photoUrl(t.photo_path)} initials={initials(t.full_name)} />
        <CvUploader trainerId={t.id} cvName={t.cv_name} />
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="h2">Login access</h2>
          <p className="text-sm text-muted">
            {t.user_id
              ? `Invited ${t.invited_at ? fmtDateTime(t.invited_at) : ""}. Re-send if they lost the email.`
              : "This trainer can't sign in yet. The invitation lets them set a password."}
          </p>
        </div>
        <Form action={inviteTrainer}>
          <input type="hidden" name="id" value={t.id} />
          <Submit pending="Sending…">{t.user_id ? "Re-send invitation" : "Send invitation"}</Submit>
        </Form>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <h2 className="h2 mb-1">Scores</h2>
          <p className="mb-3 text-xs text-muted">Out of 100. Feedback categories are calculated automatically.</p>
          <Form action={saveTrainerScores} className="space-y-2">
            <input type="hidden" name="id" value={t.id} />
            {t.categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface2 px-3 py-2">
                <span className="text-sm">
                  {c.name} <span className="text-xs text-faint">· {c.weight}%</span>
                </span>
                {c.source === "manual" ? (
                  <input name={`score_${c.id}`} type="number" min={0} max={100} step="any" defaultValue={c.score ?? ""} className="input w-24 py-1 text-right" />
                ) : (
                  <span className="text-sm tabular-nums text-muted">{c.score ?? "no data"} <span className="text-[11px]">(auto)</span></span>
                )}
              </div>
            ))}
            <div className="rounded-lg border border-dashed border-line px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="fixed_total" className="text-sm font-medium">Fixed total score <span className="text-xs font-normal text-faint">· optional</span></label>
                <input id="fixed_total" name="fixed_total" type="number" min={0} max={100} step="any" defaultValue={t.score_override ?? ""} placeholder="—" className="input w-24 py-1 text-right" />
              </div>
              <p className="mt-1 text-xs text-muted">Overrides the calculated total ({t.calculated_total}) and sets the tier. Leave empty to use the calculation.</p>
            </div>
            <Submit>Save scores</Submit>
          </Form>
        </section>

      </div>

      <div>
        <h2 className="h2 mb-2">Profile, skills &amp; tags</h2>
        <TrainerForm action={updateTrainer} t={t} />
      </div>
    </div>
  );
}
