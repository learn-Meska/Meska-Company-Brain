import { PageHeader } from "@/components/page-header";
import { Form, Submit } from "@/components/form";
import { B2CUploader } from "@/components/b2c-uploader";
import { requireRole } from "@/lib/auth";
import { db, fetchAll } from "@/lib/supabase";
import { fmtDate } from "@/lib/format";
import { B2C_COLUMNS, B2C_SHEET, B2C_STATUS, type B2CStatus } from "@/lib/b2c";
import { removeB2CCohort } from "./actions";

type S = { program: string; cohort: string; date: string; status: B2CStatus; delivered: boolean; trainer_id: string | null; trainer_name: string | null };

const short = (d: string) => fmtDate(d, { day: "numeric", month: "short", year: "numeric" });

const GUIDE: [string, string][] = [
  ["Program", "Program name, e.g. AI Copilot Diploma"],
  ["Cohort", "Cohort code, e.g. W16 or O12"],
  ["Format", "Online or Offline"],
  ["Day #", "Day number in the cohort (1, 2, 3…); Program + Cohort + Day # is one session"],
  ["Session", "What the day is, e.g. Onboarding, Session 1, Q&A 1"],
  ["Date", "An Excel date"],
  ["Weekday", "Formula from Date; not read"],
  ["Start / End", "Excel times, End after Start"],
  ["Location", "Online, a venue, or — for none"],
  ["Trainer", "Trainer's name as on their profile (linked when it matches)"],
  ["Status", Object.values(B2C_STATUS).join(", ")],
  ["Delivered", "Yes or No (Yes only for Confirmed)"],
];

export default async function B2CPage() {
  await requireRole("admin");
  const { data } = await fetchAll<S>((from, to) => db().from("b2c_sessions").select("program, cohort, date, status, delivered, trainer_id, trainer_name").order("id").range(from, to));
  const cohorts = new Map<string, { program: string; cohort: string; sessions: number; first: string; last: string; delivered: number; needs: number; unlinked: number }>();
  for (const s of data) {
    const k = `${s.program}|${s.cohort}`;
    const c = cohorts.get(k) ?? { program: s.program, cohort: s.cohort, sessions: 0, first: s.date, last: s.date, delivered: 0, needs: 0, unlinked: 0 };
    c.sessions++;
    if (s.date < c.first) c.first = s.date;
    if (s.date > c.last) c.last = s.date;
    if (s.delivered) c.delivered++;
    if (s.status === "needs_trainer") c.needs++;
    if (s.trainer_name && !s.trainer_id) c.unlinked++;
    cohorts.set(k, c);
  }
  const list = [...cohorts.values()].sort((a, b) => b.first.localeCompare(a.first));
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="B2C"
        title={<>Add B2C data</>}
        lead={<>Upload the {B2C_SHEET} Excel sheet. The file is checked against the template first; after you upload it, every session shows on the calendar as a B2C training. Uploading the sheet again updates the sessions already there.</>}
      />
      <section className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ds-heading">Upload sessions</h2>
            <p className="text-sm text-muted">Sheet &quot;{B2C_SHEET}&quot;, columns A to M: {B2C_COLUMNS.join(", ")}. Other sheets (like Summary) are ignored.</p>
          </div>
          <a href="/admin/b2c/template" className="btn-ghost btn-sm">Download empty template</a>
        </div>
        <B2CUploader />
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-ink">What each column needs</summary>
          <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
            {GUIDE.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold text-ink">{k}</dt>
                <dd className="text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>
      <section className="card overflow-x-auto p-0">
        <div className="px-4 pt-4 pb-2">
          <h2 className="text-base font-semibold text-ds-heading">Uploaded cohorts</h2>
          <p className="text-sm text-muted">{data.length} session{data.length === 1 ? "" : "s"} in {list.length} cohort{list.length === 1 ? "" : "s"}.</p>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Program</th>
              <th>Cohort</th>
              <th className="text-right">Sessions</th>
              <th>Dates</th>
              <th className="text-right">Delivered</th>
              <th className="text-right">Needs trainer</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">No B2C sessions uploaded yet.</td>
              </tr>
            )}
            {list.map((c) => (
              <tr key={c.program + c.cohort}>
                <td className="font-medium">{c.program}</td>
                <td>
                  {c.cohort}
                  {c.unlinked > 0 && <div className="text-xs text-muted">{c.unlinked} without a trainer profile</div>}
                </td>
                <td className="text-right tabular-nums">{c.sessions}</td>
                <td className="whitespace-nowrap">{short(c.first)} – {short(c.last)}</td>
                <td className="text-right tabular-nums">{c.delivered}</td>
                <td className="text-right tabular-nums">{c.needs}</td>
                <td className="text-right">
                  <Form action={removeB2CCohort}>
                    <input type="hidden" name="program" value={c.program} />
                    <input type="hidden" name="cohort" value={c.cohort} />
                    <Submit className="btn-ghost btn-sm" pending="Removing…">Remove</Submit>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
