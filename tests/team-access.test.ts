import { describe, expect, it } from "vitest";
import {
  ACCESS,
  canManageTeam,
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
      permissions: ["content.view"],
    });
  });
});
