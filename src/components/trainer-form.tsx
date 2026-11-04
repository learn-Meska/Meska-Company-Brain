import { Form, Submit } from "@/components/form";
import { db } from "@/lib/supabase";
import type { TrainerProfile } from "@/lib/scoring";
import type { ActionResult } from "@/components/form";
import { TrainerCreateForm } from "@/components/trainer-create-form";

type Lookup = { id: string; kind: string; name: string };

export async function TrainerForm({ action, t }: { action?: (fd: FormData) => Promise<ActionResult>; t?: TrainerProfile }) {
  const [{ data: skills }, { data: lookups }] = await Promise.all([
    db().from("skills").select("*").order("name"),
    db().from("lookups").select("*").order("sort"),
  ]);
  const has = new Set([...(t?.skills.map((s) => s.id) ?? []), ...(t?.lookups.map((l) => l.id) ?? [])]);
  const L = (lookups ?? []) as Lookup[];
  const fields = (
    <>
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Full name *</label>
          <input name="full_name" required defaultValue={t?.full_name} className="input" />
        </div>
        <div>
          <label className="label">Email (used for the invitation and booking emails)</label>
          <input name="email" type="email" defaultValue={t?.email ?? ""} className="input" />
        </div>
        <div>
          <label className="label">Phone</label>
          <input name="phone" defaultValue={t?.phone ?? ""} className="input" />
        </div>
        <div>
          <label className="label">Status</label>
          <select name="active" defaultValue={t && !t.active ? "off" : "on"} className="input">
            <option value="on">Active, can be booked</option>
            <option value="off">Inactive, hidden from booking</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="feedback_name">Name in the feedback scorecard (only if spelled differently)</label>
          <input id="feedback_name" name="feedback_name" defaultValue={t?.feedback_name ?? ""} placeholder="e.g. Yassmine Nasser" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="title">Job title (shown under the name on the profile PDF)</label>
          <input id="title" name="title" defaultValue={t?.title ?? ""} placeholder="e.g. Director of Learning & Development, Meska AI" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="bio">Short internal notes</label>
          <textarea id="bio" name="bio" rows={2} defaultValue={t?.bio ?? ""} className="input" />
        </div>
      </div>
      <fieldset className="space-y-3 rounded-2xl border border-line p-4">
        <legend className="px-1 text-sm font-semibold">Profile document (downloadable PDF)</legend>
        <p className="text-xs text-muted">
          These fill the trainer profile PDF that Growth sends to clients. Wrap words in **double stars** to make them bold. Empty sections are filled from
          the trainer&apos;s skills, industries and delivery numbers.
        </p>
        <div>
          <label className="label" htmlFor="overview">Professional overview (blank line between paragraphs)</label>
          <textarea id="overview" name="overview" rows={4} defaultValue={t?.overview ?? ""} className="input" placeholder="Accomplished AI educator and corporate trainer with **14+ years** of experience…" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="credentials">Educational credentials (one per line)</label>
            <textarea id="credentials" name="credentials" rows={4} defaultValue={t?.credentials ?? ""} className="input" placeholder={"Doctorate in Business & Marketing\nBSc in Computer Science"} />
          </div>
          <div>
            <label className="label" htmlFor="thought_leadership">Thought leadership</label>
            <textarea id="thought_leadership" name="thought_leadership" rows={4} defaultValue={t?.thought_leadership ?? ""} className="input" placeholder="Keynote speaker and panelist at…" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="footprint_intro">Training footprint, intro line</label>
          <input id="footprint_intro" name="footprint_intro" defaultValue={t?.footprint_intro ?? ""} className="input" placeholder="Trained more than 10,000 professionals across industries…" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="footprint">Training footprint groups (one per line, “Heading: details”)</label>
            <textarea id="footprint" name="footprint" rows={4} defaultValue={t?.footprint ?? ""} className="input" placeholder={"Corporate & Enterprise Clients: Viatris, SODIC, …\nAcademia & Special Programs: AUC, …\nGovernment & International: …"} />
          </div>
          <div>
            <label className="label" htmlFor="expertise">Industry expertise (one per line, “Heading: details”)</label>
            <textarea id="expertise" name="expertise" rows={4} defaultValue={t?.expertise ?? ""} className="input" placeholder={"Marketing & Branding: EspressoLab, …\nAI Implementation: AI Chatbots, …"} />
          </div>
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Skills (the content they can deliver)</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {((skills ?? []) as { id: string; name: string }[]).map((s) => (
            <label key={s.id} className="flex items-center gap-1.5">
              <input type="checkbox" name="skills" value={s.id} defaultChecked={has.has(s.id)} /> {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      {(["audience", "function", "industry"] as const).map((k) => (
        <fieldset key={k}>
          <legend className="mb-2 text-sm font-semibold">{{ audience: "Audience levels they can train", function: "Functions", industry: "Industries" }[k]}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {L.filter((l) => l.kind === k).map((l) => (
              <label key={l.id} className="flex items-center gap-1.5">
                <input type="checkbox" name="lookups" value={l.id} defaultChecked={has.has(l.id)} /> {l.name}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </>
  );
  // new profile: client form that also uploads the photo and CV
  if (!t || !action) return <TrainerCreateForm>{fields}</TrainerCreateForm>;
  return (
    <Form action={action} className="card space-y-5">
      {fields}
      <Submit>Save profile</Submit>
    </Form>
  );
}
