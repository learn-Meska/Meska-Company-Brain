// The content team: they upload a guide and files for a deal and submit them; the assigned trainer then sees them.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./support/fake-db";

const DEAL = "55555555-5555-4555-8555-555555555555";
const TRAINER = "33333333-3333-4333-8333-333333333333";
const OTHER_TRAINER = "44444444-4444-4444-8444-444444444444";
const DAY1 = "66666666-6666-4666-8666-666666666661";
const DAY2 = "66666666-6666-4666-8666-666666666662";

const h = vi.hoisted(() => ({
  fake: null as unknown as ReturnType<typeof import("./support/fake-db").createFakeDb>,
  me: { id: "content-1", role: "content", full_name: "Content Person", trainer_id: null as string | null },
  notified: [] as { to: string[]; title: string }[],
  audits: [] as string[],
}));

vi.mock("@/lib/supabase", () => ({ db: () => h.fake.client, authClient: async () => ({}) }));
vi.mock("@/lib/auth", async () => {
  // The test user acts as the admin of their portal, so they hold every access of it.
  const { hasAnyAccess } = await import("../src/lib/team-access");
  const asLead = () => ({ ...h.me, real_role: h.me.role, team_admin_of: [h.me.role] });
  return {
  requireRole: async (...roles: string[]) => {
    if (!roles.includes(h.me.role)) throw new Error("NEXT_REDIRECT /");
    return h.me;
  },
  requireAccess: async (...keys: string[]) => {
    if (!hasAnyAccess(asLead(), ...keys)) throw new Error("NEXT_REDIRECT /");
    return h.me;
  },
  can: (_u: unknown, key: string) => hasAnyAccess(asLead(), key),
  requireUser: async () => h.me,
  canManageContent: (u: { role: string }) => u.role === "admin" || u.role === "content",
};
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/notify", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/notify")>();
  return {
    ...real,
    audit: async (_by: string, action: string) => void h.audits.push(action),
    notify: async (to: ({ email: string } | null)[], n: { title: string }) => void h.notified.push({ to: to.map((r) => r?.email ?? "?"), title: n.title }),
    usersWithRoles: async () => [{ id: "admin-1", email: "admin@meska.ai", full_name: "Admin" }],
    trainerRecipient: async (b: { trainers?: { email: string | null; full_name: string } | null }) => ({ id: "", email: b.trainers?.email ?? "?", full_name: b.trainers?.full_name ?? "" }),
  };
});

const { createContentUpload, recordContentFile, submitContent, contentLink } = await import("@/app/(app)/content/actions");

const day = (id: string, n: number, trainer: string | null) => ({ id, deal_id: DEAL, program_name: "Aman Holding HR", day_number: n, date: "2026-11-10", start_time: "10:00", end_time: "15:00", trainer_id: trainer, status: trainer ? "awaiting_trainer" : "needs_trainer" });

beforeEach(() => {
  h.fake = createFakeDb({
    trainers: [
      { id: TRAINER, full_name: "Trainer One", email: "trainer@example.com" },
      { id: OTHER_TRAINER, full_name: "Trainer Two", email: "two@example.com" },
    ],
  });
  h.fake.tables.deals = [{ id: DEAL, company_name: "Aman Holding", content_submitted_at: null }];
  h.fake.tables.bookings = [day(DAY1, 1, TRAINER), day(DAY2, 2, null)];
  h.me = { id: "content-1", role: "content", full_name: "Content Person", trainer_id: null };
  h.notified = [];
  h.audits = [];
});

describe("content team: uploads", () => {
  it("only the content team (and admins) can upload", async () => {
    for (const role of ["growth", "approver", "trainer"]) {
      h.me = { ...h.me, role };
      await expect(createContentUpload(DEAL, "guide.pdf")).rejects.toThrow(/REDIRECT/);
    }
    h.me = { ...h.me, role: "admin" };
    expect(await createContentUpload(DEAL, "guide.pdf")).toEqual({ path: expect.stringMatching(new RegExp(`^deals/${DEAL}/\\d+-guide.pdf$`)), token: "upload-token" });
  });

  it("refuses unknown deals and dangerous file types", async () => {
    expect(await createContentUpload("nope", "guide.pdf")).toEqual({ error: "Request not found." });
    expect(await createContentUpload(DEAL, "run.exe")).toEqual({ error: expect.stringMatching(/file type/) });
  });

  it("records a file only under this deal's own folder", async () => {
    const ok = await createContentUpload(DEAL, "slides.pptx");
    const { path } = ok as { path: string };
    expect(await recordContentFile(DEAL, path, "slides.pptx", 2048)).toEqual({ ok: "Uploaded slides.pptx." });
    expect(h.fake.tables.deal_content[0]).toMatchObject({ deal_id: DEAL, file_name: "slides.pptx", size_bytes: 2048, uploaded_by: "content-1" });
    expect(await recordContentFile(DEAL, "deals/other/slides.pptx", "x.pptx", 1)).toEqual({ error: "Invalid upload." });
    expect(await recordContentFile(DEAL, `deals/${DEAL}/../x.pptx`, "x.pptx", 1)).toEqual({ error: "Invalid upload." });
  });
});

describe("content team: submitting", () => {
  it("needs a guide or at least one file", async () => {
    expect(await submitContent(DEAL, "   ")).toEqual({ error: "Write the guide or upload at least one file first." });
    expect(h.fake.tables.deals[0].content_submitted_at).toBeNull();
  });

  it("saves the guide, stamps the deal and tells the assigned trainer and the booking team", async () => {
    const r = await submitContent(DEAL, "  Day 1: prompting basics  ");
    expect(r).toEqual({ ok: "Content submitted. The trainer was notified." });
    expect(h.fake.tables.deals[0]).toMatchObject({ content_guide: "Day 1: prompting basics", content_submitted_by: "content-1" });
    expect(h.fake.tables.deals[0].content_submitted_at).toEqual(expect.any(String));
    expect(h.notified).toEqual([
      { to: ["trainer@example.com"], title: "New content for Aman Holding HR" },
      { to: ["admin@meska.ai"], title: "Content submitted: Aman Holding — Aman Holding HR" },
    ]);
    expect(h.audits).toEqual(["content_submitted"]);
  });

  it("a second submit is an update", async () => {
    await submitContent(DEAL, "v1");
    h.notified = [];
    await submitContent(DEAL, "v2");
    expect(h.notified.map((n) => n.title)).toEqual(["Updated content for Aman Holding HR", "Content updated: Aman Holding — Aman Holding HR"]);
  });

  it("growth and trainers can't submit", async () => {
    for (const role of ["growth", "trainer"]) {
      h.me = { ...h.me, role };
      await expect(submitContent(DEAL, "x")).rejects.toThrow(/REDIRECT/);
    }
  });
});

describe("content downloads", () => {
  async function uploaded() {
    const { path } = (await createContentUpload(DEAL, "guide.pdf")) as { path: string };
    await recordContentFile(DEAL, path, "guide.pdf", 10);
    h.fake.putObject("materials", path);
    return h.fake.tables.deal_content[0].id as string;
  }

  it("the assigned trainer can download only after the content is submitted", async () => {
    const id = await uploaded();
    h.me = { id: "u-trainer", role: "trainer", full_name: "T", trainer_id: TRAINER };
    expect(await contentLink(id)).toEqual({ error: "File not found." });
    h.me = { ...h.me, id: "content-1", role: "content", trainer_id: null };
    await submitContent(DEAL, "guide");
    h.me = { id: "u-trainer", role: "trainer", full_name: "T", trainer_id: TRAINER };
    expect(await contentLink(id)).toEqual({ url: expect.stringContaining("?signed") });
  });

  it("a trainer who isn't on this deal can't download it", async () => {
    const id = await uploaded();
    await submitContent(DEAL, "guide");
    h.me = { id: "u-other", role: "trainer", full_name: "Other", trainer_id: OTHER_TRAINER };
    expect(await contentLink(id)).toEqual({ error: "File not found." });
  });

  it("the content team and Meska staff can download before submitting", async () => {
    const id = await uploaded();
    for (const role of ["content", "admin", "approver", "growth"]) {
      h.me = { id: "x", role, full_name: "X", trainer_id: null };
      expect(await contentLink(id)).toEqual({ url: expect.stringContaining("?signed") });
    }
  });
});
