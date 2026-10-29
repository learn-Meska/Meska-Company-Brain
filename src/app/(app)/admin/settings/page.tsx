import { PageHeader } from "@/components/page-header";
import { Form, Submit } from "@/components/form";
import { requireSettingsEditor } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { getSetting, getTiers, type Category } from "@/lib/scoring";
import {
  addLookup,
  addSkill,
  deleteCategory,
  deleteLookup,
  deleteSkill,
  deleteTier,
  saveCategory,
  saveRules,
  saveTier,
} from "../actions";

type Lookup = { id: string; kind: string; name: string };

const SOURCE_LABEL = { manual: "Entered by admin", feedback: "From client feedback" };

export default async function SettingsPage() {
  await requireSettingsEditor();
  const [{ data: skills }, { data: lookups }, { data: cats }, tiers, cancel, response, deadline] = await Promise.all([
    db().from("skills").select("*").order("name"),
    db().from("lookups").select("*").order("sort"),
    db().from("score_categories").select("*").order("sort"),
    getTiers(),
    getSetting("cancellation", { notice_hours: 48, min_reason_chars: 150 }),
    getSetting("trainer_response", { hours: 48 }),
    getSetting("availability_deadline", { day_of_month: 25 }),
  ]);
  const L = (lookups ?? []) as Lookup[];
  const categories = (cats ?? []) as Category[];
  const totalWeight = categories.reduce((s, c) => s + Number(c.weight), 0);
  const audience = L.filter((l) => l.kind === "audience");

  return (
    <div className="space-y-6">
      <PageHeader kicker="Setup" title={<>Scoring &amp; lists</>} lead={<>Skills, filter lists, score categories and weights, tiers and booking rules.</>} />

      <section className="card">
        <h2 className="h2">Skills</h2>
        <p className="mb-3 text-sm text-muted">Growth picks the skills a training needs; only trainers with all of them are shown.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {((skills ?? []) as { id: string; name: string }[]).map((s) => (
            <Form key={s.id} action={deleteSkill} className="chip gap-1.5">
              <input type="hidden" name="id" value={s.id} />
              {s.name}
              <button className="text-faint hover:text-bad" title="Remove skill">×</button>
            </Form>
          ))}
        </div>
        <Form action={addSkill} reset className="flex max-w-md gap-2">
          <input name="name" placeholder="New skill, e.g. AI for Legal" className="input" required />
          <Submit className="btn whitespace-nowrap">Add skill</Submit>
        </Form>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {(["audience", "function", "industry"] as const).map((kind) => (
          <div key={kind} className="card">
            <h2 className="h2">{{ audience: "Audience levels", function: "Functions", industry: "Industries" }[kind]}</h2>
            <div className="my-3 flex flex-wrap gap-2">
              {L.filter((l) => l.kind === kind).map((l) => (
                <Form key={l.id} action={deleteLookup} className="chip gap-1.5">
                  <input type="hidden" name="id" value={l.id} />
                  {l.name}
                  <button className="text-faint hover:text-bad" title="Remove">×</button>
                </Form>
              ))}
            </div>
            <Form action={addLookup} reset className="flex gap-2">
              <input type="hidden" name="kind" value={kind} />
              <input name="name" placeholder="Add…" className="input" required />
              <Submit className="btn-ghost">Add</Submit>
            </Form>
          </div>
        ))}
      </section>

      {(
        <>
          <section className="card">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="h2">Score categories</h2>
                <p className="text-sm text-muted">Each category is scored out of 100. The total is the weighted average.</p>
              </div>
              <span className={`badge ${totalWeight === 100 ? "bg-good-bg text-good" : "bg-warn-bg text-warn"}`}>Total weight: {totalWeight}%</span>
            </div>
            <div className="space-y-2">
              {categories.map((c) => (
                <div key={c.id} className="flex flex-wrap items-end gap-2 rounded-xl bg-surface2 p-3">
                  <Form action={saveCategory} className="flex flex-1 flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <div className="min-w-48 flex-1">
                      <label className="label">Name</label>
                      <input name="name" defaultValue={c.name} className="input" />
                    </div>
                    <div className="w-24">
                      <label className="label">Weight %</label>
                      <input name="weight" type="number" step="any" min={0} defaultValue={c.weight} className="input" />
                    </div>
                    <div className="w-64">
                      <label className="label">Score comes from</label>
                      <select name="source" defaultValue={c.source} className="input">
                        {Object.entries(SOURCE_LABEL).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <Submit className="btn-ghost">Save</Submit>
                  </Form>
                  <Form action={deleteCategory}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="btn-ghost text-bad">Delete</button>
                  </Form>
                </div>
              ))}
              <Form action={saveCategory} reset className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line p-3">
                <div className="min-w-48 flex-1">
                  <label className="label">New category</label>
                  <input name="name" placeholder="e.g. Content knowledge" className="input" required />
                </div>
                <div className="w-24">
                  <label className="label">Weight %</label>
                  <input name="weight" type="number" step="any" min={0} className="input" required />
                </div>
                <div className="w-64">
                  <label className="label">Score comes from</label>
                  <select name="source" className="input">
                    {Object.entries(SOURCE_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <Submit>Add category</Submit>
              </Form>
            </div>
          </section>

          <section className="card">
            <h2 className="h2">Tiers</h2>
            <p className="mb-3 text-sm text-muted">A trainer gets the highest tier whose minimum score they reach. Tick the audience levels each tier may train.</p>
            <div className="space-y-2">
              {tiers.map((t) => (
                <div key={t.id} className="rounded-xl bg-surface2 p-3">
                  <Form action={saveTier} className="space-y-2">
                    <input type="hidden" name="id" value={t.id} />
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="w-40">
                        <label className="label">Name</label>
                        <input name="name" defaultValue={t.name} className="input" />
                      </div>
                      <div className="w-28">
                        <label className="label">Min score</label>
                        <input name="min_score" type="number" step="any" min={0} max={100} defaultValue={t.min_score} className="input" />
                      </div>
                      <div className="w-20">
                        <label className="label">Colour</label>
                        <input name="color" type="color" defaultValue={t.color} className="h-9 w-full rounded-lg" />
                      </div>
                      <Submit className="btn-ghost">Save</Submit>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm">
                      {audience.map((a) => (
                        <label key={a.id} className="flex items-center gap-1.5">
                          <input type="checkbox" name="audience" value={a.id} defaultChecked={t.audience_ids.includes(a.id)} /> {a.name}
                        </label>
                      ))}
                    </div>
                  </Form>
                  <Form action={deleteTier} className="mt-2">
                    <input type="hidden" name="id" value={t.id} />
                    <button className="text-xs text-bad hover:underline">Delete tier</button>
                  </Form>
                </div>
              ))}
              <Form action={saveTier} reset className="space-y-2 rounded-xl border border-dashed border-line p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-40">
                    <label className="label">New tier</label>
                    <input name="name" placeholder="e.g. Tier 4" className="input" required />
                  </div>
                  <div className="w-28">
                    <label className="label">Min score</label>
                    <input name="min_score" type="number" step="any" min={0} max={100} className="input" required />
                  </div>
                  <div className="w-20">
                    <label className="label">Colour</label>
                    <input name="color" type="color" defaultValue="#2563EB" className="h-9 w-full rounded-lg" />
                  </div>
                  <Submit>Add tier</Submit>
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  {audience.map((a) => (
                    <label key={a.id} className="flex items-center gap-1.5">
                      <input type="checkbox" name="audience" value={a.id} /> {a.name}
                    </label>
                  ))}
                </div>
              </Form>
            </div>
          </section>

          <section className="card">
            <h2 className="h2">Rules</h2>
            <Form action={saveRules} className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label">Short-notice cancellation (hours)</label>
                <input name="notice_hours" type="number" min={0} defaultValue={cancel.notice_hours} className="input" />
              </div>
              <div>
                <label className="label">Short-notice reason, min characters</label>
                <input name="min_reason_chars" type="number" min={0} defaultValue={cancel.min_reason_chars} className="input" />
              </div>
              <div>
                <label className="label">Trainer must confirm within (hours)</label>
                <input name="response_hours" type="number" min={1} defaultValue={response.hours} className="input" />
              </div>
              <div>
                <label className="label">Monthly availability due on day</label>
                <input name="deadline_day" type="number" min={1} max={28} defaultValue={deadline.day_of_month} className="input" />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <Submit>Save rules</Submit>
              </div>
            </Form>
          </section>
        </>
      )}
    </div>
  );
}
