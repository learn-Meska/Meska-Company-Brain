import { describe, expect, it } from "vitest";
import { canManageTeam, cleanTeamAdmin, ledTeam, memberChangeError, withoutTeam } from "../src/lib/team-access";

const growthLead = { id: "lead", role: "growth", real_role: "growth", team_admin_of: ["growth"] };
const growthMember = { id: "m1", role: "growth", real_role: "growth", team_admin_of: [] };
const companyAdmin = { id: "boss", role: "admin", real_role: "admin", team_admin_of: [] };

describe("team access", () => {
  it("a team admin leads only the team they are working in", () => {
    expect(ledTeam(growthLead)).toBe("growth");
    expect(ledTeam(growthMember)).toBeNull();
    // leading Growth gives nothing while working in the Content view
    expect(ledTeam({ ...growthLead, role: "content" })).toBeNull();
    expect(ledTeam(companyAdmin)).toBeNull();
  });

  it("company admins manage every team; team admins only their own", () => {
    expect(canManageTeam(companyAdmin, "content")).toBe(true);
    expect(canManageTeam(growthLead, "growth")).toBe(true);
    expect(canManageTeam(growthLead, "content")).toBe(false);
    expect(canManageTeam(growthMember, "growth")).toBe(false);
    // an admin previewing another view isn't treated as a company admin there
    expect(canManageTeam({ ...companyAdmin, real_role: "growth" }, "growth")).toBe(false);
  });

  it("team admin ticks are kept only for teams the person is in", () => {
    expect(cleanTeamAdmin(["growth", "content"], ["growth", "approver", "admin"])).toEqual(["growth"]);
    expect(cleanTeamAdmin([], ["growth"])).toEqual([]);
  });

  it("a team admin can't touch other teams, company admins, or take away their own access", () => {
    const member = { id: "m1", roles: ["growth"], team_admin_of: [] };
    expect(memberChangeError(growthLead, "growth", member, "remove")).toBeNull();
    expect(memberChangeError(growthLead, "growth", member, "lead")).toBeNull();
    expect(memberChangeError(growthLead, "growth", { id: "c", roles: ["content"] }, "remove")).toMatch(/isn't in this team/);
    expect(memberChangeError(growthLead, "growth", null, "remove")).toMatch(/isn't in this team/);
    expect(memberChangeError(growthLead, "growth", { id: "a", roles: ["admin", "growth"] }, "remove")).toMatch(/Team & access/);
    expect(memberChangeError(growthLead, "growth", { id: "lead", roles: ["growth"], team_admin_of: ["growth"] }, "remove")).toMatch(/your own/);
    expect(memberChangeError(growthLead, "growth", { id: "lead", roles: ["growth"], team_admin_of: ["growth"] }, "unlead")).toMatch(/your own/);
    expect(memberChangeError(growthMember, "growth", member, "remove")).toMatch(/Only this team's admins/);
    expect(memberChangeError(growthLead, "content", { id: "c", roles: ["content"] }, "remove")).toMatch(/Only this team's admins/);
  });

  it("removing someone from one team keeps their other teams", () => {
    expect(withoutTeam({ id: "x", roles: ["growth", "content"], team_admin_of: ["growth", "content"] }, "growth")).toEqual({ roles: ["content"], team_admin_of: ["content"] });
    expect(withoutTeam({ id: "x", roles: ["growth"], team_admin_of: ["growth"] }, "growth")).toEqual({ roles: [], team_admin_of: [] });
  });
});
