// Golden rules for the New deal form. If one of these fails, a change broke the main request flow:
// fix the code, or, when the behaviour change is intended, update the golden file with `npm run test:update`
// and say why in the commit.

import { describe, expect, it } from "vitest";
import {
  audienceError,
  audienceRows,
  contactError,
  dayError,
  dealTotal,
  dealValueError,
  departmentMatches,
  fitsLevels,
  parseAmount,
  proposalFileError,
  proposalPathError,
  rankByDepartments,
  requestError,
  splitLabel,
  type Audience,
  type NewRequest,
} from "@/lib/deal";
import { DEPT_FIN, DEPT_HR, LEVEL_MID, LEVEL_SENIOR, validRequest } from "./support/requests";
import { slotsFor } from "@/lib/format";

const USER = "11111111-1111-4111-8111-111111111111";
const INDUSTRY = "22222222-2222-4222-8222-222222222222";
const TODAY = "2026-11-01";

const growth = { role: "growth", userId: USER, today: TODAY };
const audience = (over: Partial<Audience> = {}): Audience => ({ ...validRequest().audience, ...over });

describe("audience (step 2): seniority levels, departments, headcount", () => {
  it("a normal audience passes", () => expect(audienceError(audience())).toBeNull());
  it("“Mixed / all departments” replaces picking departments", () => {
    expect(audienceError(audience({ department_ids: [], all_departments: true }))).toBeNull();
    expect(audienceError(audience({ department_ids: [DEPT_HR], all_departments: true }))).toMatch(/not both/);
  });
  it.each<[string, Partial<Audience> | undefined, RegExp]>([
    ["no audience", undefined, /Pick the audience/],
    ["no level", { level_ids: [] }, /at least one seniority level/],
    ["a bad level id", { level_ids: ["x"] }, /at least one seniority level/],
    ["the same level twice", { level_ids: [LEVEL_MID, LEVEL_MID] }, /at least one seniority level/],
    ["no department", { department_ids: [] }, /at least one department/],
    ["a bad department id", { department_ids: ["nope"] }, /departments again/],
    ["a non-boolean flag", { all_departments: "yes" as never }, /departments again/],
    ["no headcount", { participant_count: 0 }, /number of participants/],
    ["a fractional headcount", { participant_count: 2.5 }, /number of participants/],
    ["too many people", { participant_count: 10_001 }, /number of participants/],
  ])("refuses %s", (_, over, msg) => {
    expect(audienceError(over === undefined ? undefined : audience(over))).toMatch(msg);
  });
  it("saves one deal_audience row per picked level and department", () => {
    expect(audienceRows("D", audience({ level_ids: [LEVEL_MID, LEVEL_SENIOR], department_ids: [DEPT_HR] }))).toEqual([
      { deal_id: "D", lookup_id: LEVEL_MID },
      { deal_id: "D", lookup_id: LEVEL_SENIOR },
      { deal_id: "D", lookup_id: DEPT_HR },
    ]);
  });
  it("splits the admin list's long level names for compact chips", () => {
    expect(splitLabel("Junior Level (Entry-Level / Associates)")).toEqual({ main: "Junior Level", sub: "Entry-Level / Associates" });
    expect(splitLabel("C-Level (Executives)")).toEqual({ main: "C-Level", sub: "Executives" });
    expect(splitLabel("HR")).toEqual({ main: "HR", sub: "" });
  });
});

describe("matching trainers to the audience", () => {
  const trainer = (tags: string[], tierAudience: string[] | null = null, total = 50) => ({ lookups: tags.map((id) => ({ id })), tier: tierAudience ? { audience_ids: tierAudience } : null, total });
  it("seniority filters: the trainer needs every picked level", () => {
    expect(fitsLevels(trainer([LEVEL_MID, LEVEL_SENIOR]), [LEVEL_MID, LEVEL_SENIOR])).toBe(true);
    expect(fitsLevels(trainer([LEVEL_MID]), [LEVEL_MID, LEVEL_SENIOR])).toBe(false);
    expect(fitsLevels(trainer([]), [LEVEL_MID])).toBe(false);
  });
  it("seniority filters: the trainer's tier must allow every picked level (a tier without rules allows all)", () => {
    expect(fitsLevels(trainer([LEVEL_MID, LEVEL_SENIOR], [LEVEL_MID]), [LEVEL_MID, LEVEL_SENIOR])).toBe(false);
    expect(fitsLevels(trainer([LEVEL_MID, LEVEL_SENIOR], [LEVEL_MID, LEVEL_SENIOR]), [LEVEL_MID, LEVEL_SENIOR])).toBe(true);
    expect(fitsLevels(trainer([LEVEL_MID], []), [LEVEL_MID])).toBe(true);
  });
  it("departments rank, never filter: more departments covered first, then the score", () => {
    const a = { ...trainer([DEPT_HR], null, 90), id: "a" };
    const b = { ...trainer([DEPT_HR, DEPT_FIN], null, 40), id: "b" };
    const c = { ...trainer([], null, 95), id: "c" };
    const d = { ...trainer([DEPT_HR], null, 70), id: "d" };
    expect(departmentMatches(b, [DEPT_HR, DEPT_FIN])).toBe(2);
    expect(rankByDepartments([a, b, c, d], [DEPT_HR, DEPT_FIN]).map((t) => [t.id, t.departments])).toEqual([
      ["b", 2],
      ["a", 1],
      ["d", 1],
      ["c", 0],
    ]);
    // with no departments picked ("Mixed / all"), the order is just the score
    expect(rankByDepartments([a, b, c, d], []).map((t) => t.id)).toEqual(["c", "a", "d", "b"]);
  });
});

describe("deal value", () => {
  it("total = value per day × days (500,000 over 5 days = 100,000 per day)", () => {
    expect(dealTotal(100000, 5)).toBe(500000);
    expect(dealTotal(10000.1, 3)).toBe(30000.3);
  });
  it.each([
    ["100000", 100000],
    ["100,000", 100000],
    ["100 000.50", 100000.5],
    [" 7 ", 7],
    ["1e5", NaN],
    ["-5", NaN],
    ["abc", NaN],
    ["10.123", NaN],
  ])("parseAmount(%j) = %s", (v, n) => {
    expect(parseAmount(v)).toBe(n);
  });
  it.each([
    [0, 5, /value per training day/],
    [NaN, 5, /value per training day/],
    [2_000_000_000, 5, /too large/],
    [100, 0, /how many days/],
    [100, 1.5, /how many days/],
    [100, 366, /how many days/],
  ])("rejects value %s for %s days", (v, d, msg) => {
    expect(dealValueError(v, d)).toMatch(msg);
  });
  it("accepts a normal deal", () => expect(dealValueError(100000, 5)).toBeNull());
});

describe("proposal file", () => {
  it.each(["a.pdf", "b.DOCX", "c.doc", "d.pptx", "e.xlsx", "f.odt", "g.rtf"])("accepts %s", (n) => expect(proposalFileError(n, 10)).toBeNull());
  it.each(["a.exe", "b.html", "c.svg", "d.zip", "e", "pdf"])("refuses %s", (n) => expect(proposalFileError(n, 10)).toMatch(/PDF, Word/));
  it("refuses files over 50 MB", () => expect(proposalFileError("a.pdf", 51 * 1024 * 1024)).toMatch(/50 MB/));
  it("only accepts a path inside the uploader's own folder", () => {
    const ok = { path: `${USER}/x-proposal.pdf`, name: "proposal.pdf", size: 1 };
    expect(proposalPathError(ok, USER)).toBeNull();
    expect(proposalPathError({ ...ok, path: `other/x.pdf` }, USER)).toMatch(/again/);
    expect(proposalPathError({ ...ok, path: `${USER}/../x.pdf` }, USER)).toMatch(/again/);
    expect(proposalPathError({ ...ok, path: `${USER}/a/b.pdf` }, USER)).toMatch(/again/);
    expect(proposalPathError({ ...ok, path: `${USER}/x.exe` }, USER)).toMatch(/PDF, Word/);
    expect(proposalPathError(undefined, USER)).toMatch(/Upload the proposal/);
  });
});

describe("client contact and days (unchanged main-flow rules)", () => {
  it("contact needs a name, a valid email and a phone number", () => {
    expect(contactError({ name: "", email: "a@b.co", mobile: "0100000000" })).toMatch(/name/);
    expect(contactError({ name: "A", email: "nope", mobile: "0100000000" })).toMatch(/email/);
    expect(contactError({ name: "A", email: "a@b.co", mobile: "12" })).toMatch(/phone/);
    expect(contactError({ name: "A", email: "a@b.co", mobile: "+20 100 000 0000" })).toBeNull();
  });
  it("slots: morning 9–5, evening 6–11", () => {
    expect(slotsFor("10:00", "15:00")).toEqual(["morning"]);
    expect(slotsFor("18:00", "22:00")).toEqual(["evening"]);
    expect(slotsFor("09:00", "23:00")).toEqual(["morning", "evening"]);
    expect(slotsFor("07:00", "08:00")).toEqual([]);
  });
  it("day checks", () => {
    expect(dayError({ day_number: 1, date: "", start: "10:00", end: "15:00" })).toMatch(/Pick a date/);
    expect(dayError({ day_number: 1, date: "2026-11-10", start: "15:00", end: "10:00" })).toMatch(/Check the time/);
    expect(dayError({ day_number: 2, date: "2026-11-10", start: "06:00", end: "08:00" })).toMatch(/Day 2: the time must fall/);
    expect(dayError({ day_number: 1, date: "2026-11-10", start: "10:00", end: "15:00" })).toBeNull();
  });
});

describe("requestError: the whole New deal, step by step", () => {
  it("a complete Growth deal passes", () => expect(requestError(validRequest(), growth)).toBeNull());
  it("booking managers may leave the trainer for later; Growth may not", () => {
    const noTrainer = validRequest({ days: [{ ...validRequest().days[0], trainer_id: undefined }] });
    expect(requestError(noTrainer, growth)).toBe("Choose a trainer for Day 1.");
    expect(requestError(noTrainer, { ...growth, role: "approver" })).toBeNull();
    expect(requestError(noTrainer, { ...growth, role: "admin" })).toBeNull();
  });
  it.each<[string, Partial<NewRequest>, RegExp]>([
    ["company name", { company_name: "  " }, /company name/],
    ["program name", { program_name: "  " }, /program name/],
    ["industry", { industry_id: "" }, /industry/],
    ["industry id format", { industry_id: "not-a-uuid" }, /industry/],
    ["contact", { contact: { name: "A", email: "x", mobile: "0100000000" } }, /email/],
    ["audience", { audience: { ...validRequest().audience, level_ids: [] } }, /seniority level/],
    ["proposal", { proposal: undefined as never }, /Upload the proposal/],
    ["someone else's proposal", { proposal: { path: "999/x.pdf", name: "x.pdf", size: 1 } }, /again/],
    ["value", { value_per_day: 0 }, /value per training day/],
    ["days", { deal_days: 0 }, /how many days/],
    ["no training days", { days: [] }, /at least one training day/],
    ["past date", { days: [{ ...validRequest().days[0], date: "2026-10-01" }] }, /already passed/],
    ["trainer id", { days: [{ ...validRequest().days[0], trainer_id: "x" }] }, /pick the trainer again/],
    ["day number", { days: [{ ...validRequest().days[0], day_number: 0 }] }, /day number/],
  ])("refuses a missing or bad %s", (_, over, msg) => {
    expect(requestError(validRequest(over), growth)).toMatch(msg);
  });
  it("checks the steps in the order the form shows them", () => {
    const allBad = validRequest({ company_name: "", program_name: "", industry_id: "", audience: { ...validRequest().audience, participant_count: 0 }, value_per_day: 0, days: [] });
    expect(requestError(allBad, growth)).toBe("Enter the company name.");
    expect(requestError({ ...allBad, company_name: "C" }, growth)).toBe("Enter the program name.");
    expect(requestError({ ...allBad, company_name: "C", program_name: "P" }, growth)).toBe("Pick the industry.");
    expect(requestError({ ...allBad, company_name: "C", program_name: "P", industry_id: INDUSTRY }, growth)).toMatch(/number of participants/);
  });
  it("per-day content is no longer asked for", () => {
    expect(validRequest().days[0]).not.toHaveProperty("content");
    expect(requestError(validRequest(), growth)).toBeNull();
  });
  it("survives junk input from a tampered browser", () => {
    expect(requestError(null as never, growth)).toBe("Fill in the request.");
    expect(requestError({} as never, growth)).toBe("Enter the company name.");
  });
});
