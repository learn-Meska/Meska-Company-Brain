// Golden test for the main flow: Growth sends a New deal → the deal, its audience (seniority levels and departments)
// and one booking per day are saved, the trainer is emailed, the booking team is notified, and nothing is left
// behind when a step fails. The exact database writes are compared with tests/golden/*.json. Update them only for
// an intended change (`npm run test:update`), and review the diff.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, fakeId } from "./support/fake-db";
import { DEPT_FIN, DEPT_HR, LEVEL_MID, LEVEL_SENIOR, validRequest } from "./support/requests";

const USER = "11111111-1111-4111-8111-111111111111";
const INDUSTRY = "22222222-2222-4222-8222-222222222222";
const TRAINER = "33333333-3333-4333-8333-333333333333";
const OTHER_TRAINER = "44444444-4444-4444-8444-444444444444";

type Free = { id: string; full_name: string; title: string | null; total: number; lookups: { id: string }[] };
const h = vi.hoisted(() => ({
  fake: null as unknown as ReturnType<typeof import("./support/fake-db").createFakeDb>,
  me: { id: "", role: "growth", full_name: "Growth Person" },
  free: [] as Free[],
  searches: [] as Record<string, unknown>[],
  notified: [] as { to: string[]; title: string; email?: { subject: string; rows?: [string, string][] } }[],
  audits: [] as { action: string; details: Record<string, unknown> }[],
}));

vi.mock("@/lib/supabase", () => ({ db: () => h.fake.client, authClient: async () => ({}) }));
vi.mock("@/lib/auth", () => ({
  requireRole: async (...roles: string[]) => {
    if (!roles.includes(h.me.role)) throw new Error("NEXT_REDIRECT /");
    return h.me;
  },
  requireUser: async () => h.me,
  requireTrainer: async () => h.me,
}));
// search.ts is replaced: the level filter itself is covered by fitsLevels in deal-rules.test.ts; here we check it is asked for.
vi.mock("@/lib/search", () => ({
  searchTrainers: async (q: Record<string, unknown>) => {
    h.searches.push(q);
    return { matches: h.free, slots: [], unavailableCount: 0 };
  },
}));
vi.mock("@/lib/scoring", () => ({ getSetting: async (_k: string, fallback: unknown) => fallback }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/notify", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/notify")>();
  return {
    ...real,
    audit: async (_by: string, action: string, _booking: string, details: Record<string, unknown>) => void h.audits.push({ action, details }),
    notify: async (to: ({ id: string; email: string | null } | null)[], n: { title: string; email?: { subject: string; rows?: [string, string][] } }) =>
      void h.notified.push({ to: to.map((r) => r?.email ?? "?"), title: n.title, email: n.email && { subject: n.email.subject, rows: n.email.rows } }),
    usersWithRoles: async () => [{ id: "admin-1", email: "admin@meska.ai", full_name: "Admin" }],
    trainerRecipient: async (b: { trainers?: { full_name: string } | null }) => ({ id: "", email: "trainer@example.com", full_name: b.trainers?.full_name ?? "" }),
  };
});

const { createRequest, createProposalUpload, requestTrainerOptions, proposalLink } = await import("@/app/(app)/bookings/actions");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T08:00:00Z"));
  h.fake = createFakeDb({
    trainers: [{ id: TRAINER, full_name: "Trainer One", email: "trainer@example.com" }],
    lookups: [
      { id: INDUSTRY, kind: "industry", name: "Banking", sort: 1 },
      { id: LEVEL_MID, kind: "audience", name: "Mid-Level (Middle Management / Specialists)", sort: 2 },
      { id: LEVEL_SENIOR, kind: "audience", name: "Senior Level (High-Level / Directors / VPs)", sort: 3 },
      { id: DEPT_HR, kind: "function", name: "HR", sort: 20 },
      { id: DEPT_FIN, kind: "function", name: "Finance", sort: 10 },
    ],
  });
  h.me = { id: USER, role: "growth", full_name: "Growth Person" };
  h.free = [{ id: TRAINER, full_name: "Trainer One", title: "AI coach", total: 80, lookups: [{ id: DEPT_HR }] }];
  h.searches = [];
  h.notified = [];
  h.audits = [];
});

// batch ids come from crypto.randomUUID; replace them so the snapshot is stable
const stable = (v: unknown) => JSON.stringify(v, (k, x) => (k === "batch_id" && x ? "<batch>" : x), 2) + "\n";

async function uploadedRequest(over = {}) {
  const r = validRequest(over);
  h.fake.putObject("proposals", r.proposal.path);
  return r;
}

describe("New deal: happy path", () => {
  it("Growth: saves deal → audience → bookings (golden writes) and notifies", async () => {
    const input = await uploadedRequest({
      days: [
        { day_number: 1, date: "2026-11-10", start: "10:00", end: "15:00", location: " Cairo ", trainer_id: TRAINER },
        { day_number: 2, date: "2026-11-11", start: "18:00", end: "22:00", location: "", trainer_id: TRAINER },
      ],
      same_trainer: true,
    });
    const r = await createRequest(input);
    expect(r).toEqual({ ok: expect.stringContaining("Request sent"), ids: [fakeId(6), fakeId(7)] });

    await expect(stable(h.fake.writes)).toMatchFileSnapshot("./golden/create-request.writes.json");

    // the trainer re-check asked for the picked seniority levels
    expect(h.searches.every((q) => JSON.stringify(q.audienceIds) === JSON.stringify([LEVEL_MID, LEVEL_SENIOR]))).toBe(true);

    // the deal keeps the headcount and one audience row per level and department
    expect(h.fake.tables.deals[0]).toMatchObject({ participant_count: 25, all_departments: false });
    expect(h.fake.tables.deal_audience.map((x) => x.lookup_id)).toEqual([LEVEL_MID, LEVEL_SENIOR, DEPT_HR, DEPT_FIN]);

    // every day points at the one deal, with the industry and no single audience level / function
    const bookings = h.fake.tables.bookings;
    expect(new Set(bookings.map((b) => b.deal_id))).toEqual(new Set([fakeId(1)]));
    expect(bookings.every((b) => b.industry_id === INDUSTRY && b.audience_id === null && b.function_id === null)).toBe(true);
    expect(bookings.map((b) => b.status)).toEqual(["awaiting_trainer", "awaiting_trainer"]);
    // no per-day content is asked for any more; the NOT NULL column gets ""
    expect(bookings.map((b) => b.content)).toEqual(["", ""]);

    // trainer emailed once per day, booking team once
    expect(h.notified.map((n) => n.title)).toEqual([
      expect.stringMatching(/^New training assigned/),
      expect.stringMatching(/^New training assigned/),
      "New booking: Aman Holding HR — trainer emailed",
    ]);
    // the trainer learns who the audience is, but never the deal value, proposal or client contact
    const trainerRows = Object.fromEntries(h.notified[0].email!.rows!);
    expect(Object.keys(trainerRows)).toEqual(["Program", "Date", "Time", "Location", "Industry", "Status", "Seniority", "Departments", "Participants"]);
    expect(trainerRows["Seniority"]).toBe("Mid-Level, Senior Level");
    expect(trainerRows["Departments"]).toBe("Finance, HR");
    expect(trainerRows["Participants"]).toBe("25");
    const teamRows = Object.fromEntries(h.notified[2].email!.rows!);
    expect(teamRows["Participants"]).toBe("25");
    expect(teamRows["Deal value"]).toBe("100,000 per day × 5 days = <b>500,000</b>");
    expect(teamRows["Proposal"]).toBe("Proposal.pdf");
    expect(h.audits.map((a) => a.action)).toEqual(["training_requested", "training_requested"]);
    expect(h.audits[0].details).toMatchObject({ deal: fakeId(1), value_per_day: 100000, days: 5, participants: 25 });
  });

  it("“Mixed / all departments” saves only the levels and says so", async () => {
    h.me = { id: USER, role: "approver", full_name: "Manager" };
    const r = await createRequest(await uploadedRequest({ audience: { ...validRequest().audience, department_ids: [], all_departments: true } }));
    expect(r.error).toBeUndefined();
    expect(h.fake.tables.deals[0]).toMatchObject({ all_departments: true });
    expect(h.fake.tables.deal_audience.map((x) => x.lookup_id)).toEqual([LEVEL_MID, LEVEL_SENIOR]);
    expect(Object.fromEntries(h.notified.at(-1)!.email!.rows!)["Departments"]).toBe("Mixed / all departments");
  });

  it("booking manager: a day without a trainer goes on the calendar as needs_trainer", async () => {
    h.me = { id: USER, role: "approver", full_name: "Manager" };
    const r = await createRequest(await uploadedRequest({ days: [{ ...validRequest().days[0], trainer_id: undefined }] }));
    expect(r.error).toBeUndefined();
    expect(h.fake.tables.bookings[0]).toMatchObject({ status: "needs_trainer", trainer_id: null, decided_at: null, deal_id: fakeId(1) });
    expect(h.notified.map((n) => n.title)).toEqual(["Trainer needed: Aman Holding HR"]);
  });
});

describe("New deal: refusals leave nothing behind", () => {
  it("trainers can't create deals", async () => {
    h.me = { id: USER, role: "trainer", full_name: "T" };
    await expect(createRequest(await uploadedRequest())).rejects.toThrow(/REDIRECT/);
    expect(h.fake.writes).toEqual([]);
  });

  it("invalid input is refused before any write", async () => {
    const r = await createRequest(await uploadedRequest({ audience: { ...validRequest().audience, level_ids: [] } }));
    expect(r.error).toMatch(/seniority level/);
    expect(h.fake.writes).toEqual([]);
  });

  it("ids that aren't real levels or departments are refused (a department sent as a level, an unknown id)", async () => {
    const swapped = await createRequest(await uploadedRequest({ audience: { ...validRequest().audience, level_ids: [DEPT_HR] } }));
    expect(swapped.error).toBe("Pick the seniority levels again.");
    const unknown = await createRequest(await uploadedRequest({ audience: { ...validRequest().audience, department_ids: [OTHER_TRAINER] } }));
    expect(unknown.error).toBe("Pick the departments again.");
    expect(h.fake.writes).toEqual([]);
  });

  it("a proposal that never reached storage is refused", async () => {
    const r = await createRequest(validRequest());
    expect(r.error).toMatch(/didn't finish uploading/);
    expect(h.fake.writes).toEqual([]);
  });

  it("a trainer who is no longer free is refused", async () => {
    h.free = [{ id: OTHER_TRAINER, full_name: "Someone else", title: null, total: 50, lookups: [] }];
    const r = await createRequest(await uploadedRequest());
    expect(r.error).toMatch(/no longer available/);
    expect(h.fake.writes).toEqual([]);
  });

  it("if the audience can't be saved, the deal is removed again", async () => {
    h.fake.failNextInsert("deal_audience", "boom");
    const r = await createRequest(await uploadedRequest());
    expect(r.error).toBeTruthy();
    expect(h.fake.tables.deals).toEqual([]);
    expect(h.fake.tables.bookings ?? []).toEqual([]);
  });

  it("if the bookings are refused (slot already booked), the deal and its audience are removed again", async () => {
    h.fake.failNextInsert("bookings", "slot_already_booked");
    const r = await createRequest(await uploadedRequest());
    expect(r.error).toBe("This trainer is already booked in that slot.");
    expect(h.fake.tables.deals).toEqual([]);
    expect(h.fake.tables.deal_audience).toEqual([]);
    expect(h.notified).toEqual([]);
    expect(h.audits).toEqual([]);
  });
});

describe("New deal: helpers around the form", () => {
  const day = [{ day_number: 1, date: "2026-11-10", start: "10:00", end: "15:00" }];
  it("trainer options need the industry and a seniority level", async () => {
    expect(await requestTrainerOptions({ industry_id: "", level_ids: [LEVEL_MID], department_ids: [], days: [] })).toEqual({ error: "Pick the industry first." });
    expect(await requestTrainerOptions({ industry_id: INDUSTRY, level_ids: [], department_ids: [], days: day })).toEqual({ error: "Pick at least one seniority level first." });
    expect(await requestTrainerOptions({ industry_id: INDUSTRY, level_ids: [LEVEL_MID], department_ids: ["x"], days: day })).toEqual({ error: "Pick the departments again." });
  });

  it("trainer options are filtered by level and ranked by departments covered", async () => {
    h.free = [
      { id: "t-none", full_name: "No depts", title: null, total: 99, lookups: [] },
      { id: "t-both", full_name: "Both depts", title: null, total: 10, lookups: [{ id: DEPT_HR }, { id: DEPT_FIN }] },
      { id: "t-one", full_name: "One dept", title: "Coach", total: 50, lookups: [{ id: DEPT_FIN }] },
    ];
    const r = await requestTrainerOptions({ industry_id: INDUSTRY, level_ids: [LEVEL_SENIOR], department_ids: [DEPT_HR, DEPT_FIN], days: day });
    expect(h.searches[0]).toMatchObject({ industryId: INDUSTRY, audienceIds: [LEVEL_SENIOR], audienceId: "", functionId: "" });
    expect(r).toEqual({
      days: [
        [
          { id: "t-both", full_name: "Both depts", title: null, departments: 2 },
          { id: "t-one", full_name: "One dept", title: "Coach", departments: 1 },
          { id: "t-none", full_name: "No depts", title: null, departments: 0 },
        ],
      ],
    });
  });

  it("proposal uploads go to the uploader's own folder and only allow documents", async () => {
    expect(await createProposalUpload("run.exe", 10)).toEqual({ error: expect.stringMatching(/PDF, Word/) });
    const u = await createProposalUpload("Big Deal (v2).pdf", 10);
    expect(u).toEqual({ path: expect.stringMatching(new RegExp(`^${USER}/[0-9a-f-]{36}-Big Deal _v2_.pdf$`)), token: "upload-token" });
  });

  it("the proposal download is for the Meska team only", async () => {
    const input = await uploadedRequest();
    await createRequest(input);
    expect(await proposalLink(fakeId(1))).toEqual({ url: expect.stringContaining(input.proposal.path) });
    expect(await proposalLink("nope")).toEqual({ error: "File not found." });
    h.me = { id: "t", role: "trainer", full_name: "T" };
    await expect(proposalLink(fakeId(1))).rejects.toThrow(/REDIRECT/);
  });
});
