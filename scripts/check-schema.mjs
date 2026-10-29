// Checks the live Supabase database against tests/schema.json (tables, columns, storage buckets).
// Run: node --env-file=.env.local scripts/check-schema.mjs   (or npm run check:db)
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (e.g. node --env-file=.env.local …).");
  process.exit(2);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const contract = JSON.parse(readFileSync(new URL("../tests/schema.json", import.meta.url), "utf8"));

const api = await (await fetch(`${url}/rest/v1/`, { headers })).json();
const buckets = await (await fetch(`${url}/storage/v1/bucket`, { headers })).json();

const problems = [];
for (const [table, cols] of Object.entries(contract)) {
  if (table.startsWith("_") || table === "buckets") continue;
  const def = api.definitions?.[table];
  if (!def) {
    problems.push(`missing table: ${table}`);
    continue;
  }
  for (const c of cols) if (!(c in def.properties)) problems.push(`missing column: ${table}.${c}`);
}
for (const b of contract.buckets ?? []) if (!buckets.some?.((x) => x.id === b)) problems.push(`missing storage bucket: ${b}`);

if (problems.length) {
  console.error("The database doesn't match tests/schema.json. Run the files in supabase/migrations/ in the SQL editor.\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("Database matches tests/schema.json.");
