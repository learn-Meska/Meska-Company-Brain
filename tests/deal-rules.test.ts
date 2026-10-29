// Golden rules for the New deal form. If one of these fails, a change broke the main request flow:
// fix the code, or, when the behaviour change is intended, update the golden file with `npm run test:update`
// and say why in the commit.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  contactError,
  dayError,
  dealTotal,
  dealValueError,
  parseAmount,
  parseCsv,
  parseParticipants,
  participantsCsv,
  participantsError,
  PARTICIPANTS_TEMPLATE_CSV,
  proposalFileError,
  proposalPathError,
  requestError,
  type NewRequest,
} from "@/lib/deal";
import { validRequest } from "./support/requests";
import { slotsFor } from "@/lib/format";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const USER = "11111111-1111-4111-8111-111111111111";
const INDUSTRY = "22222222-2222-4222-8222-222222222222";
const TODAY = "2026-11-01";

const growth = { role: "growth", userId: USER, today: TODAY };

describe("participants template (golden)", () => {
  it("is exactly the file Growth downloads", async () => {
    await expect(PARTICIPANTS_TEMPLATE_CSV).toMatchFileSnapshot("./golden/participants-template.csv");
  });
  it("starts with a UTF-8 BOM and the three columns in order", () => {
    expect(PARTICIPANTS_TEMPLATE_CSV.charCodeAt(0)).toBe(0xfeff);
    expect(parseCsv(PARTICIPANTS_TEMPLATE_CSV)[0]).toEqual(["name", "title", "department"]);
  });
  it("the template itself is rejected until participants are added", () => {
    expect(parseParticipants(PARTICIPANTS_TEMPLATE_CSV).error).toMatch(/no participants/);
  });
});

describe("participants CSV parsing", () => {
  it("reads a filled template: quotes, commas, Arabic, blank lines, CRLF (golden)", async () => {
    const r = parseParticipants(fixture("participants-filled.csv"));
    expect(r.error).toBeNull();
    await expect(JSON.stringify(r.participants, null, 2) + "\n").toMatchFileSnapshot("./golden/participants-filled.json");
  });
  it("accepts semicolon files (Excel in some regions) and columns in any order", () => {
    const r = parseParticipants("Department;Name;Title\nSales;Omar;Lead\n");
    expect(r).toEqual({ participants: [{ name: "Omar", title: "Lead", department: "Sales" }], error: null });
  });
  it.each([
    ["", /empty/],
    ["name,title\nOmar,Lead\n", /missing: department/],
    ["name,title,department\n,Lead,Sales\n", /Row 2: the name is missing/],
    [`name,title,department\nA,${"x".repeat(201)},B\n`, /longer than 200/],
    ["name,title,department\n" + "P,T,D\n".repeat(501), /at most 500/],
  ])("rejects %#", (csv, msg) => {
    const r = parseParticipants(csv);
    expect(r.participants).toEqual([]);
    expect(r.error).toMatch(msg);
  });
  it("round-trips through the participant export and defuses formulas", () => {
    const list = [
      { name: "=HYPERLINK(1)", title: "Lead, Sales", department: null },
      { name: 'Mai "M"', title: null, department: "Ops" },
    ];
    const csv = participantsCsv(list);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(parseParticipants(csv).participants).toEqual([
      { name: "'=HYPERLINK(1)", title: "Lead, Sales", department: "" },
      { name: 'Mai "M"', title: "", department: "Ops" },
    ]);
  });
  it("server re-check refuses anything the browser could have tampered with", () => {
    expect(participantsError([])).toMatch(/Upload the participants/);
    expect(participantsError("x")).toMatch(/Upload the participants/);
    expect(participantsError([{ name: "  " }])).toMatch(/name is missing/);
    expect(participantsError([{ name: "A", title: 5 }])).toMatch(/not valid/);
    expect(participantsError([{ name: "A", title: "B", department: "C" }])).toBeNull();
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
    ["program name", { program_name: "  " }, /program name/],
    ["industry", { industry_id: "" }, /industry/],
    ["industry id format", { industry_id: "not-a-uuid" }, /industry/],
    ["contact", { contact: { name: "A", email: "x", mobile: "0100000000" } }, /email/],
    ["participants", { participants: [] }, /participants file/],
    ["proposal", { proposal: undefined as never }, /Upload the proposal/],
    ["someone else's proposal", { proposal: { path: "999/x.pdf", name: "x.pdf", size: 1 } }, /again/],
    ["value", { value_per_day: 0 }, /value per training day/],
    ["days", { deal_days: 0 }, /how many days/],
    ["no training days", { days: [] }, /at least one training day/],
    ["past date", { days: [{ ...validRequest().days[0], date: "2026-10-01" }] }, /already passed/],
    ["content", { days: [{ ...validRequest().days[0], content: " " }] }, /Describe the content/],
    ["trainer id", { days: [{ ...validRequest().days[0], trainer_id: "x" }] }, /pick the trainer again/],
    ["day number", { days: [{ ...validRequest().days[0], day_number: 0 }] }, /day number/],
  ])("refuses a missing or bad %s", (_, over, msg) => {
    expect(requestError(validRequest(over), growth)).toMatch(msg);
  });
  it("checks the steps in the order the form shows them", () => {
    const allBad = validRequest({ program_name: "", industry_id: "", participants: [], value_per_day: 0, days: [] });
    expect(requestError(allBad, growth)).toBe("Enter the program name.");
    expect(requestError({ ...allBad, program_name: "P" }, growth)).toBe("Pick the industry.");
    expect(requestError({ ...allBad, program_name: "P", industry_id: INDUSTRY }, growth)).toMatch(/participants file/);
  });
  it("survives junk input from a tampered browser", () => {
    expect(requestError(null as never, growth)).toBe("Fill in the request.");
    expect(requestError({} as never, growth)).toBe("Enter the program name.");
  });
});
