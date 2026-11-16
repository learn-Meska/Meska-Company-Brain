// A new trainer always gets an email: creating the profile sends the invitation right away.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./support/fake-db";

const NEW_LOGIN = "77777777-7777-4777-8777-777777777777";

const h = vi.hoisted(() => ({
  fake: null as unknown as ReturnType<typeof import("./support/fake-db").createFakeDb>,
  invites: [] as { email: string; name: string }[],
  emails: [] as { to: string; subject: string }[],
  gmailOk: true,
  audits: [] as string[],
}));

vi.mock("@/lib/supabase", () => ({
  db: () => ({
    ...h.fake.client,
    from: h.fake.client.from.bind(h.fake.client),
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { id: NEW_LOGIN, email: null, last_sign_in_at: null } }, error: null }),
        updateUserById: async () => ({ data: {}, error: null }),
      },
    },
  }),
  authClient: async () => ({}),
}));
vi.mock("@/lib/auth", () => {
  const me = { id: "te-1", role: "approver", real_role: "approver", full_name: "Booking Manager" };
  return {
    requireTrainerManager: async () => me,
    requireRole: async () => me,
    requireSettingsEditor: async () => me,
    mainRole: (r: string[]) => r[0],
  };
});
vi.mock("@/lib/team-invite", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/team-invite")>();
  return {
    ...real,
    ensureAuthUser: async () => ({ id: NEW_LOGIN, isNew: true }),
    sendInvite: async (email: string, name: string) => {
      h.invites.push({ email, name });
      return h.gmailOk;
    },
  };
});
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return { ...real, sendEmail: async (to: string, subject: string) => (h.emails.push({ to, subject }), h.gmailOk) };
});
vi.mock("@/lib/notify", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/notify")>();
  return { ...real, audit: async (_by: string, action: string) => void h.audits.push(action) };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { createTrainer, updateTrainer } = await import("@/app/(app)/admin/actions");

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  h.fake = createFakeDb();
  h.invites = [];
  h.emails = [];
  h.gmailOk = true;
  h.audits = [];
});

describe("creating a trainer emails them", () => {
  it("sends the set-your-password invitation as soon as the profile is created", async () => {
    const r = await createTrainer(form({ full_name: "Sara Trainer", email: "Sara@Example.com" }));
    expect(r).toMatchObject({ ok: expect.stringContaining("Profile created"), inviteFailed: false, inviteNote: "Invitation sent to sara@example.com." });
    expect(h.invites).toEqual([{ email: "sara@example.com", name: "Sara Trainer" }]);
    expect(h.audits).toEqual(["trainer_created", "trainer_invited"]);
    const t = (h.fake.tables.trainers as { email: string; user_id: string | null; invited_at: string | null }[])[0];
    expect(t).toMatchObject({ email: "sara@example.com", user_id: NEW_LOGIN });
    expect(t.invited_at).toBeTruthy();
  });

  it("says so when Gmail refuses the email, instead of claiming it was sent", async () => {
    h.gmailOk = false;
    const r = await createTrainer(form({ full_name: "Sara Trainer", email: "sara@example.com" }));
    expect(r).toMatchObject({ inviteFailed: true, inviteNote: expect.stringMatching(/invitation email failed/) });
    expect(h.audits).not.toContain("trainer_invited");
  });

  it("without an email nothing can be sent, and the page says to add one", async () => {
    const r = await createTrainer(form({ full_name: "No Email" }));
    expect(r).toMatchObject({ inviteFailed: true, inviteNote: expect.stringMatching(/No email on the profile/) });
    expect(h.invites).toEqual([]);
  });

  it("adding an email later to a trainer without a login sends the invitation", async () => {
    const r = await createTrainer(form({ full_name: "Late Email" }));
    const id = (r as { id: string }).id;
    const saved = await updateTrainer(form({ id, full_name: "Late Email", email: "late@example.com" }));
    expect(saved).toMatchObject({ ok: expect.stringContaining("Invitation sent to late@example.com.") });
    expect(h.invites).toEqual([{ email: "late@example.com", name: "Late Email" }]);
  });
});
