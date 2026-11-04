import Link from "next/link";
import { CompensationCards, CompensationTable } from "@/components/compensation";
import { Form, Submit } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { COMPENSATION_COLUMNS, COMPENSATION_STATUSES, COMPENSATION_STATUS_LABEL, type CompensationLine } from "@/lib/compensation";
import { isUuid, todayISO } from "@/lib/format";
import { db, fetchAll } from "@/lib/supabase";
import { addCompensation, deleteCompensation, updateCompensation } from "./actions";

type TrainerOption = { id: string; full_name: string };

function Fields({ trainers, line, trainerId }: { trainers: TrainerOption[]; line?: CompensationLine; trainerId: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="trainer_id">Trainer</label>
        <select id="trainer_id" name="trainer_id" required defaultValue={line?.trainer_id ?? trainerId} className="input">
          <option value="">Choose a trainer…</option>
          {trainers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="training">Training</label>
        <input id="training" name="training" required maxLength={200} defaultValue={line?.training} placeholder="e.g. Cairo Logistics Co., AI Strategy Workshop" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="training_date">Date</label>
        <input id="training_date" name="training_date" type="date" required defaultValue={line?.training_date ?? todayISO()} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="hours">Hours</label>
        <input id="hours" name="hours" inputMode="decimal" required defaultValue={line?.hours} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="rate">Rate (EGP per hour)</label>
        <input id="rate" name="rate" inputMode="decimal" required defaultValue={line?.rate} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="amount">Amount (EGP)</label>
        <input id="amount" name="amount" inputMode="decimal" required defaultValue={line?.amount} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={line?.status ?? "pending"} className="input">
          {COMPENSATION_STATUSES.map((s) => <option key={s} value={s}>{COMPENSATION_STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="payment_date">Payment date (optional)</label>
        <input id="payment_date" name="payment_date" type="date" defaultValue={line?.payment_date ?? ""} className="input" />
      </div>
    </div>
  );
}

// Training Excellence enters every line by hand; nothing here is calculated. Trainers see their own on /me/compensation.
export default async function CompensationPage({ searchParams }: PageProps<"/compensation">) {
  await requireRole("approver", "admin");
  const params = await searchParams;
  const trainer = isUuid(params.trainer) ? params.trainer : "";
  const editId = isUuid(params.edit) ? params.edit : "";

  const [lines, trainers] = await Promise.all([
    fetchAll<CompensationLine>((from, to) => db().from("compensation_lines").select(COMPENSATION_COLUMNS).order("training_date", { ascending: false }).order("id").range(from, to)),
    fetchAll<TrainerOption>((from, to) => db().from("trainers").select("id, full_name").order("full_name").order("id").range(from, to)),
  ]);
  if (lines.error || trainers.error) {
    console.error("[compensation]", lines.error ?? trainers.error);
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

  return (
    <div className="space-y-5">
      <PageHeader kicker="Training Excellence" title={<>Compensation</>} lead={<>Add what each trainer should be paid. Trainers see their own lines under My compensation.</>} />

      {editing ? (
        <section className="card">
          <h2 className="h2 mb-3">Edit line</h2>
          <Form action={updateCompensation}>
            <input type="hidden" name="id" value={editing.id} />
            <input type="hidden" name="filter" value={trainer} />
            <Fields key={editing.id} trainers={trainers.data} line={editing} trainerId={trainer} />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Submit>Save changes</Submit>
              <Link href={here} className="btn-ghost">Cancel</Link>
            </div>
          </Form>
          <Form action={deleteCompensation} className="mt-3 border-t border-line pt-3">
            <input type="hidden" name="id" value={editing.id} />
            <input type="hidden" name="filter" value={trainer} />
            <Submit className="btn-quiet btn-sm text-bad" pending="Deleting…">Delete this line</Submit>
          </Form>
        </section>
      ) : (
        <section className="card">
          <h2 className="h2 mb-3">Add a line</h2>
          <Form action={addCompensation} reset>
            <Fields trainers={trainers.data} trainerId={trainer} />
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
