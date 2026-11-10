import { describe, expect, it } from "vitest";
import {
  ACCESS,
  applyCategory,
  approvesContent,
  canManageTeam,
  dropCategory,
  cleanPermissions,
  cleanTeamAdmin,
  getsEmails,
  hasAccess,
  homePath,
  ledTeam,
  memberChangeError,
  portalOf,
  TEAMS,
  withoutTeam,
  withPortalAccess,
} from "../src/lib/team-access";

const growthLead = { id: "lead", role: "growth", real_role: "growth", team_admin_of: ["growth"], permissions: [] };
const growthMember = { id: "m1", role: "growth", real_role: "growth", team_admin_of: [], permissions: ["growth.trainers"] };
const companyAdmin = { id: "boss", role: "admin", real_role: "admin", team_admin_of: [], permissions: [] };

describe("portal accesses", () => {
  it("every access key belongs to exactly one portal and has a Get emails access", () => {
    const keys = TEAMS.flatMap((t) => ACCESS[t].map((a) => a.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of TEAMS) for (const a of ACCESS[t]) expect(portalOf(a.key)).toBe(t);
    for (const t of TEAMS) expect(ACCESS[t].some((a) => a.key.endsWith(".emails"))).toBe(true);
  });

  it("a member has only the accesses ticked; a portal admin has all of their portal", () => {
    expect(hasAccess(growthMember, "growth.trainers")).toBe(true);
    expect(hasAccess(growthMember, "growth.new_deal")).toBe(false);
    expect(hasAccess(growthLead, "growth.new_deal")).toBe(true);
    // never another portal's access, even as its admin
    expect(hasAccess(growthLead, "te.assign")).toBe(false);
    expect(hasAccess({ ...growthMember, permissions: ["te.assign"] }, "te.assign")).toBe(false);
  });

  it("accesses only count in the portal being used", () => {
    const both = { id: "x", role: "content", real_role: "growth", team_admin_of: [], permissions: ["growth.new_deal", "content.view"] };
    expect(hasAccess(both, "content.view")).toBe(true);
    expect(hasAccess(both, "growth.new_deal")).toBe(false);
  });

  it("company admins have everything, also while previewing a portal", () => {
    expect(hasAccess(companyAdmin, "te.settings")).toBe(true);
    expect(hasAccess({ ...companyAdmin, role: "growth" }, "growth.deal_value")).toBe(true);
    expect(hasAccess({ ...companyAdmin, role: "growth" }, "te.settings")).toBe(false);
  });

  it("cleans accesses to known keys of portals the person is in", () => {
    expect(cleanPermissions(["growth"], ["growth.new_deal", "te.assign", "made.up"])).toEqual(["growth.new_deal"]);
    expect(withPortalAccess(["te.assign", "growth.calendar"], "growth", ["growth.new_deal", "te.find"])).toEqual(["te.assign", "growth.new_deal"]);
  });

  it("emails go to members with Get emails, and to portal admins", () => {
    expect(getsEmails({ permissions: ["te.emails"] }, "approver")).toBe(true);
    expect(getsEmails({ permissions: ["te.assign"] }, "approver")).toBe(false);
    expect(getsEmails({ team_admin_of: ["content"] }, "content")).toBe(true);
    expect(getsEmails({}, "admin")).toBe(true);
  });

  it("lands each login on the first page it can open", () => {
    expect(homePath({ ...growthLead })).toBe("/request");
    expect(homePath({ id: "t", role: "approver", real_role: "approver", permissions: ["te.compensation"] })).toBe("/compensation");
    expect(homePath({ id: "c", role: "content", real_role: "content", permissions: [] })).toBe("/no-access");
    expect(homePath({ id: "c", role: "content", real_role: "content", permissions: [], team_admin_of: ["content"] })).toBe("/content");
    expect(homePath({ id: "g", role: "growth", real_role: "growth", permissions: [] })).toBe("/bookings");
  });
});

describe("categories", () => {
  it("putting someone in a category sets only that category's accesses", () => {
    const cur = { roles: ["growth"], team_admin_of: [], permissions: ["growth.calendar"] };
    expect(applyCategory(cur, "content", ["content.view", "growth.new_deal"], false)).toEqual({ roles: ["growth", "content"], team_admin_of: [], team_leader_of: [], reports_to: {}, permissions: ["growth.calendar", "content.view"] });
    expect(applyCategory(cur, "growth", ["growth.new_deal"], false).permissions).toEqual(["growth.new_deal"]);
  });

  it("a portal admin gets every access of the portal, and keeps them when made a member again", () => {
    const lead = applyCategory({ roles: [] }, "content", [], true);
    expect(lead.team_admin_of).toEqual(["content"]);
    expect(lead.permissions).toEqual(["content.view", "content.write", "content.submit", "content.emails"]);
    expect(applyCategory(lead, "content", lead.permissions, false)).toEqual({ ...lead, team_admin_of: [] });
  });

  it("company admin keeps the other categories untouched", () => {
    expect(applyCategory({ roles: ["growth"], team_admin_of: ["growth"], permissions: ["growth.new_deal"] }, "admin", [], false)).toEqual({ roles: ["growth", "admin"], team_admin_of: ["growth"], team_leader_of: [], reports_to: {}, permissions: ["growth.new_deal"] });
  });

  it("dropping a category removes its accesses and portal admin", () => {
    expect(dropCategory({ roles: ["growth", "content"], team_admin_of: ["content"], permissions: ["growth.new_deal", "content.view"] }, "content")).toEqual({ roles: ["growth"], team_admin_of: [], team_leader_of: [], reports_to: {}, permissions: ["growth.new_deal"] });
  });
});

describe("portal team management", () => {
  it("a portal admin leads only the portal they are working in", () => {
    expect(ledTeam(growthLead)).toBe("growth");
    expect(ledTeam(growthMember)).toBeNull();
    expect(ledTeam({ ...growthLead, role: "content" })).toBeNull();
    expect(ledTeam(companyAdmin)).toBeNull();
  });

  it("company admins manage every portal; portal admins only their own", () => {
    expect(canManageTeam(companyAdmin, "content")).toBe(true);
    expect(canManageTeam(growthLead, "growth")).toBe(true);
    expect(canManageTeam(growthLead, "content")).toBe(false);
    expect(canManageTeam(growthMember, "growth")).toBe(false);
    expect(canManageTeam({ ...companyAdmin, real_role: "growth" }, "growth")).toBe(false);
  });

  it("portal admin ticks are kept only for portals the person is in", () => {
    expect(cleanTeamAdmin(["growth", "content"], ["growth", "approver", "admin"])).toEqual(["growth"]);
  });

  it("a portal admin can't touch other portals, company admins, or their own access", () => {
    const member = { id: "m1", roles: ["growth"], team_admin_of: [] };
    expect(memberChangeError(growthLead, "growth", member, "access")).toBeNull();
    expect(memberChangeError(growthLead, "growth", member, "remove")).toBeNull();
    expect(memberChangeError(growthLead, "growth", { id: "c", roles: ["content"] }, "remove")).toMatch(/isn't in this portal/);
    expect(memberChangeError(growthLead, "growth", { id: "a", roles: ["admin", "growth"] }, "access")).toMatch(/Team & access/);
    expect(memberChangeError(growthLead, "growth", { id: "lead", roles: ["growth"] }, "access")).toMatch(/your own/);
    expect(memberChangeError(growthLead, "growth", { id: "lead", roles: ["growth"] }, "invite")).toBeNull();
    expect(memberChangeError(growthMember, "growth", member, "remove")).toMatch(/Only this portal's admins/);
  });

  it("removing someone from one portal keeps their other portals and accesses", () => {
    expect(withoutTeam({ id: "x", roles: ["growth", "content"], team_admin_of: ["growth"], permissions: ["growth.new_deal", "content.view"] }, "growth")).toEqual({
      roles: ["content"],
      team_admin_of: [],
      team_leader_of: [],
      reports_to: {},
      permissions: ["content.view"],
    });
  });
});

describe("access invites", () => {
  const sent = { user_id: "u1", created_at: "2026-11-01T10:00:00Z", accepted_at: null };
  const now = new Date("2026-11-03T10:00:00Z").getTime();
  it("works once, for 7 days, only for the person it was sent to", async () => {
    const { inviteProblem } = await import("../src/lib/team-access");
    expect(inviteProblem(sent, "u1", now)).toBeNull();
    expect(inviteProblem(null, "u1", now)).toMatch(/isn't valid/);
    expect(inviteProblem({ ...sent, accepted_at: "2026-11-02T10:00:00Z" }, "u1", now)).toMatch(/already confirmed/);
    expect(inviteProblem(sent, "u1", new Date("2026-11-09T10:00:01Z").getTime())).toMatch(/expired/);
    expect(inviteProblem(sent, "someone-else", now)).toMatch(/another account/);
  });
});

describe("content approval", () => {
  const contentAdmin = { id: "ca", role: "content", real_role: "content", team_admin_of: ["content"], permissions: [] };
  const contentMember = { id: "cm", role: "content", real_role: "content", team_admin_of: [], permissions: ["content.view", "content.write", "content.submit"] };
  it("content admins and company admins submit straight to the trainer", () => {
    expect(approvesContent(contentAdmin)).toBe(true);
    expect(approvesContent(companyAdmin)).toBe(true);
    expect(approvesContent({ ...companyAdmin, role: "content" })).toBe(true);
  });
  it("a content member, even with Submit content, needs approval", () => expect(approvesContent(contentMember)).toBe(false));
  it("a content admin's rights count only in the content view", () => expect(approvesContent({ ...contentAdmin, role: "trainer" })).toBe(false));
  it("other portals' admins can't approve content", () => expect(approvesContent(growthLead)).toBe(false));
});

describe("three layers: portal admin, team leader, member", () => {
  const admin = { id: "a", email: "", full_name: "A", roles: ["growth"], team_admin_of: ["growth"], team_leader_of: [] as string[], reports_to: {} as Record<string, string>, permissions: [] as string[] };
  const leader = { ...admin, id: "l", full_name: "L", team_admin_of: [] as string[], team_leader_of: ["growth"], permissions: ["growth.new_deal"] };
  const mine = { ...leader, id: "m1", full_name: "M1", team_leader_of: [] as string[], reports_to: { growth: "l" } as Record<string, string> };
  const other = { ...mine, id: "m2", full_name: "M2", reports_to: { growth: "a" } as Record<string, string> };
  const boss = { ...admin, id: "boss", full_name: "Boss", roles: ["admin"], team_admin_of: [] as string[] };
  const contentLeader = { ...boss, id: "cl", full_name: "CL", roles: ["content"], team_leader_of: ["content"] };
  const people = [admin, leader, mine, other, boss, contentLeader];
  const actor = (p: (typeof people)[number], role = "growth") => ({ ...p, role, real_role: p.roles.includes("admin") ? "admin" : role });

  it("works out each person's level in a portal", async () => {
    const { levelOf } = await import("../src/lib/team-access");
    expect([admin, leader, mine].map((p) => levelOf(p, "growth"))).toEqual(["admin", "leader", "member"]);
    expect(levelOf(leader, "content")).toBe("member");
  });

  it("a member can be assigned to the portal's team leaders and admins, and company admins, never themselves", async () => {
    const { leaderOptions, leaderError } = await import("../src/lib/team-access");
    expect(leaderOptions(people, "growth").map((p) => p.id)).toEqual(["a", "l", "boss"]);
    expect(leaderOptions(people, "growth", "l").map((p) => p.id)).toEqual(["a", "boss"]);
    expect(leaderOptions(people, "content").map((p) => p.id)).toEqual(["boss", "cl"]);
    const options = leaderOptions(people, "growth");
    expect(leaderError("member", null, options)).toMatch(/Choose the team leader/);
    expect(leaderError("member", "m2", options)).toMatch(/isn't available/);
    expect(leaderError("member", "l", options)).toBeNull();
    expect(leaderError("leader", null, options)).toBeNull();
    expect(leaderError("admin", null, options)).toBeNull();
  });

  it("the admin sees every deal, a team leader their own and their members', a member only their own", async () => {
    const { dealScope, visibleOwners } = await import("../src/lib/team-access");
    expect(dealScope(actor(admin))).toBe("all");
    expect(visibleOwners(actor(admin), people)).toBeNull();
    expect(dealScope(actor(leader))).toBe("team");
    expect(visibleOwners(actor(leader), people)).toEqual(["l", "m1"]);
    expect(dealScope(actor(mine))).toBe("own");
    expect(visibleOwners(actor(mine), people)).toEqual(["m1"]);
    // company admins (also previewing Growth) and the other portals see every deal
    expect(visibleOwners(actor(boss, "admin"), people)).toBeNull();
    expect(visibleOwners(actor(boss), people)).toBeNull();
    expect(visibleOwners({ ...actor(mine), role: "approver" }, people)).toBeNull();
  });

  it("a leader who is demoted no longer counts as anyone's leader", async () => {
    const { leaderOf } = await import("../src/lib/team-access");
    expect(leaderOf(mine, "growth", people)?.id).toBe("l");
    const demoted = people.map((p) => (p.id === "l" ? { ...p, team_leader_of: [] } : p));
    expect(leaderOf(mine, "growth", demoted)).toBeNull();
  });

  it("setting a level stores it, and a member's leader; admins and leaders report to nobody", () => {
    const base = { roles: ["growth"], team_admin_of: [], team_leader_of: [], reports_to: {}, permissions: [] };
    const member = applyCategory(base, "growth", ["growth.new_deal"], "member", "l");
    expect(member).toMatchObject({ team_admin_of: [], team_leader_of: [], reports_to: { growth: "l" }, permissions: ["growth.new_deal"] });
    const promoted = applyCategory(member, "growth", ["growth.new_deal"], "leader");
    expect(promoted).toMatchObject({ team_leader_of: ["growth"], reports_to: {}, permissions: ["growth.new_deal"] });
    const asAdmin = applyCategory(promoted, "growth", [], "admin");
    expect(asAdmin).toMatchObject({ team_admin_of: ["growth"], team_leader_of: [], reports_to: {} });
    // saving a member's accesses without naming a leader keeps the one they had
    expect(applyCategory(member, "growth", ["growth.calendar"], "member").reports_to).toEqual({ growth: "l" });
    // leaving the portal drops the leader too
    expect(dropCategory(member, "growth")).toMatchObject({ roles: [], reports_to: {} });
  });

  it("a team leader gets My team for their members but is not the portal's admin", async () => {
    const { leaderTeam } = await import("../src/lib/team-access");
    expect(leaderTeam(actor(leader))).toBe("growth");
    expect(ledTeam(actor(leader))).toBeNull();
    expect(canManageTeam(actor(leader), "growth")).toBe(false);
    expect(leaderTeam(actor(admin))).toBeNull();
    expect(leaderTeam(actor(mine))).toBeNull();
  });

  it("content: a team leader submits straight away and approves only their own members", async () => {
    const { approvesContentOf } = await import("../src/lib/team-access");
    const cl = actor(contentLeader, "content");
    expect(approvesContent(cl)).toBe(true);
    expect(approvesContentOf(cl, { id: "x", reports_to: { content: "cl" } })).toBe(true);
    expect(approvesContentOf(cl, { id: "y", reports_to: { content: "someone-else" } })).toBe(false);
    const ca = { id: "ca", role: "content", real_role: "content", team_admin_of: ["content"], permissions: [] };
    expect(approvesContentOf(ca, { id: "y", reports_to: { content: "someone-else" } })).toBe(true);
  });
});
