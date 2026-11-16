// Training Excellence assigns, reassigns or cancels a training; Growth edits a day and asks for changes without
// ever picking the trainer; and a trainer marks a day as delivered with a brief and audio.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./support/fake-db";

const DEAL = "55555555-5555-4555-8555-555555555555";
const TRAINER = "33333333-3333-4333-8333-333333333333";
const DONE_DAY = "66666666-6666-4666-8666-666666666661";
const NEXT_DAY = "66666666-6666-4666-8666-666666666662";
const LAST_DAY = "66666666-6666-4666-8666-666666666663";
const FUTURE = "2099-01-10";
const PAST = "2001-01-10";

const h = vi.hoisted(() => ({
  fake: null as unknown as ReturnType<typeof import("./support/fake-db").createFakeDb>,
  me: { id: "manager-1", role: "approver", full_name: "Mahmoud", trainer_id: null as string | null },
  notified: [] as { to: string[]; title: string }[],
  audits: [] as string[],
  // the trainers the availability search finds free
  free: [] as { id: string; full_name?: string }[],
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
  requireTrainer: async () => h.me,
};
});
vi.mock("@/lib/search", () => ({ searchTrainers: async () => ({ matches: h.free, slots: [], unavailableCount: 0 }) }));
vi.mock("@/lib/scoring", () => ({ getSetting: async (_k: string, fallback: unknown) => fallback }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/notify", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/notify")>();
  return {
    ...real,
    audit: async (_by: string, action: string) => void h.audits.push(action),
    notify: async (to: ({ email: string | null } | null)[], n: { title: string }) => void h.notified.push({ to: to.map((r) => r?.email ?? "?"), title: n.title }),
    usersWithRoles: async (...roles: string[]) => [
      { id: "admin-1", email: "admin@meska.ai", full_name: "Admin" },
      ...(roles.includes("content") ? [{ id: "content-1", email: "content@meska.ai", full_name: "Content Person" }] : []),
    ],
    userById: async (id: string | null) => (id === "growth-1" ? { id, email: "growth@meska.ai", full_name: "Growth Person" } : null),
    // the requester, while still on the team
    staffById: async (id: string | null) => (id === "growth-1" ? { id, email: "growth@meska.ai", full_name: "Growth Person" } : null),
    userWithRole: async () => null,
    trainerRecipient: async () => ({ id: "", email: "trainer@example.com", full_name: "Trainer One" }),
  };
});

const { assignTrainer, cancelTraining, createAudioUpload, deleteTraining, editAvailability, editBooking, editTrainerOptions, reassignTraining, recordAudioFile, recordBriefFile, respondBooking, submitBrief } = await import("@/app/(app)/bookings/actions");
const { requestChange, resolveChangeRequest, withdrawChangeRequest } = await import("@/app/(app)/bookings/change-actions");
const { saveParticipants } = await import("@/app/(app)/bookings/deal-actions");

const day = (id: string, n: number, over: Record<string, unknown> = {}) => ({
  id,
  deal_id: DEAL,
  batch_id: "77777777-7777-4777-8777-777777777777",
  program_name: "AI in HR",
  day_number: n,
  date: FUTURE,
  start_time: "10:00:00",
  end_time: "15:00:00",
  location: "Cairo",
  status: "confirmed",
  trainer_id: TRAINER,
  finished_at: null,
  created_by: "growth-1",
  content: "",
  ...over,
});
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const row = (id: string) => h.fake.tables.bookings.find((b) => b.id === id)!;
const LONG_REASON = "The client postponed the whole program. ".repeat(5);

beforeEach(() => {
  h.fake = createFakeDb({ trainers: [{ id: TRAINER, full_name: "Trainer One", email: "trainer@example.com" }] });
  h.fake.tables.bookings = [
    day(DONE_DAY, 1, { date: PAST, finished_at: "2001-01-10T18:00:00Z" }),
    day(NEXT_DAY, 2, { status: "awaiting_trainer" }),
    day(LAST_DAY, 3),
  ];
  h.fake.tables.booking_materials = [];
  h.me = { id: "manager-1", role: "approver", full_name: "Mahmoud", trainer_id: null };
  h.notified = [];
  h.audits = [];
  h.free = [];
});

const asGrowth = (id = "growth-1") => void (h.me = { id, role: "growth", full_name: "Growth Person", trainer_id: null });
const asManager = () => void (h.me = { id: "manager-1", role: "approver", full_name: "Mahmoud", trainer_id: null });

describe("assigning a trainer to Growth's request", () => {
  beforeEach(() => {
    h.fake.tables.bookings = [day(NEXT_DAY, 1, { status: "needs_trainer", trainer_id: null })];
  });
  it("emails the trainer and tells the team, including the Growth requester", async () => {
    expect(await assignTrainer([{ bookingId: NEXT_DAY, trainerId: TRAINER }])).toEqual({ ok: expect.stringMatching(/^Assigned/) });
    expect(row(NEXT_DAY)).toMatchObject({ status: "awaiting_trainer", trainer_id: TRAINER, approver_id: "manager-1" });
    expect(h.notified).toEqual([
      { to: ["trainer@example.com"], title: "New training assigned: AI in HR — Day 1" },
      { to: ["admin@meska.ai", "content@meska.ai", "growth@meska.ai"], title: "Mahmoud assigned Trainer One to AI in HR" },
    ]);
    expect(h.audits).toEqual(["trainer_assigned"]);
  });
  it("only Training Excellence and admins assign; Growth never does", async () => {
    for (const role of ["growth", "content", "trainer"]) {
      h.me = { ...h.me, role };
      await expect(assignTrainer([{ bookingId: NEXT_DAY, trainerId: TRAINER }])).rejects.toThrow(/REDIRECT/);
    }
    expect(row(NEXT_DAY)).toMatchObject({ status: "needs_trainer", trainer_id: null });
  });
});

describe("Growth edits a day without picking the trainer", () => {
  const NEW_DATE = "2099-01-11";
  const fields = (over: Record<string, string> = {}) => form({ id: NEXT_DAY, program_name: "AI in HR", day_number: "1", date: FUTURE, start: "10:00", end: "15:00", location: "Cairo", content: "", ...over });
  beforeEach(() => {
    asGrowth();
    h.fake.tables.bookings = [day(NEXT_DAY, 1, { status: "awaiting_trainer" })];
  });
  it("can't choose or remove the trainer, even by calling the action directly", async () => {
    for (const pick of ["44444444-4444-4444-8444-444444444444", "none"]) {
      expect(await editBooking(fields({ trainer_id: pick }))).toEqual({ error: expect.stringMatching(/Training Excellence assigns the trainer/) });
    }
    expect(row(NEXT_DAY)).toMatchObject({ trainer_id: TRAINER, status: "awaiting_trainer" });
    await expect(editTrainerOptions(NEXT_DAY, { date: NEW_DATE, start: "10:00", end: "15:00" })).rejects.toThrow(/REDIRECT/);
  });
  it("only learns yes or no about the new date and time", async () => {
    h.free = [{ id: TRAINER, full_name: "Trainer One" }];
    const r = await editAvailability(NEXT_DAY, { date: NEW_DATE, start: "10:00", end: "15:00" });
    expect(r).toEqual({ trainerFree: true, otherFree: false });
    expect(JSON.stringify(r)).not.toMatch(/Trainer One|3333/);
    h.free = [{ id: "someone-else" }];
    expect(await editAvailability(NEXT_DAY, { date: NEW_DATE, start: "10:00", end: "15:00" })).toEqual({ trainerFree: false, otherFree: true });
  });
  it("keeps the trainer when they are free at the new date", async () => {
    h.free = [{ id: TRAINER }];
    expect(await editBooking(fields({ date: NEW_DATE }))).toEqual({ ok: expect.stringMatching(/^Saved/) });
    expect(row(NEXT_DAY)).toMatchObject({ date: NEW_DATE, trainer_id: TRAINER, status: "awaiting_trainer" });
  });
  it("sends the day back to Training Excellence when the trainer isn't free at the new date", async () => {
    expect(await editBooking(fields({ date: NEW_DATE }))).toEqual({ ok: expect.stringMatching(/went back to Training Excellence/) });
    expect(row(NEXT_DAY)).toMatchObject({ date: NEW_DATE, trainer_id: null, status: "needs_trainer", approver_id: null });
    expect(h.notified.map((n) => n.title)).toEqual(["You are no longer assigned: AI in HR — Day 1", "Training updated: AI in HR — Day 1"]);
    expect(h.audits).toEqual(["booking_edited", "trainer_removed"]);
  });
});

describe("change requests", () => {
  const REASON = "The client asked for a trainer with banking experience.";
  const NOTE = "The client approved this trainer in writing last week.";
  const requests = () => h.fake.tables.training_change_requests ?? [];
  const ask = (kind = "trainer", id = LAST_DAY) => requestChange(form({ id, kind, reason: REASON }));

  it("Growth asks for a different trainer with a reason; Training Excellence is told, the trainer is not", async () => {
    asGrowth();
    expect(await requestChange(form({ id: LAST_DAY, kind: "trainer", reason: "no" }))).toEqual({ error: expect.stringMatching(/reason/) });
    expect(await ask()).toEqual({ ok: expect.stringMatching(/Request sent/) });
    expect(requests()).toMatchObject([{ booking_id: LAST_DAY, kind: "trainer", reason: REASON, requested_by: "growth-1", status: "open" }]);
    expect(h.notified).toEqual([{ to: ["admin@meska.ai"], title: "Growth Person asked for a different trainer: AI in HR" }]);
    expect(h.audits).toEqual(["change_requested"]);
    // one request is open per training at a time, whichever day it is raised from
    expect(await ask("date", NEXT_DAY)).toEqual({ error: expect.stringMatching(/already waiting/) });
    expect(requests()).toHaveLength(1);
  });
  it("only on a training that Growth login can open, and never a trainer or the content team", async () => {
    asGrowth("growth-2");
    expect(await ask()).toEqual({ error: "Training not found." });
    for (const role of ["trainer", "content", "approver"]) {
      h.me = { ...h.me, role };
      await expect(ask()).rejects.toThrow(/REDIRECT/);
    }
    expect(requests()).toEqual([]);
  });
  it("a different trainer can't be asked for when no upcoming day has one", async () => {
    asGrowth();
    h.fake.tables.bookings = [day(NEXT_DAY, 1, { status: "needs_trainer", trainer_id: null })];
    expect(await ask("trainer", NEXT_DAY)).toEqual({ error: expect.stringMatching(/has a trainer to change/) });
    expect(await ask("cancel", NEXT_DAY)).toEqual({ ok: expect.stringMatching(/Request sent/) });
  });
  it("Training Excellence keeps the trainer with a note, and Growth is told", async () => {
    asGrowth();
    await ask();
    asManager();
    h.notified = [];
    const id = String(requests()[0].id);
    expect(await resolveChangeRequest(form({ id, outcome: "declined", note: "" }))).toEqual({ error: expect.stringMatching(/short note/) });
    expect(await resolveChangeRequest(form({ id, outcome: "declined", note: NOTE }))).toEqual({ ok: expect.stringMatching(/^Declined/) });
    expect(requests()[0]).toMatchObject({ status: "declined", resolution_note: NOTE, resolved_by: "manager-1" });
    expect(h.notified).toEqual([{ to: ["growth@meska.ai"], title: "Declined: your request for a different trainer — AI in HR" }]);
    // a request is answered once
    expect(await resolveChangeRequest(form({ id, outcome: "done", note: "" }))).toEqual({ error: expect.stringMatching(/already answered/) });
    // and Growth can then send a new one
    asGrowth();
    expect(await ask()).toEqual({ ok: expect.stringMatching(/Request sent/) });
  });
  it("reassigning the trainer closes the request on its own and tells Growth", async () => {
    asGrowth();
    await ask();
    asManager();
    h.notified = [];
    await reassignTraining(form({ id: NEXT_DAY }));
    expect(requests()[0]).toMatchObject({ status: "done", resolved_by: "manager-1" });
    expect(h.notified.at(-1)).toEqual({ to: ["growth@meska.ai"], title: "Your change request was closed: AI in HR" });
  });
  it("a trainer who declines closes a request about them", async () => {
    asGrowth();
    h.fake.tables.bookings = [day(NEXT_DAY, 1, { status: "awaiting_trainer" })];
    await ask("trainer", NEXT_DAY);
    h.me = { id: "trainer-user", role: "trainer", full_name: "Trainer One", trainer_id: TRAINER };
    expect(await respondBooking(NEXT_DAY, false, "I am travelling that week.")).toEqual({ ok: expect.any(String) });
    expect(requests()[0]).toMatchObject({ status: "done", resolved_by: null });
  });
  it("cancelling the training closes a request to cancel it", async () => {
    asGrowth();
    await ask("cancel");
    asManager();
    await cancelTraining(form({ id: NEXT_DAY, reason: LONG_REASON }));
    expect(requests()[0]).toMatchObject({ status: "done" });
  });
  it("Growth can withdraw a waiting request", async () => {
    asGrowth();
    await ask();
    h.notified = [];
    const id = String(requests()[0].id);
    expect(await withdrawChangeRequest(form({ id }))).toEqual({ ok: "Request withdrawn." });
    expect(requests()[0]).toMatchObject({ status: "withdrawn" });
    expect(h.notified).toEqual([{ to: ["admin@meska.ai"], title: "Change request withdrawn: AI in HR" }]);
    expect(await withdrawChangeRequest(form({ id }))).toEqual({ error: expect.stringMatching(/already answered/) });
  });
  it("Growth can't answer its own request", async () => {
    asGrowth();
    await ask();
    await expect(resolveChangeRequest(form({ id: String(requests()[0].id), outcome: "done", note: "" }))).rejects.toThrow(/REDIRECT/);
    expect(requests()[0]).toMatchObject({ status: "open" });
  });
});

describe("adding the participant list after the deal was sent", () => {
  const people = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Person ${i + 1}`, title: "", department: "HR" }));
  beforeEach(() => {
    h.fake.tables.deal_participants = [];
  });
  it("Growth adds it on its own deal and can replace it; the team and the content team are told", async () => {
    asGrowth();
    expect(await saveParticipants(NEXT_DAY, people(1))).toEqual({ ok: expect.stringMatching(/^Saved 1 participant\./) });
    expect(h.fake.tables.deal_participants).toMatchObject([{ deal_id: DEAL, position: 1, name: "Person 1", title: null, department: "HR" }]);
    expect(h.notified).toEqual([{ to: ["admin@meska.ai", "content@meska.ai"], title: "Participant list added: AI in HR" }]);
    await saveParticipants(NEXT_DAY, people(3));
    expect(h.fake.tables.deal_participants.map((p) => p.name)).toEqual(["Person 1", "Person 2", "Person 3"]);
    expect(h.notified.at(-1)!.title).toBe("Participant list updated: AI in HR");
    expect(h.audits).toEqual(["participants_updated", "participants_updated"]);
  });
  it("refuses an empty or broken list and leaves the saved one alone", async () => {
    asGrowth();
    await saveParticipants(NEXT_DAY, people(2));
    expect(await saveParticipants(NEXT_DAY, [])).toEqual({ error: expect.stringMatching(/no participants/) });
    expect(await saveParticipants(NEXT_DAY, "x")).toEqual({ error: expect.stringMatching(/participants file/) });
    expect(await saveParticipants(NEXT_DAY, [{ name: "  " }])).toEqual({ error: expect.stringMatching(/name is missing/) });
    expect(h.fake.tables.deal_participants).toHaveLength(2);
  });
  it("not on someone else's deal, and never a trainer or the content team", async () => {
    asGrowth("growth-2");
    expect(await saveParticipants(NEXT_DAY, people(1))).toEqual({ error: "Training not found." });
    for (const role of ["trainer", "content"]) {
      h.me = { ...h.me, role };
      await expect(saveParticipants(NEXT_DAY, people(1))).rejects.toThrow(/REDIRECT/);
    }
    expect(h.fake.tables.deal_participants).toEqual([]);
  });
});

describe("reassigning a training", () => {
  it("takes the trainer off the days still to come and leaves delivered days alone", async () => {
    expect(await reassignTraining(form({ id: DONE_DAY }))).toEqual({ ok: expect.stringMatching(/Trainer removed/) });
    for (const id of [NEXT_DAY, LAST_DAY]) expect(row(id)).toMatchObject({ status: "needs_trainer", trainer_id: null, approver_id: null, decided_at: null, trainer_comment: null, trainer_responded_at: null });
    expect(row(DONE_DAY)).toMatchObject({ status: "confirmed", trainer_id: TRAINER });
    expect(h.audits).toEqual(["trainer_removed", "trainer_removed"]);
  });
  it("tells the trainer for each day, and the team once", async () => {
    await reassignTraining(form({ id: NEXT_DAY }));
    expect(h.notified.filter((n) => n.to.includes("trainer@example.com"))).toHaveLength(2);
    const team = h.notified.filter((n) => n.to.includes("admin@meska.ai"));
    expect(team).toHaveLength(1);
    // the whole team on the deal: admins and Training Excellence, the content team, and the Growth requester
    expect(team[0].to).toEqual(["admin@meska.ai", "content@meska.ai", "growth@meska.ai"]);
  });
  it("skips a past day the trainer never reported on", async () => {
    h.fake.tables.bookings = [day(DONE_DAY, 1, { date: PAST }), day(NEXT_DAY, 2)];
    await reassignTraining(form({ id: NEXT_DAY }));
    expect(row(DONE_DAY)).toMatchObject({ trainer_id: TRAINER });
    expect(row(NEXT_DAY)).toMatchObject({ trainer_id: null });
  });
  it("does nothing when no upcoming day has a trainer", async () => {
    h.fake.tables.bookings = [day(NEXT_DAY, 1, { status: "needs_trainer", trainer_id: null })];
    expect(await reassignTraining(form({ id: NEXT_DAY }))).toEqual({ error: expect.stringMatching(/No upcoming day/) });
    expect(h.notified).toEqual([]);
  });
  it("only Training Excellence and admins may do it", async () => {
    for (const role of ["growth", "content", "trainer"]) {
      h.me = { ...h.me, role };
      await expect(reassignTraining(form({ id: NEXT_DAY }))).rejects.toThrow(/REDIRECT/);
    }
    expect(row(NEXT_DAY)).toMatchObject({ trainer_id: TRAINER });
  });
  it("refuses an unknown training", async () => expect(await reassignTraining(form({ id: "nope" }))).toEqual({ error: "Training not found." }));
});

describe("cancelling a training", () => {
  it("cancels what is left and keeps delivered days on record", async () => {
    expect(await cancelTraining(form({ id: NEXT_DAY, reason: LONG_REASON }))).toEqual({ ok: expect.stringMatching(/Training cancelled/) });
    expect(row(NEXT_DAY).status).toBe("cancelled");
    expect(row(LAST_DAY).status).toBe("cancelled");
    expect(row(DONE_DAY).status).toBe("confirmed");
    expect(h.audits).toEqual(["booking_cancelled", "booking_cancelled"]);
  });
  it("tells the trainer for each day, and the whole team once with the reason", async () => {
    await cancelTraining(form({ id: NEXT_DAY, reason: LONG_REASON }));
    expect(h.notified.filter((n) => n.to.includes("trainer@example.com")).map((n) => n.title)).toEqual(["Training cancelled: AI in HR — Day 2", "Training cancelled: AI in HR — Day 3"]);
    const team = h.notified.filter((n) => !n.to.includes("trainer@example.com"));
    expect(team).toEqual([{ to: ["admin@meska.ai", "content@meska.ai", "growth@meska.ai"], title: "Training cancelled: AI in HR (2 days)" }]);
  });
  it("leaves out the person who cancelled", async () => {
    h.me = { ...h.me, id: "admin-1", role: "admin" };
    await cancelTraining(form({ id: NEXT_DAY, reason: LONG_REASON }));
    expect(h.notified.at(-1)!.to).toEqual(["content@meska.ai", "growth@meska.ai"]);
  });
  it("keeps a past day the trainer confirmed, and cancels one that never had a trainer", async () => {
    h.fake.tables.bookings = [day(DONE_DAY, 1, { date: PAST }), day(NEXT_DAY, 2, { date: PAST, status: "needs_trainer", trainer_id: null })];
    await cancelTraining(form({ id: DONE_DAY, reason: LONG_REASON }));
    expect(row(DONE_DAY).status).toBe("confirmed");
    expect(row(NEXT_DAY).status).toBe("cancelled");
  });
  it("a reason that is too short changes nothing", async () => {
    expect(await cancelTraining(form({ id: NEXT_DAY, reason: "no" }))).toEqual({ error: expect.stringMatching(/short reason/) });
    expect(row(NEXT_DAY).status).toBe("awaiting_trainer");
    expect(row(LAST_DAY).status).toBe("confirmed");
  });
  it("does nothing when nothing is left to cancel", async () => {
    h.fake.tables.bookings = [day(DONE_DAY, 1, { date: PAST, finished_at: "2001-01-10T18:00:00Z" })];
    expect(await cancelTraining(form({ id: DONE_DAY, reason: LONG_REASON }))).toEqual({ error: expect.stringMatching(/No day/) });
  });
  it("only Training Excellence and admins may do it", async () => {
    h.me = { ...h.me, role: "growth" };
    await expect(cancelTraining(form({ id: NEXT_DAY, reason: LONG_REASON }))).rejects.toThrow(/REDIRECT/);
  });
});

describe("marking a day as delivered", () => {
  const TODAY_DAY = "66666666-6666-4666-8666-666666666664";
  const addAudio = async (id = TODAY_DAY) => {
    const u = (await createAudioUpload(id, "session.mp3")) as { path: string };
    return recordAudioFile(id, u.path, "session.mp3", 1000);
  };
  beforeEach(() => {
    h.me = { id: "trainer-user", role: "trainer", full_name: "Trainer One", trainer_id: TRAINER };
    h.fake.tables.bookings = [day(TODAY_DAY, 1, { date: PAST })];
  });

  const report = (over: Record<string, string> = {}) => ({ attended: "18", topics: "Prompting basics", engagement: "4", challenges: "", follow_up: "", brief: "It went well.", ...over });
  it("the audio is optional: a day is delivered with the report alone", async () => {
    expect(await submitBrief(TODAY_DAY, report())).toEqual({ ok: expect.stringMatching(/Marked as delivered.*report was sent/) });
    expect(row(TODAY_DAY).finished_at).toEqual(expect.any(String));
    expect(h.audits).toEqual(["brief_submitted"]);
  });
  it("needs the delivery report: attendance, topics and engagement", async () => {
    await addAudio();
    expect(await submitBrief(TODAY_DAY, report({ attended: "" }))).toEqual({ error: expect.stringMatching(/attended/) });
    expect(await submitBrief(TODAY_DAY, report({ topics: "  " }))).toEqual({ error: expect.stringMatching(/topics/) });
    expect(await submitBrief(TODAY_DAY, report({ engagement: "0" }))).toEqual({ error: expect.stringMatching(/engagement/) });
    expect(row(TODAY_DAY).finished_at).toBeNull();
  });
  it("delivered with both, and the team is told", async () => {
    expect(await addAudio()).toEqual({ ok: "Added session.mp3." });
    expect(await submitBrief(TODAY_DAY, report())).toEqual({ ok: expect.stringMatching(/Marked as delivered/) });
    expect(row(TODAY_DAY)).toMatchObject({
      brief: "It went well.",
      delivery_report: { attended: 18, topics: "Prompting basics", engagement: 4, challenges: "", follow_up: "" },
      finished_at: expect.any(String),
      brief_submitted_at: expect.any(String),
    });
    expect(h.notified).toContainEqual({ to: ["admin@meska.ai", "content@meska.ai", "growth@meska.ai"], title: "Training delivered: AI in HR — Day 1" });
    expect(h.audits).toEqual(["audio_uploaded", "brief_submitted"]);
  });
  it("notes are optional once the report and audio are there", async () => {
    await addAudio();
    const path = `${TODAY_DAY}/brief-1-notes.pdf`;
    await recordBriefFile(TODAY_DAY, path, "notes.pdf", 10);
    expect(await submitBrief(TODAY_DAY, report({ brief: "" }))).toEqual({ ok: expect.stringMatching(/Marked as delivered/) });
  });
  it("a day delivered before audio was required can still update its report", async () => {
    h.fake.tables.bookings = [day(TODAY_DAY, 1, { date: PAST, finished_at: "2001-01-10T18:00:00Z" })];
    expect(await submitBrief(TODAY_DAY, report({ brief: "Updated." }))).toEqual({ ok: expect.stringMatching(/Report updated/) });
  });
  it("audio must be an audio file under this day's own folder", async () => {
    expect(await createAudioUpload(TODAY_DAY, "session.pdf")).toEqual({ error: expect.stringMatching(/MP3/) });
    expect(await recordAudioFile(TODAY_DAY, `${TODAY_DAY}/brief-1-session.mp3`, "session.mp3", 1)).toEqual({ error: "Invalid upload." });
    expect(await recordAudioFile(TODAY_DAY, `${NEXT_DAY}/audio-1-session.mp3`, "session.mp3", 1)).toEqual({ error: "Invalid upload." });
    expect(await recordAudioFile(TODAY_DAY, `${TODAY_DAY}/audio-1-run.exe`, "run.exe", 1)).toEqual({ error: "Invalid upload." });
  });
  it("only the assigned trainer, and not before the day", async () => {
    h.me = { ...h.me, trainer_id: "someone-else" };
    expect(await createAudioUpload(TODAY_DAY, "session.mp3")).toEqual({ error: "Training not found." });
    h.me = { ...h.me, trainer_id: TRAINER };
    h.fake.tables.bookings = [day(TODAY_DAY, 1)];
    expect(await createAudioUpload(TODAY_DAY, "session.mp3")).toEqual({ error: expect.stringMatching(/once the training day/) });
  });
});

describe("deleting a training", () => {
  const asAdmin = () => void (h.me = { id: "admin-1", role: "admin", real_role: "admin", full_name: "Admin", trainer_id: null } as typeof h.me);

  it("only company admins can delete, and only after typing DELETE", async () => {
    await expect(deleteTraining(form({ id: NEXT_DAY, confirm: "DELETE" }))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(h.fake.tables.bookings).toHaveLength(3);
    asAdmin();
    expect(await deleteTraining(form({ id: NEXT_DAY, confirm: "delet" }))).toEqual({ error: "Type DELETE to confirm." });
    expect(h.fake.tables.bookings).toHaveLength(3);
  });

  it("removes the deal, every day and what hangs off them, then returns to the dashboard", async () => {
    asAdmin();
    h.fake.tables.deals = [{ id: DEAL, company_name: "Aman", proposal_path: "growth-1/p.pdf" }];
    h.fake.tables.deal_participants = [{ deal_id: DEAL, name: "A" }];
    h.fake.tables.deal_content = [{ deal_id: DEAL, file_path: `deals/${DEAL}/guide.pdf` }];
    h.fake.tables.booking_materials = [{ id: "m1", booking_id: DONE_DAY, file_path: `${DONE_DAY}/brief-1.pdf`, kind: "brief" }];
    h.fake.tables.notifications = [{ id: "n1", link: `/bookings/${NEXT_DAY}` }, { id: "n2", link: "/bookings/other" }];
    await expect(deleteTraining(form({ id: NEXT_DAY, confirm: "DELETE" }))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(h.fake.tables.bookings).toHaveLength(0);
    expect(h.fake.tables.deals).toHaveLength(0);
    expect(h.fake.tables.deal_participants).toHaveLength(0);
    expect(h.fake.tables.deal_content).toHaveLength(0);
    expect(h.fake.tables.booking_materials).toHaveLength(0);
    expect(h.fake.tables.notifications.map((n) => n.id)).toEqual(["n2"]);
    expect(h.audits).toEqual(["training_deleted"]);
    expect(h.notified).toEqual([]);
  });
});
