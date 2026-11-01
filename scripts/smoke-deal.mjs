// Smoke test against the real Supabase project, with no emails and nothing left behind:
// uploads a tiny proposal through a signed URL, saves a deal with its audience (a seniority level and a department),
// reads them back, checks that deleting the deal removes its audience rows, then deletes the file.
// Run: node --env-file=.env.local scripts/smoke-deal.mjs   (or npm run smoke:deal)
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const fail = (step, e) => {
  console.error(`✗ ${step}: ${e?.message ?? e}`);
  process.exitCode = 1;
};

const path = `smoke-test/${Date.now()}-proposal.pdf`;
let dealId = null;
try {
  const up = await sb.storage.from("proposals").createSignedUploadUrl(path);
  if (up.error) throw ["signed upload URL", up.error];
  const put = await sb.storage.from("proposals").uploadToSignedUrl(path, up.data.token, new Blob(["%PDF-1.4 smoke"], { type: "application/pdf" }));
  if (put.error) throw ["upload", put.error];
  const signed = await sb.storage.from("proposals").createSignedUrl(path, 60);
  if (signed.error) throw ["read back the proposal", signed.error];
  console.log("✓ proposal uploaded to the private proposals bucket");

  const { data: lookups, error: le } = await sb.from("lookups").select("id, kind").in("kind", ["audience", "function"]);
  if (le) throw ["read the seniority and department lists", le];
  const level = lookups.find((l) => l.kind === "audience");
  const dept = lookups.find((l) => l.kind === "function");
  if (!level || !dept) throw ["lists", "Scoring & lists needs at least one audience level and one function"];

  const deal = await sb
    .from("deals")
    .insert({ value_per_day: 100000, days: 5, proposal_path: path, proposal_name: "proposal.pdf", proposal_size: 14, participant_count: 25, all_departments: false })
    .select("id")
    .single();
  if (deal.error) throw ["insert deal", deal.error];
  dealId = deal.data.id;
  const aud = await sb.from("deal_audience").insert([
    { deal_id: dealId, lookup_id: level.id },
    { deal_id: dealId, lookup_id: dept.id },
  ]);
  if (aud.error) throw ["insert audience", aud.error];
  const back = await sb.from("deal_audience").select("lookup_id, lookups(id, kind, name, sort)").eq("deal_id", dealId);
  if (back.error || back.data.length !== 2 || !back.data.every((r) => r.lookups?.name)) throw ["read the audience with names", back.error ?? JSON.stringify(back.data)];
  console.log("✓ deal and audience (seniority + department) saved and read back with names");

  const zero = await sb.from("deals").insert({ value_per_day: 0, days: 5, proposal_path: path, proposal_name: "x.pdf", participant_count: 25 });
  if (!zero.error) throw ["value check", "a deal worth 0 was accepted"];
  const nobody = await sb.from("deals").insert({ value_per_day: 10, days: 5, proposal_path: path, proposal_name: "x.pdf", participant_count: 0 });
  if (!nobody.error) throw ["headcount check", "a deal with 0 participants was accepted"];
  const link = await sb.from("bookings").select("id, deal_id").limit(1);
  if (link.error) throw ["bookings.deal_id", link.error];
  const gone = await sb.from("deal_participants").select("id").limit(1);
  if (!gone.error) throw ["old table", "deal_participants still exists"];
  console.log("✓ database refuses a 0 value and 0 participants; bookings.deal_id is readable; the CSV table is gone");

  const del = await sb.from("deals").delete().eq("id", dealId);
  if (del.error) throw ["delete deal", del.error];
  const left = await sb.from("deal_audience").select("deal_id").eq("deal_id", dealId);
  if (left.error || left.data.length) throw ["cascade", "audience rows were left behind"];
  dealId = null;
  console.log("✓ deleting a deal removes its audience rows");
} catch (e) {
  if (Array.isArray(e)) fail(e[0], e[1]);
  else fail("unexpected", e);
} finally {
  if (dealId) await sb.from("deals").delete().eq("id", dealId);
  await sb.storage.from("proposals").remove([path]);
}
if (!process.exitCode) console.log("Smoke test passed.");
