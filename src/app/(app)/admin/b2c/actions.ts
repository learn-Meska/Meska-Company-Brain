"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { db, fetchAll } from "@/lib/supabase";
import { audit } from "@/lib/notify";
import { B2C_STATUS, checkB2CSheet, nameKey, sessionKey, type B2CRow } from "@/lib/b2c";
import { readB2CWorkbook } from "@/lib/b2c-xlsx";

const MAX_BYTES = 4 * 1024 * 1024;

export type B2CCheckResult = {
  error?: string;
  ok?: string;
  // the template matched and every row is valid
  valid?: boolean;
  errors?: string[];
  total?: number;
  fresh?: number;
  updated?: number;
  cohorts?: { program: string; cohort: string; sessions: number; first: string; last: string }[];
  byStatus?: Record<string, number>;
  delivered?: number;
  unmatched?: string[];
  preview?: B2CRow[];
};

// Reads and checks the uploaded file. Nothing is saved.
async function readUpload(fd: FormData): Promise<{ error: string } | { rows: B2CRow[]; errors: string[] }> {
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose the B2C Sessions Excel file (.xlsx) first." };
  if (!/\.xlsx$/i.test(file.name)) return { error: "Upload the template as an Excel .xlsx file." };
  if (file.size > MAX_BYTES) return { error: "That file is over 4 MB. Split it into smaller files." };
  const sheet = await readB2CWorkbook(await file.arrayBuffer());
  if (!sheet) return { error: "Couldn't open that file. Save it as an Excel workbook (.xlsx) and try again." };
  return checkB2CSheet(sheet);
}

async function trainerIds(): Promise<Map<string, string>> {
  const { data } = await fetchAll<{ id: string; full_name: string }>((from, to) => db().from("trainers").select("id, full_name").order("id").range(from, to));
  return new Map(data.map((t) => [nameKey(t.full_name), t.id]));
}

async function existingKeys(rows: B2CRow[]): Promise<Set<string>> {
  const programs = [...new Set(rows.map((r) => r.program))];
  if (!programs.length) return new Set();
  const { data } = await fetchAll<Pick<B2CRow, "program" | "cohort" | "day_number">>((from, to) =>
    db().from("b2c_sessions").select("program, cohort, day_number").in("program", programs).order("id").range(from, to),
  );
  return new Set(data.map(sessionKey));
}

// Step 1: checks the file matches the template and every row is valid, and shows what the upload will do.
export async function checkB2CFile(fd: FormData): Promise<B2CCheckResult> {
  await requireRole("admin");
  const read = await readUpload(fd);
  if ("error" in read) return { error: read.error };
  const { rows, errors } = read;
  const [ids, have] = await Promise.all([trainerIds(), existingKeys(rows)]);
  const cohorts = new Map<string, { program: string; cohort: string; sessions: number; first: string; last: string }>();
  for (const r of rows) {
    const k = `${r.program}|${r.cohort}`;
    const c = cohorts.get(k) ?? { program: r.program, cohort: r.cohort, sessions: 0, first: r.date, last: r.date };
    c.sessions++;
    if (r.date < c.first) c.first = r.date;
    if (r.date > c.last) c.last = r.date;
    cohorts.set(k, c);
  }
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[B2C_STATUS[r.status]] = (byStatus[B2C_STATUS[r.status]] ?? 0) + 1;
  const updated = rows.filter((r) => have.has(sessionKey(r))).length;
  return {
    valid: errors.length === 0,
    errors: errors.slice(0, 50),
    total: rows.length,
    fresh: rows.length - updated,
    updated,
    cohorts: [...cohorts.values()].sort((a, b) => a.first.localeCompare(b.first)),
    byStatus,
    delivered: rows.filter((r) => r.delivered).length,
    unmatched: [...new Set(rows.map((r) => r.trainer_name).filter((n): n is string => !!n && !ids.has(nameKey(n))))].sort(),
    preview: [...rows].sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time)).slice(0, 8),
  };
}

// Step 2: saves every row of a valid file. A session already uploaded (same Program, Cohort and Day #) is updated.
export async function importB2CFile(fd: FormData): Promise<B2CCheckResult> {
  const me = await requireRole("admin");
  const read = await readUpload(fd);
  if ("error" in read) return { error: read.error };
  if (read.errors.length) return { error: `The file has ${read.errors.length} problem${read.errors.length > 1 ? "s" : ""}. Check it again and fix them before uploading.` };
  const [ids, have] = await Promise.all([trainerIds(), existingKeys(read.rows)]);
  const now = new Date().toISOString();
  // rebuilt from known fields only
  const rows = read.rows.map((r) => ({
    program: r.program,
    cohort: r.cohort,
    format: r.format,
    day_number: r.day_number,
    session: r.session,
    date: r.date,
    start_time: r.start_time,
    end_time: r.end_time,
    location: r.location,
    trainer_name: r.trainer_name,
    trainer_id: r.trainer_name ? (ids.get(nameKey(r.trainer_name)) ?? null) : null,
    status: r.status,
    delivered: r.delivered,
    imported_by: me.id,
    imported_at: now,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db().from("b2c_sessions").upsert(rows.slice(i, i + 500), { onConflict: "program,cohort,day_number" });
    if (error) {
      console.error("[importB2CFile]", error.message);
      return { error: i ? `Saved ${i} sessions, then the upload stopped. Upload the file again to finish (nothing is duplicated).` : "Couldn't save the sessions. Please try again." };
    }
  }
  const updated = read.rows.filter((r) => have.has(sessionKey(r))).length;
  await audit(me.id, "b2c_imported", null, { sessions: rows.length, new: rows.length - updated, updated });
  revalidatePath("/admin/b2c");
  revalidatePath("/calendar");
  revalidatePath("/me/calendar");
  const fresh = rows.length - updated;
  return { ok: `Uploaded ${rows.length} B2C session${rows.length === 1 ? "" : "s"}: ${fresh} new, ${updated} updated. They're on the calendar now.`, total: rows.length, fresh, updated };
}

// Removes every uploaded session of one cohort, e.g. after uploading the wrong file.
export async function removeB2CCohort(fd: FormData): Promise<{ error?: string; ok?: string }> {
  const me = await requireRole("admin");
  const program = String(fd.get("program") ?? "").trim();
  const cohort = String(fd.get("cohort") ?? "").trim();
  if (!program || !cohort) return { error: "Pick a cohort to remove." };
  const { data, error } = await db().from("b2c_sessions").delete().eq("program", program).eq("cohort", cohort).select("id");
  if (error) return { error: "Couldn't remove it. Please try again." };
  const n = (data ?? []).length;
  if (!n) return { error: "That cohort was already removed." };
  await audit(me.id, "b2c_removed", null, { program, cohort, sessions: n });
  revalidatePath("/admin/b2c");
  revalidatePath("/calendar");
  revalidatePath("/me/calendar");
  return { ok: `Removed ${program} ${cohort} (${n} session${n === 1 ? "" : "s"}).` };
}
