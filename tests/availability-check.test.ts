// Growth's availability check answers yes or no per day and never says who is free.

import { describe, expect, it } from "vitest";
import { availabilityAnswer, daysFromParam, daysToParam, MAX_CHECK_DAYS, readAvailabilityQuery, sameTimeClash, trainerDayStatus } from "@/lib/availability-check";

const TODAY = "2026-11-10";
const day = (over: Record<string, unknown> = {}) => ({ date: "2026-11-20", start: "10:00", end: "15:00", ...over });

describe("reading the check", () => {
  it("reads the days only (time availability) and rebuilds them from known fields", () => {
    expect(readAvailabilityQuery({ days: [{ ...day(), trainer_id: "x", extra: 1 }] }, TODAY)).toEqual({ days: [day()] });
    expect(readAvailabilityQuery({ industry_id: "nope", days: [day(), day({ date: "2026-11-21" })] }, TODAY)).toEqual({ days: [day(), day({ date: "2026-11-21" })] });
  });
  it.each<[string, unknown, RegExp]>([
    ["nothing", null, /at least one day/],
    ["no days", { days: [] }, /at least one day/],
    ["too many days", { days: Array.from({ length: MAX_CHECK_DAYS + 1 }, () => day()) }, /at most 31 days/],
    ["a missing date", { days: [day({ date: "" })] }, /Pick a date for Day 1/],
    ["a bad time", { days: [day(), day({ start: "16:00", end: "10:00" })] }, /Check the time for Day 2/],
    ["a time outside the slots", { days: [day({ start: "06:00", end: "08:00" })] }, /Morning \(9 AM – 5 PM\)/],
    ["a past date", { days: [day({ date: "2026-11-09" })] }, /Day 1: .*already passed/],
    ["junk", { days: [null] }, /Pick a date/],
  ])("refuses %s", (_, input, msg) => {
    expect(readAvailabilityQuery(input, TODAY)).toEqual({ error: expect.stringMatching(msg) });
  });
  it("today is allowed", () => expect(readAvailabilityQuery({ days: [day({ date: TODAY })] }, TODAY)).toMatchObject({ days: [day({ date: TODAY })] }));
});

describe("the answer", () => {
  it("is yes or no per day, from who is free", () => {
    expect(availabilityAnswer([["a", "b"], []])).toEqual({ days: [true, false], sameTrainer: false });
    expect(availabilityAnswer([["a"]])).toEqual({ days: [true], sameTrainer: null });
  });
  it("says whether one trainer could take every day", () => {
    expect(availabilityAnswer([["a", "b"], ["b", "c"], ["b"]]).sameTrainer).toBe(true);
    expect(availabilityAnswer([["a"], ["b"]])).toEqual({ days: [true, true], sameTrainer: false });
  });
  it("carries nothing but booleans", () => {
    const answer = availabilityAnswer([["trainer-id-1"], ["trainer-id-2"]]);
    expect(JSON.stringify(answer)).not.toMatch(/trainer-id/);
  });
});

describe("carrying the days to the New deal form", () => {
  it("round-trips through the link", () => {
    const days = [day(), day({ date: "2026-11-21", start: "18:00", end: "22:00" })];
    expect(daysToParam(days)).toBe("2026-11-20T10:00-15:00,2026-11-21T18:00-22:00");
    expect(daysFromParam(daysToParam(days))).toEqual(days);
  });
  it("drops anything that isn't a valid day", () => {
    expect(daysFromParam("2026-11-20T10:00-15:00,garbage,2026-11-21T06:00-08:00,<script>")).toEqual([day()]);
    expect(daysFromParam(undefined)).toEqual([]);
    expect(daysFromParam(["2026-11-20T10:00-15:00"])).toEqual([]);
  });
});

describe("where a trainer stands on a day (assign screen)", () => {
  const set = (...s: string[]) => new Set(s);
  it("is free only when available in every slot and booked in none", () => {
    expect(trainerDayStatus(["morning"], set("morning"), undefined)).toBe("free");
    expect(trainerDayStatus(["morning", "evening"], set("morning"), undefined)).toBe("unavailable");
    expect(trainerDayStatus(["morning"], undefined, undefined)).toBe("unavailable");
  });
  it("booked wins over available", () => {
    expect(trainerDayStatus(["morning"], set("morning"), set("morning"))).toBe("booked");
    expect(trainerDayStatus(["morning", "evening"], undefined, set("evening"))).toBe("booked");
  });
  it("two days clash when they share a date and a slot", () => {
    expect(sameTimeClash({ date: "2026-11-17", slots: ["morning"] }, { date: "2026-11-17", slots: ["morning"] })).toBe(true);
    expect(sameTimeClash({ date: "2026-11-17", slots: ["morning"] }, { date: "2026-11-17", slots: ["evening"] })).toBe(false);
    expect(sameTimeClash({ date: "2026-11-17", slots: ["morning"] }, { date: "2026-11-18", slots: ["morning"] })).toBe(false);
  });
});
