import { CompensationCards, CompensationTable } from "@/components/compensation";
import { PageHeader } from "@/components/page-header";
import { requireTrainer } from "@/lib/auth";
import { COMPENSATION_COLUMNS, type CompensationLine } from "@/lib/compensation";
import { db, fetchAll } from "@/lib/supabase";

// A trainer sees only their own lines. Training Excellence enters them on /compensation.
export default async function MyCompensationPage() {
  const me = await requireTrainer();
  const { data, error } = await fetchAll<CompensationLine>((from, to) =>
    db().from("compensation_lines").select(COMPENSATION_COLUMNS).eq("trainer_id", me.trainer_id).order("training_date").order("id").range(from, to),
  );
  return (
    <div className="space-y-5">
      <PageHeader kicker="My compensation" title={<>My compensation</>} lead={<>Pay for the trainings you deliver. Other payments are handled by Finance outside the tool.</>} />
      {error ? (
        <p className="rounded-xl bg-bad-bg px-4 py-3 text-sm text-bad">Your compensation couldn&apos;t load. Please refresh and try again.</p>
      ) : (
        <>
          <CompensationCards lines={data} />
          <CompensationTable lines={data} empty="Nothing here yet. Training Excellence adds a line for each training you deliver." />
        </>
      )}
    </div>
  );
}
