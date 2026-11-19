// B2C sessions template: the header check and every row's validation (pure rules in src/lib/b2c.ts).
import { describe, expect, it } from "vitest";
import { B2C_COLUMNS, cellDate, cellTime, checkB2CSheet, headerProblem, parseB2CRow } from "@/lib/b2c";

const head = [...B2C_COLUMNS];
// A row the way the Excel reader returns it: Date cells, times on 30 Dec 1899, Weekday as a formula.
const t = (h: number, m = 0) => new Date(Date.UTC(1899, 11, 30, h, m));
const row = (over: Record<number, unknown> = {}) => {
  const r: unknown[] = ["AI Copilot Diploma", "W16", "Offline", 1, "Onboarding", new Date(Date.UTC(2026, 9, 31)), { formula: 'TEXT(F2,"dddd")', result: "Saturday" }, t(17), t(18), "Online", "Amr Fahmy", "Confirmed", "Yes"];
  for (const [i, v] of Object.entries(over)) r[Number(i)] = v;
  return r;
};
const errorOf = (r: ReturnType<typeof parseB2CRow>) => ("error" in r ? r.error : "");

describe("B2C template header", () => {
  it("accepts the template's 13 columns in order", () => {
    expect(headerProblem(head)).toBeNull();
    expect(headerProblem([...head, null, ""])).toBeNull();
  });
  it("names missing columns", () => {
    expect(headerProblem(head.filter((c) => c !== "Trainer"))).toMatch(/"Trainer" is missing/);
  });
  it("refuses columns in another order or an extra column", () => {
    const swapped = [...head];
    [swapped[7], swapped[8]] = [swapped[8], swapped[7]];
    expect(headerProblem(swapped)).toMatch(/column H should be "Start"/);
    expect(headerProblem([...head, "Notes"])).toMatch(/extra column "Notes"/);
  });
});

describe("B2C cells", () => {
  it("reads Excel dates, serials and text", () => {
    expect(cellDate(new Date(Date.UTC(2026, 10, 1)))).toBe("2026-11-01");
    expect(cellDate(46326)).toBe("2026-10-31");
    expect(cellDate("2027-02-21")).toBe("2027-02-21");
    expect(cellDate("1/11/2026")).toBe("2026-11-01");
    expect(cellDate("31/02/2026")).toBeNull();
    expect(cellDate("soon")).toBeNull();
  });
  it("reads Excel times, fractions and text", () => {
    expect(cellTime(t(19))).toBe("19:00");
    expect(cellTime(t(18, 30))).toBe("18:30");
    expect(cellTime(0.75)).toBe("18:00");
    expect(cellTime("7:00 PM")).toBe("19:00");
    expect(cellTime("12:00 AM")).toBe("00:00");
    expect(cellTime("23:00")).toBe("23:00");
    expect(cellTime("25:00")).toBeNull();
  });
});

describe("B2C rows", () => {
  it("reads a full row", () => {
    expect(parseB2CRow(row(), 2)).toEqual({
      row: { program: "AI Copilot Diploma", cohort: "W16", format: "offline", day_number: 1, session: "Onboarding", date: "2026-10-31", start_time: "17:00", end_time: "18:00", location: "Online", trainer_name: "Amr Fahmy", status: "confirmed", delivered: true },
    });
  });
  it("treats an em dash as no location and keeps a trainer without a profile by name", () => {
    const r = parseB2CRow(row({ 9: "—", 10: "Sayed (no profile)", 11: "Needs trainer", 12: "No" }), 3);
    expect(r).toMatchObject({ row: { location: null, trainer_name: "Sayed (no profile)", status: "needs_trainer", delivered: false } });
  });
  it("lists every problem of a row with its row number", () => {
    const e = errorOf(parseB2CRow(row({ 0: "", 2: "Hybrid", 3: 0, 5: "next week", 8: t(16), 11: "Maybe", 12: "Sure" }), 7));
    expect(e).toMatch(/^Row 7: Program is empty; Format must be Online or Offline, not "Hybrid"; Day # must be a whole number/);
    expect(e).toMatch(/Date "next week" isn't a date/);
    expect(e).toMatch(/End \(16:00\) must be after Start \(17:00\)/);
    expect(e).toMatch(/Status must be Confirmed, Awaiting trainer, Needs trainer, Cancelled, not "Maybe"/);
    expect(e).toMatch(/Delivered must be Yes or No, not "Sure"/);
  });
  it("refuses Delivered = Yes unless the session is confirmed", () => {
    expect(errorOf(parseB2CRow(row({ 11: "Needs trainer", 12: "Yes" }), 4))).toMatch(/Delivered is Yes, so Status must be Confirmed/);
  });
});

describe("B2C sheet", () => {
  it("checks the header first", () => {
    expect(checkB2CSheet([["Name", "Email"], ["x", "y"]]).errors[0]).toMatch(/isn't the B2C Sessions template/);
    expect(checkB2CSheet([]).errors).toEqual(["The sheet is empty."]);
    expect(checkB2CSheet([head]).errors).toEqual(["The sheet has no sessions under the header."]);
  });
  it("skips blank rows and refuses the same cohort day twice", () => {
    const r = checkB2CSheet([head, row(), [null, null, ""], row({ 4: "Session 1" })]);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual(["Row 4: AI Copilot Diploma W16 Day 1 is already on row 2."]);
  });
});
