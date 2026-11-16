// Who hears about a change to a training: a Growth change always reaches Training Excellence.

import { describe, expect, it, vi } from "vitest";

const TE = { id: "te-1", email: "te@meska.ai", full_name: "TE Person" };
const BOTH = { id: "both-1", email: "both@meska.ai", full_name: "Growth and TE" };
const GROWTH = { id: "growth-1", email: "growth@meska.ai", full_name: "Growth Person" };
vi.mock("@/lib/notify", () => ({
  usersWithRoles: async () => [TE, BOTH],
  staffById: async (id: string | null) => [TE, BOTH, GROWTH].find((u) => u.id === id) ?? null,
}));

const { trainingTeam } = await import("@/lib/team");
const ids = (l: { id: string }[]) => l.map((u) => u.id).sort();

describe("trainingTeam", () => {
  it("a Growth editor who also holds Training Excellence still gets the Training Excellence copy", async () => {
    expect(ids(await trainingTeam({ deal_id: "d", created_by: BOTH.id }, { id: BOTH.id, role: "growth" }))).toEqual(["both-1", "te-1"]);
  });
  it("a Growth editor never gets their own change as the requester", async () => {
    expect(ids(await trainingTeam({ deal_id: "d", created_by: GROWTH.id }, { id: GROWTH.id, role: "growth" }))).toEqual(["both-1", "te-1"]);
  });
  it("a change made in the Training Excellence view leaves the editor out", async () => {
    expect(ids(await trainingTeam({ deal_id: "d", created_by: GROWTH.id }, { id: BOTH.id, role: "approver" }))).toEqual(["growth-1", "te-1"]);
  });
});
