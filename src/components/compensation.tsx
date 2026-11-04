import type { ReactNode } from "react";
import { COMPENSATION_STATUS_LABEL, egp, summarizeCompensation, type CompensationLine, type CompensationStatus } from "@/lib/compensation";
import { fmtDate, todayISO } from "@/lib/format";

const STATUS_STYLE: Record<CompensationStatus, string> = { pending: "bg-warn-bg text-warn", approved: "bg-[#E2EBFE] text-royal", paid: "bg-good-bg text-good" };
const SHORT_DATE = { day: "numeric", month: "short", year: "numeric" } as const;

export function CompensationStatusBadge({ status }: { status: CompensationStatus }) {
  return <span className={`badge ${STATUS_STYLE[status]}`}>{COMPENSATION_STATUS_LABEL[status]}</span>;
}

function Card({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-sm text-muted">{note}</p>
    </div>
  );
}

export function CompensationCards({ lines }: { lines: CompensationLine[] }) {
  const month = todayISO().slice(0, 7);
  const s = summarizeCompensation(lines, month);
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card label="Next payment" value={egp(s.nextPayment)} note={s.nextPaymentDate ? `On ${fmtDate(s.nextPaymentDate, SHORT_DATE)}` : "No payment date yet"} />
      <Card label="Waiting for approval" value={egp(s.waiting)} note="Approved by Training Excellence before payment" />
      <Card label={`Hours delivered in ${fmtDate(`${month}-01`, { month: "long" })}`} value={s.hours.toLocaleString("en-US")} note={`Across ${s.days} training ${s.days === 1 ? "day" : "days"}`} />
    </div>
  );
}

// The same table for the trainer and for Training Excellence, who also get a trainer column and an edit link.
export function CompensationTable({ lines, trainerName, action, empty }: { lines: CompensationLine[]; trainerName?: (id: string) => string; action?: (line: CompensationLine) => ReactNode; empty: string }) {
  const columns = 6 + (trainerName ? 1 : 0) + (action ? 1 : 0);
  return (
    <section className="card">
      <h2 className="h2">Delivered trainings</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {trainerName && <th>Trainer</th>}
              <th>Date</th><th>Training</th><th>Hours</th><th>Rate</th><th>Amount</th><th>Status</th>
              {action && <th><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                {trainerName && <td className="text-sm">{trainerName(l.trainer_id)}</td>}
                <td className="whitespace-nowrap text-sm">{fmtDate(l.training_date, SHORT_DATE)}</td>
                <td className="text-sm">{l.training}</td>
                <td className="text-sm tabular-nums">{Number(l.hours).toLocaleString("en-US")}</td>
                <td className="whitespace-nowrap text-sm tabular-nums">{egp(l.rate)}/h</td>
                <td className="whitespace-nowrap text-sm tabular-nums">{egp(l.amount)}</td>
                <td><CompensationStatusBadge status={l.status} /></td>
                {action && <td className="text-right text-sm">{action(l)}</td>}
              </tr>
            ))}
            {!lines.length && <tr><td colSpan={columns} className="text-sm text-muted">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
