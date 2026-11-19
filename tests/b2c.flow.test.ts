// Admin uploads the B2C Sessions workbook: check first (nothing saved), then upload (sessions saved, re-upload updates).
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { B2C_COLUMNS } from "@/lib/b2c";
import { createFakeDb } from "./support/fake-db";

const h = vi.hoisted(() => ({
  fake: null as unknown as ReturnType<typeof import("./support/fake-db").createFakeDb>,
  me: { id: "admin-1", role: "admin" },
  audits: [] as string[],
}));
vi.mock("@/lib/supabase", async () => {
  const real = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  return { db: () => h.fake.client, fetchAll: real.fetchAll, authClient: async () => ({}) };
});
vi.mock("@/lib/auth", () => ({
  requireRole: async (...roles: string[]) => {
    if (!roles.includes(h.me.role)) throw new Error("NEXT_REDIRECT /");
    return h.me;
  },
}));
vi.mock("@/lib/notify", () => ({ audit: async (_a: string, action: string) => void h.audits.push(action) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { checkB2CFile, importB2CFile, removeB2CCohort } = await import("../src/app/(app)/admin/b2c/actions");

const TRAINER = "33333333-3333-4333-8333-333333333333";
const time = (hr: number, m = 0) => new Date(Date.UTC(1899, 11, 30, hr, m));

// Builds a workbook shaped like the real template (header, Date and time cells, Weekday formula, Summary sheet).
async function workbook(rows: unknown[][], header: string[] = [...B2C_COLUMNS], name = "B2C Sessions.xlsx") {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("B2C Sessions");
  ws.addRow(header);
  rows.forEach((r, i) => ws.addRow(r.map((v, c) => (c === 6 ? { formula: `TEXT(F${i + 2},"dddd")`, result: "Saturday" } : v))));
  wb.addWorksheet("Summary").addRow(["Program", "Cohort", "Sessions"]);
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const fd = new FormData();
  fd.set("file", new File([buf], name));
  return fd;
}
const sample = (status = "Confirmed"): unknown[][] => [
  ["AI Copilot Diploma", "W16", "Offline", 1, "Onboarding", new Date(Date.UTC(2026, 10, 7)), null, time(17), time(22), "Creativa", "Omar El Monayar", "Confirmed", "Yes"],
  ["AI Copilot Diploma", "O12", "Online", 1, "Onboarding", new Date(Date.UTC(2026, 10, 8)), null, time(19), time(20), "Online", "Sayed (no profile)", status, "No"],
];

beforeEach(() => {
  h.fake = createFakeDb({ trainers: [{ id: TRAINER, full_name: "Omar  El Monayar" }] });
  h.me = { id: "admin-1", role: "admin" };
  h.audits = [];
});

describe("B2C upload", () => {
  it("checks the file against the template without saving anything", async () => {
    const r = await checkB2CFile(await workbook(sample()));
    expect(r).toMatchObject({ valid: true, total: 2, fresh: 2, updated: 0, delivered: 1, unmatched: ["Sayed (no profile)"], byStatus: { Confirmed: 2 } });
    expect(r.cohorts).toEqual([
      { program: "AI Copilot Diploma", cohort: "W16", sessions: 1, first: "2026-11-07", last: "2026-11-07" },
      { program: "AI Copilot Diploma", cohort: "O12", sessions: 1, first: "2026-11-08", last: "2026-11-08" },
    ]);
    expect(h.fake.writes).toEqual([]);
  });

  it("refuses a file that isn't the template, a non-xlsx file, and a broken workbook", async () => {
    expect((await checkB2CFile(await workbook(sample(), ["Name", "Email"]))).errors?.[0]).toMatch(/isn't the B2C Sessions template/);
    expect(await checkB2CFile(await workbook(sample(), undefined, "sessions.csv"))).toEqual({ error: "Upload the template as an Excel .xlsx file." });
    const fd = new FormData();
    fd.set("file", new File(["not a workbook"], "x.xlsx"));
    expect((await checkB2CFile(fd)).error).toMatch(/Couldn't open that file/);
    expect((await checkB2CFile(new FormData())).error).toMatch(/Choose the B2C Sessions Excel file/);
  });

  it("saves every session with its status, trainer link and delivered flag, and updates on re-upload", async () => {
    const r = await importB2CFile(await workbook(sample()));
    expect(r.ok).toBe("Uploaded 2 B2C sessions: 2 new, 0 updated. They're on the calendar now.");
    const saved = h.fake.tables.b2c_sessions;
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ program: "AI Copilot Diploma", cohort: "W16", format: "offline", day_number: 1, session: "Onboarding", date: "2026-11-07", start_time: "17:00", end_time: "22:00", location: "Creativa", trainer_name: "Omar El Monayar", trainer_id: TRAINER, status: "confirmed", delivered: true, imported_by: "admin-1" });
    expect(saved[1]).toMatchObject({ trainer_name: "Sayed (no profile)", trainer_id: null, status: "confirmed", delivered: false });
    expect(h.audits).toEqual(["b2c_imported"]);

    // the same sheet with a changed status updates the row instead of adding another
    const again = await importB2CFile(await workbook(sample("Needs trainer")));
    expect(again.ok).toBe("Uploaded 2 B2C sessions: 0 new, 2 updated. They're on the calendar now.");
    expect(h.fake.tables.b2c_sessions).toHaveLength(2);
    expect(h.fake.tables.b2c_sessions[1].status).toBe("needs_trainer");
  });

  it("uploads nothing when any row has a problem", async () => {
    const bad = sample();
    bad[1][2] = "Hybrid";
    expect(await importB2CFile(await workbook(bad))).toEqual({ error: "The file has 1 problem. Check it again and fix them before uploading." });
    expect(h.fake.tables.b2c_sessions ?? []).toEqual([]);
  });

  it("removes a cohort", async () => {
    await importB2CFile(await workbook(sample()));
    const fd = new FormData();
    fd.set("program", "AI Copilot Diploma");
    fd.set("cohort", "W16");
    expect(await removeB2CCohort(fd)).toEqual({ ok: "Removed AI Copilot Diploma W16 (1 session)." });
    expect(h.fake.tables.b2c_sessions.map((s) => s.cohort)).toEqual(["O12"]);
  });

  it("the downloadable empty template passes the template check", async () => {
    const { b2cTemplate, readB2CWorkbook } = await import("@/lib/b2c-xlsx");
    const { checkB2CSheet } = await import("@/lib/b2c");
    const sheet = await readB2CWorkbook(await b2cTemplate());
    expect(checkB2CSheet(sheet!).errors).toEqual(["The sheet has no sessions under the header."]);
  });

  it("is for company admins only", async () => {
    h.me = { id: "te-1", role: "approver" };
    await expect(checkB2CFile(await workbook(sample()))).rejects.toThrow("NEXT_REDIRECT");
    await expect(importB2CFile(await workbook(sample()))).rejects.toThrow("NEXT_REDIRECT");
  });
});
