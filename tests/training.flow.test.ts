// Training Excellence reassigns or cancels a whole training, and a trainer marks a day as delivered with a brief and audio.

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
vi.mock("@/lib/search", () => ({ searchTrainers: async () => ({ matches: [], slots: [], unavailableCount: 0 }) }));
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
    userWithRole: async () => null,
    trainerRecipient: async () => ({ id: "", email: "trainer@example.com", full_name: "Trainer One" }),
  };
});

const { cancelTraining, createAudioUpload, deleteTraining, reassignTraining, recordAudioFile, recordBriefFile, submitBrief } = await import("@/app/(app)/bookings/actions");

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

  it("needs the audio", async () => {
    expect(await submitBrief(TODAY_DAY, "It went well.")).toEqual({ error: expect.stringMatching(/audio is required/) });
    expect(row(TODAY_DAY).finished_at).toBeNull();
  });
  it("needs the brief, and audio alone doesn't count as one", async () => {
    await addAudio();
    expect(await submitBrief(TODAY_DAY, "  ")).toEqual({ error: expect.stringMatching(/brief is required/) });
    expect(row(TODAY_DAY).finished_at).toBeNull();
  });
  it("delivered with both, and the team is told", async () => {
    expect(await addAudio()).toEqual({ ok: "Added session.mp3." });
    expect(await submitBrief(TODAY_DAY, "It went well.")).toEqual({ ok: expect.stringMatching(/marked as delivered/) });
    expect(row(TODAY_DAY)).toMatchObject({ brief: "It went well.", finished_at: expect.any(String), brief_submitted_at: expect.any(String) });
    expect(h.notified).toContainEqual({ to: ["admin@meska.ai", "content@meska.ai", "growth@meska.ai"], title: "Training delivered: AI in HR — Day 1" });
    expect(h.audits).toEqual(["audio_uploaded", "brief_submitted"]);
  });
  it("a brief document with audio is enough", async () => {
    await addAudio();
    const path = `${TODAY_DAY}/brief-1-notes.pdf`;
    await recordBriefFile(TODAY_DAY, path, "notes.pdf", 10);
    expect(await submitBrief(TODAY_DAY, "")).toEqual({ ok: expect.stringMatching(/marked as delivered/) });
  });
  it("a day delivered before audio was required can still update its brief", async () => {
    h.fake.tables.bookings = [day(TODAY_DAY, 1, { date: PAST, finished_at: "2001-01-10T18:00:00Z" })];
    expect(await submitBrief(TODAY_DAY, "Updated.")).toEqual({ ok: expect.stringMatching(/Brief updated/) });
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
