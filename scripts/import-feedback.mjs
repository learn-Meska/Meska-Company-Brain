// One-off: load the Meska Trainer Scorecard (saved .html) into feedback_sessions and delivered_history.
// Usage: node --env-file=.env.local scripts/import-feedback.mjs path/to/scorecard.html
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const html = readFileSync(process.argv[2], "utf8");
const m = html.match(/<script[^>]*id="data"[^>]*>([\s\S]*?)<\/script>/);
const data = JSON.parse(m ? m[1] : html);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const rows = data.sessions.flatMap((s) =>
  (s.trainers ?? []).slice(0, 1).map((t) => ({
    trainer_name: t,
    client: s.group ?? null,
    program: [s.program, s.title, s.days ? `Day ${s.days}` : null].filter(Boolean).join(" · "),
    session_date: s.date || null,
    responses: s.n ?? 0,
    delivery: s.delivery ?? null,
    content: s.content ?? null,
    source_key: [t, s.group, s.title, s.date, s.days].join("|"),
  })),
);
let { error } = await sb.from("feedback_sessions").upsert(rows, { onConflict: "source_key" });
if (error) throw error;
const today = new Date().toISOString().slice(0, 10);
const totals = Object.entries(data.delivered ?? {}).map(([trainer_name, v]) => ({ trainer_name, total: v.total, as_of: today }));
({ error } = await sb.from("delivered_history").upsert(totals));
if (error) throw error;
console.log(`Imported ${rows.length} feedback sessions and ${totals.length} delivered totals.`);
