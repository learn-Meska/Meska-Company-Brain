import { describe, expect, it } from "vitest";
import { yearOptions } from "@/components/calendar-filters";
import { monthGrid } from "@/components/month-calendar";

describe("calendar month picker", () => {
  it("offers last year to next year, moving on with today's year", () => {
    expect(yearOptions(2026, 2026)).toEqual([2025, 2026, 2027]);
    expect(yearOptions(2027, 2027)).toEqual([2026, 2027, 2028]);
  });
  it("always includes the year on screen", () => {
    expect(yearOptions(2030, 2026)).toEqual([2025, 2026, 2027, 2028, 2029, 2030]);
    expect(yearOptions(2022, 2026)).toEqual([2022, 2023, 2024, 2025, 2026, 2027]);
  });
});

describe("month grid", () => {
  it("holds only the month's own days, blank cells around them", () => {
    const g = monthGrid("2026-11");
    expect(g.from).toBe("2026-11-01");
    expect(g.to).toBe("2026-11-30");
    expect(g.days).toHaveLength(30);
    expect(g.cells.filter(Boolean)).toEqual(g.days);
    expect(g.cells[0]).toBe("2026-11-01"); // 1 Nov 2026 is a Sunday
    expect(g.cells.length % 7).toBe(0);
    expect(monthGrid("2027-02").days).toHaveLength(28);
  });
});
