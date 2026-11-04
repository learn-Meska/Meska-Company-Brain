import Link from "next/link";
import { CompensationCards, CompensationTable } from "@/components/compensation";
import { Form, Submit } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { CompensationFields, type TrainerOption, type TrainingOption } from "@/components/compensation-fields";
import { ASSIGNED_STATUSES, COMPENSATION_COLUMNS, trainingLabel, type CompensationLine } from "@/lib/compensation";
import { fmtDate, isUuid } from "@/lib/format";
import { db, fetchAll } from "@/lib/supabase";
import { addCompensation, deleteCompensation, updateCompensation } from "./actions";

type AssignedDay = { id: string; trainer_id: string; date: string; status: string } & Parameters<typeof trainingLabel>[0];

// Training Excellence chooses the trainer and one of their assigned trainings, and types the pay; nothing here is calculated.
// Trainers see their own lines on /me/compensation.
export default async function CompensationPage({ searchParams }: PageProps<"/compensation">) {
  await requireRole("approver", "admin");
  const params = await searchParams;
  const trainer = isUuid(params.trainer) ? params.trainer : "";
  const editId = isUuid(params.edit) ? params.edit : "";

  const [lines, trainers, assigned] = await Promise.all([
    fetchAll<CompensationLine>((from, to) => db().from("compensation_lines").select(COMPENSATION_COLUMNS).order("training_date", { ascending: false }).order("id").range(from, to)),
    fetchAll<TrainerOption>((from, to) => db().from("trainers").select("id, full_name").order("full_name").order("id").range(from, to)),
    fetchAll<AssignedDay>((from, to) =>
      db().from("bookings").select("id, trainer_id, date, status, program_name, day_number, batch_id, deals(company_name)").in("status", ASSIGNED_STATUSES).not("trainer_id", "is", null).order("date", { ascending: false }).order("id").range(from, to),
    ),
  ]);
  if (lines.error || trainers.error || assigned.error) {
    console.error("[compensation]", lines.error ?? trainers.error ?? assigned.error);
    return (
      <div className="space-y-5">
        <PageHeader kicker="Training Excellence" title={<>Compensation</>} />
        <p className="rounded-xl bg-bad-bg px-4 py-3 text-sm text-bad">Compensation couldn&apos;t load. Please refresh and try again.</p>
      </div>
    );
  }
  const names = new Map(trainers.data.map((t) => [t.id, t.full_name]));
  const shown = trainer ? lines.data.filter((l) => l.trainer_id === trainer) : lines.data;
  const editing = editId ? lines.data.find((l) => l.id === editId) : undefined;
  const here = trainer ? `/compensation?trainer=${trainer}` : "/compensation";

  // Flags days that already have a line, so a day isn't paid twice by mistake.
  const paidFor = new Set(lines.data.filter((l) => l.id !== editing?.id).map((l) => l.booking_id));
  const trainings: TrainingOption[] = assigned.data.map((b) => ({
    id: b.id,
    trainer_id: b.trainer_id,
    label: [fmtDate(b.date, { day: "numeric", month: "short", year: "numeric" }), trainingLabel(b), b.status === "awaiting_trainer" ? "not confirmed yet" : null, paidFor.has(b.id) ? "already added" : null].filter(Boolean).join(" · "),
  }));
  // A line being edited keeps its training in the list, even if that day was reassigned or cancelled since.
  if (editing?.booking_id && !assigned.data.some((b) => b.id === editing.booking_id && b.trainer_id === editing.trainer_id)) {
    trainings.unshift({ id: editing.booking_id, trainer_id: editing.trainer_id, label: `${fmtDate(editing.training_date, { day: "numeric", month: "short", year: "numeric" })} · ${editing.training}` });
  }

  return (
    <div className="space-y-5">
      <PageHeader kicker="Training Excellence" title={<>Compensation</>} lead={<>Add what each trainer should be paid. Trainers see their own lines under My compensation.</>} />

      {editing ? (
        <section className="card">
          <h2 className="h2 mb-3">Edit line</h2>
          <Form action={updateCompensation}>
            <input type="hidden" name="id" value={editing.id} />
            <input type="hidden" name="filter" value={trainer} />
            <CompensationFields key={editing.id} trainers={trainers.data} trainings={trainings} line={editing} trainerId={trainer} />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Submit>Save changes</Submit>
              <Link href={here} className="btn-ghost">Cancel</Link>
            </div>
          </Form>
          <Form action={deleteCompensation} className="mt-3 border-t border-line pt-3">
            <input type="hidden" name="id" value={editing.id} />
            <input type="hidden" name="filter" value={trainer} />
            <Submit className="btn-ghost btn-sm text-bad" pending="Deleting…">Delete this line</Submit>
          </Form>
        </section>
      ) : (
        <section className="card">
          <h2 className="h2 mb-3">Add a line</h2>
          <Form action={addCompensation} reset>
            <CompensationFields key={trainer} trainers={trainers.data} trainings={trainings} trainerId={trainer} />
            <div className="mt-4"><Submit>Add line</Submit></div>
          </Form>
        </section>
      )}

      <form className="flex flex-wrap items-center gap-2" action="/compensation">
        <select name="trainer" defaultValue={trainer} className="input w-56 py-1.5" aria-label="Trainer">
          <option value="">All trainers</option>
          {trainers.data.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
        <button className="btn-ghost btn-sm">Filter</button>
        {trainer && <Link href="/compensation" className="text-sm text-blue hover:underline">Clear</Link>}
      </form>

      <CompensationCards lines={shown} />
      <CompensationTable
        lines={shown}
        trainerName={(id) => names.get(id) ?? "Unknown trainer"}
        action={(l) => <Link href={`/compensation?${trainer ? `trainer=${trainer}&` : ""}edit=${l.id}`} className="text-blue hover:underline">Edit</Link>}
        empty="No lines yet. Add the first one above."
      />
    </div>
  );
}
