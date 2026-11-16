// Change requests: Growth asks Training Excellence to change a training and says why.

import { describe, expect, it } from "vitest";
import { openDays, readChangeRequest, readResolution, requestableKinds, requestProblem, stillApplies, type RequestDay } from "@/lib/change-request";

const TODAY = "2026-11-10";
const day = (over: Partial<RequestDay> = {}): RequestDay => ({ date: "2026-11-20", status: "confirmed", trainer_id: "t1", finished_at: null, ...over });

describe("what Growth sends", () => {
  it("needs a kind and a real reason", () => {
    expect(readChangeRequest({ kind: "trainer", reason: "  The client asked for someone with banking experience.\r\n" })).toEqual({ kind: "trainer", reason: "The client asked for someone with banking experience." });
    expect(readChangeRequest({ kind: "swap", reason: "A long enough reason." })).toEqual({ error: expect.stringMatching(/what you want changed/) });
    expect(readChangeRequest({ kind: "trainer", reason: "too short" })).toEqual({ error: expect.stringMatching(/reason/) });
    expect(readChangeRequest({ kind: "cancel", reason: "x".repeat(2001) })).toEqual({ error: expect.stringMatching(/under 2,000/) });
    expect(readChangeRequest({ kind: "date", reason: 5 })).toEqual({ error: expect.stringMatching(/reason/) });
  });
});

describe("Training Excellence's answer", () => {
  it("done needs no note; declining needs one so Growth knows why", () => {
    expect(readResolution({ outcome: "done", note: "" })).toEqual({ outcome: "done", note: null });
    expect(readResolution({ outcome: "done", note: " Moved to the 25th. " })).toEqual({ outcome: "done", note: "Moved to the 25th." });
    expect(readResolution({ outcome: "declined", note: "" })).toEqual({ error: expect.stringMatching(/short note/) });
    expect(readResolution({ outcome: "declined", note: "The client approved this trainer in writing." })).toMatchObject({ outcome: "declined" });
    expect(readResolution({ outcome: "open", note: "x" })).toEqual({ error: expect.stringMatching(/how to answer/) });
  });
});

describe("when a request still applies", () => {
  it("only days still to come, not cancelled and not delivered, can change", () => {
    const days = [day(), day({ date: "2026-11-09" }), day({ status: "cancelled" }), day({ finished_at: "2026-11-20T18:00:00Z" }), day({ date: TODAY, status: "awaiting_trainer" })];
    expect(openDays(days, TODAY)).toEqual([days[0], days[4]]);
  });
  it("a different trainer needs an upcoming day that has one", () => {
    expect(stillApplies("trainer", [day()], TODAY)).toBe(true);
    // the trainer declined or was taken off
    expect(stillApplies("trainer", [day({ status: "needs_trainer", trainer_id: null })], TODAY)).toBe(false);
    expect(stillApplies("trainer", [day({ date: "2026-11-01" })], TODAY)).toBe(false);
    expect(stillApplies("trainer", [day({ finished_at: "2026-11-20T18:00:00Z" })], TODAY)).toBe(false);
  });
  it("a new date or a cancellation needs a day still to come", () => {
    expect(stillApplies("date", [day({ status: "needs_trainer", trainer_id: null })], TODAY)).toBe(true);
    expect(stillApplies("cancel", [day({ status: "cancelled" })], TODAY)).toBe(false);
    expect(stillApplies("cancel", [day({ status: "cancelled" }), day()], TODAY)).toBe(true);
  });
});

describe("what Growth may ask for", () => {
  it("only the trainer while it can still edit and cancel the days itself", () => {
    expect(requestableKinds([day({ status: "awaiting_trainer" })], TODAY, true)).toEqual(["trainer"]);
    expect(requestableKinds([day()], TODAY, false)).toEqual(["trainer", "date", "cancel"]);
  });
  it("no trainer request without a trainer, nothing once the training is over", () => {
    expect(requestableKinds([day({ status: "needs_trainer", trainer_id: null })], TODAY, false)).toEqual(["date", "cancel"]);
    expect(requestableKinds([day({ status: "needs_trainer", trainer_id: null })], TODAY, true)).toEqual([]);
    expect(requestableKinds([day({ finished_at: "2026-11-20T18:00:00Z" })], TODAY, false)).toEqual([]);
  });
  it("one request is open per training at a time", () => {
    expect(requestProblem("trainer", [day()], TODAY, true)).toMatch(/already waiting/);
    expect(requestProblem("trainer", [day()], TODAY, false)).toBeNull();
    expect(requestProblem("trainer", [day({ status: "needs_trainer", trainer_id: null })], TODAY, false)).toMatch(/has a trainer to change/);
    expect(requestProblem("cancel", [day({ status: "cancelled" })], TODAY, false)).toMatch(/left to change/);
  });
});
