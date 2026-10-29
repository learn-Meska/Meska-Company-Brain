// Golden test for the main flow: Growth sends a New deal → the deal, its participants and one booking per day
// are saved, the trainer is emailed, the booking team is notified, and nothing is left behind when a step fails.
// The exact database writes are compared with tests/golden/*.json. Update them only for an intended change
// (`npm run test:update`), and review the diff.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, fakeId } from "./support/fake-db";
import { validRequest } from "./support/requests";

const USER = "11111111-1111-4111-8111-111111111111";
const INDUSTRY = "22222222-2222-4222-8222-222222222222";
const TRAINER = "33333333-3333-4333-8333-333333333333";
const OTHER_TRAINER = "44444444-4444-4444-8444-444444444444";

const h = vi.hoisted(() => ({
  fake: null as unknown as ReturnType<typeof import("./support/fake-db").createFakeDb>,
  me: { id: "", role: "growth", full_name: "Growth Person" },
  free: [] as { id: string; full_name: string; title: string | null }[],
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
vi.mock("@/lib/search", () => ({ searchTrainers: async () => ({ matches: h.free, slots: [], unavailableCount: 0 }) }));
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
    lookups: [{ id: INDUSTRY, kind: "industry", name: "Banking" }],
  });
  h.me = { id: USER, role: "growth", full_name: "Growth Person" };
  h.free = [{ id: TRAINER, full_name: "Trainer One", title: "AI coach" }];
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
  it("Growth: saves deal → participants → bookings (golden writes) and notifies", async () => {
    const input = await uploadedRequest({
      days: [
        { day_number: 1, date: "2026-11-10", start: "10:00", end: "15:00", location: " Cairo ", trainer_id: TRAINER },
        { day_number: 2, date: "2026-11-11", start: "18:00", end: "22:00", location: "", trainer_id: TRAINER },
      ],
      same_trainer: true,
    });
    const r = await createRequest(input);
    expect(r).toEqual({ ok: expect.stringContaining("Request sent"), ids: [fakeId(4), fakeId(5)] });

    await expect(stable(h.fake.writes)).toMatchFileSnapshot("./golden/create-request.writes.json");

    // every day points at the one deal, with the industry and no audience level / function
    const bookings = h.fake.tables.bookings;
    expect(new Set(bookings.map((b) => b.deal_id))).toEqual(new Set([fakeId(1)]));
    expect(bookings.every((b) => b.industry_id === INDUSTRY && b.audience_id === null && b.function_id === null)).toBe(true);
    expect(bookings.map((b) => b.status)).toEqual(["awaiting_trainer", "awaiting_trainer"]);
    // no per-day content is asked for any more; the NOT NULL column gets ""
    expect(bookings.map((b) => b.content)).toEqual(["", ""]);

    // trainer emailed once per day, booking team once; the trainer copy never carries deal or contact details
    expect(h.notified.map((n) => n.title)).toEqual([
      expect.stringMatching(/^New training assigned/),
      expect.stringMatching(/^New training assigned/),
      "New booking: Aman Holding HR — trainer emailed",
    ]);
    const trainerRows = h.notified[0].email!.rows!.map(([k]) => k);
    expect(trainerRows).toEqual(["Program", "Date", "Time", "Location", "Industry", "Status"]);
    const teamRows = Object.fromEntries(h.notified[2].email!.rows!);
    expect(teamRows["Participants"]).toBe("2");
    expect(teamRows["Deal value"]).toBe("100,000 per day × 5 days = <b>500,000</b>");
    expect(teamRows["Proposal"]).toBe("Proposal.pdf");
    expect(h.audits.map((a) => a.action)).toEqual(["training_requested", "training_requested"]);
    expect(h.audits[0].details).toMatchObject({ deal: fakeId(1), value_per_day: 100000, days: 5, participants: 2 });
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
    const r = await createRequest(await uploadedRequest({ participants: [] }));
    expect(r.error).toMatch(/participants file/);
    expect(h.fake.writes).toEqual([]);
  });

  it("a proposal that never reached storage is refused", async () => {
    const r = await createRequest(validRequest());
    expect(r.error).toMatch(/didn't finish uploading/);
    expect(h.fake.writes).toEqual([]);
  });

  it("a trainer who is no longer free is refused", async () => {
    h.free = [{ id: OTHER_TRAINER, full_name: "Someone else", title: null }];
    const r = await createRequest(await uploadedRequest());
    expect(r.error).toMatch(/no longer available/);
    expect(h.fake.writes).toEqual([]);
  });

  it("if the participants can't be saved, the deal is removed again", async () => {
    h.fake.failNextInsert("deal_participants", "boom");
    const r = await createRequest(await uploadedRequest());
    expect(r.error).toBeTruthy();
    expect(h.fake.tables.deals).toEqual([]);
    expect(h.fake.tables.bookings ?? []).toEqual([]);
  });

  it("if the bookings are refused (slot already booked), the deal and participants are removed again", async () => {
    h.fake.failNextInsert("bookings", "slot_already_booked");
    const r = await createRequest(await uploadedRequest());
    expect(r.error).toBe("This trainer is already booked in that slot.");
    expect(h.fake.tables.deals).toEqual([]);
    expect(h.fake.tables.deal_participants).toEqual([]);
    expect(h.notified).toEqual([]);
    expect(h.audits).toEqual([]);
  });
});

describe("New deal: helpers around the form", () => {
  it("trainer options only need the industry now", async () => {
    expect(await requestTrainerOptions({ industry_id: "", days: [] })).toEqual({ error: "Pick the industry first." });
    expect(await requestTrainerOptions({ industry_id: INDUSTRY, days: [{ day_number: 1, date: "2026-11-10", start: "10:00", end: "15:00" }] })).toEqual({
      days: [[{ id: TRAINER, full_name: "Trainer One", title: "AI coach" }]],
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
