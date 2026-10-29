import { PageHeader } from "@/components/page-header";
import { Form, Submit } from "@/components/form";
import { requireRole } from "@/lib/auth";
import { db, fetchAll } from "@/lib/supabase";
import { fmtDate } from "@/lib/format";
import { importFeedback } from "../actions";

type F = { id: string; trainer_name: string; client: string | null; program: string | null; session_date: string | null; responses: number; delivery: number | null; content: number | null };

export default async function FeedbackPage() {
  await requireRole("admin");
  const { data } = await fetchAll((from, to) => db().from("feedback_sessions").select("*").order("session_date", { ascending: false }).order("id").range(from, to));
  const rows = (data ?? []) as F[];
  return (
    <div className="space-y-6">
      <PageHeader kicker="Feedback" title={<>Feedback import</>} lead={<>Trainer feedback comes from the Meska Trainer Scorecard. Download the scorecard page (or its data) and upload it here whenever it&apos;s updated;
          sessions are matched to trainers by name and re-importing never creates duplicates.</>} />
      <section className="card">
        <Form action={importFeedback} className="space-y-3">
          <div>
            <label className="label">Scorecard file (.html or .json)</label>
            <input type="file" name="file" accept=".html,.htm,.json,text/html,application/json" className="input" />
          </div>
          <div>
            <label className="label">…or paste the data</label>
            <textarea name="json" rows={4} className="input font-mono text-xs" placeholder='{"sessions": [...]}' />
          </div>
          <Submit pending="Importing…">Import feedback</Submit>
        </Form>
      </section>
      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Trainer</th>
              <th>Client · program</th>
              <th className="text-right">Responses</th>
              <th className="text-right">Delivery /5</th>
              <th className="text-right">Content /5</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted">No feedback imported yet.</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{r.session_date ? fmtDate(r.session_date, { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                <td className="font-medium">{r.trainer_name}</td>
                <td>
                  <div>{r.client}</div>
                  <div className="text-xs text-muted">{r.program}</div>
                </td>
                <td className="text-right tabular-nums">{r.responses}</td>
                <td className="text-right tabular-nums">{r.delivery != null ? Number(r.delivery).toFixed(2) : "—"}</td>
                <td className="text-right tabular-nums">{r.content != null ? Number(r.content).toFixed(2) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
