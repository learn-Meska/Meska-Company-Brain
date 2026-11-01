// Smoke test against the real Supabase project, with no emails and nothing left behind:
// uploads a tiny proposal through a signed URL, saves a deal with two participants, reads them back,
// checks that deleting the deal removes its participants, then deletes the file.
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

  const deal = await sb.from("deals").insert({ value_per_day: 100000, days: 5, proposal_path: path, proposal_name: "proposal.pdf", proposal_size: 14 }).select("id").single();
  if (deal.error) throw ["insert deal", deal.error];
  dealId = deal.data.id;
  const people = await sb.from("deal_participants").insert([
    { deal_id: dealId, position: 1, name: "Smoke One", title: "Tester", department: "QA" },
    { deal_id: dealId, position: 2, name: "سارة", title: null, department: null },
  ]);
  if (people.error) throw ["insert participants", people.error];
  const back = await sb.from("deal_participants").select("name, title, department").eq("deal_id", dealId).order("position");
  if (back.error || back.data.length !== 2 || back.data[1].name !== "سارة") throw ["read participants", back.error ?? JSON.stringify(back.data)];
  console.log("✓ deal and participants saved and read back");

  const bad = await sb.from("deals").insert({ value_per_day: 0, days: 5, proposal_path: path, proposal_name: "x.pdf" });
  if (!bad.error) throw ["value check", "a deal worth 0 was accepted"];
  const link = await sb.from("bookings").select("id, deal_id").limit(1);
  if (link.error) throw ["bookings.deal_id", link.error];
  console.log("✓ database checks refuse a 0 value; bookings.deal_id is readable");

  const del = await sb.from("deals").delete().eq("id", dealId);
  if (del.error) throw ["delete deal", del.error];
  const left = await sb.from("deal_participants").select("id").eq("deal_id", dealId);
  if (left.error || left.data.length) throw ["cascade", "participants were left behind"];
  dealId = null;
  console.log("✓ deleting a deal removes its participants");
} catch (e) {
  if (Array.isArray(e)) fail(e[0], e[1]);
  else fail("unexpected", e);
} finally {
  if (dealId) await sb.from("deals").delete().eq("id", dealId);
  await sb.storage.from("proposals").remove([path]);
}
if (!process.exitCode) console.log("Smoke test passed.");
