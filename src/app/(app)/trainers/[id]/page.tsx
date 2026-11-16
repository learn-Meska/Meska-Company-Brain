import Link from "next/link";
import { notFound } from "next/navigation";
import { inviteTrainer } from "@/app/(app)/admin/actions";
import { Form, Submit } from "@/components/form";
import { ProfileView } from "@/components/profile";
import { fmtDateTime } from "@/lib/format";
import { canManageTrainers, requireAccess } from "@/lib/auth";
import { getTrainerProfiles } from "@/lib/scoring";

export default async function TrainerPage({ params }: PageProps<"/trainers/[id]">) {
  const me = await requireAccess("te.trainers", "te.find", "te.assign");
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
      {/* Training Excellence re-sends the invitation from here when a trainer lost it or the link expired. */}
      {canManageTrainers(me) && (
        <section className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="h2">Invitation</h2>
            <p className="text-sm text-muted">
              {!t.email
                ? "Add the trainer's email on Edit profile to send the invitation."
                : t.user_id
                  ? `Sent to ${t.email}${t.invited_at ? ` on ${fmtDateTime(t.invited_at)}` : ""}. Resend it if they lost the email or the link expired.`
                  : `Not sent yet. The invitation lets ${t.email} set a password and sign in.`}
            </p>
          </div>
          {t.email && (
            <Form action={inviteTrainer} className="text-right">
              <input type="hidden" name="id" value={t.id} />
              <Submit pending="Sending…">{t.user_id ? "Resend invitation" : "Send invitation"}</Submit>
            </Form>
          )}
        </section>
      )}
      <ProfileView t={t} />
    </div>
  );
}
