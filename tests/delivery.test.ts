import { describe, expect, it } from "vitest";
import { asDeliveryReport, deliveryOpen, deliveryState, readDeliveryReport } from "../src/lib/delivery";

const ok = { attended: "18", topics: "Prompting, agents", engagement: "4", challenges: " Wi-Fi was slow ", follow_up: "", brief: "Good day." };

describe("delivery report", () => {
  it("accepts a complete report and trims the text", () => {
    expect(readDeliveryReport(ok)).toEqual({ report: { attended: 18, topics: "Prompting, agents", engagement: 4, challenges: "Wi-Fi was slow", follow_up: "" }, brief: "Good day." });
  });
  it("requires attendance, topics and an engagement score from 1 to 5", () => {
    expect(readDeliveryReport({ ...ok, attended: "" })).toEqual({ error: expect.stringMatching(/attended/) });
    expect(readDeliveryReport({ ...ok, attended: "-1" })).toEqual({ error: expect.stringMatching(/attended/) });
    expect(readDeliveryReport({ ...ok, attended: "2.5" })).toEqual({ error: expect.stringMatching(/attended/) });
    expect(readDeliveryReport({ ...ok, topics: "  " })).toEqual({ error: expect.stringMatching(/topics/) });
    expect(readDeliveryReport({ ...ok, engagement: "0" })).toEqual({ error: expect.stringMatching(/engagement/) });
    expect(readDeliveryReport({ ...ok, engagement: "6" })).toEqual({ error: expect.stringMatching(/engagement/) });
  });
  it("a day can be marked as delivered from the moment its session starts (Cairo time), not before", () => {
    // 10:00 in Cairo on 10 November is 08:00 UTC
    const b = { date: "2026-11-10", start_time: "10:00:00" };
    expect(deliveryOpen(b, Date.parse("2026-11-10T07:59:00Z"))).toBe(false);
    expect(deliveryOpen(b, Date.parse("2026-11-10T08:00:00Z"))).toBe(true);
    // midnight on the day is still too early
    expect(deliveryOpen(b, Date.parse("2026-11-09T22:30:00Z"))).toBe(false);
  });
  it("tells the trainer where the Mark as delivered button stands", () => {
    const b = { status: "confirmed", date: "2026-11-10", start_time: "10:00:00", finished_at: null as string | null };
    const before = Date.parse("2026-11-10T06:00:00Z");
    const after = Date.parse("2026-11-10T12:00:00Z");
    expect(deliveryState(b, before)).toBe("not_yet");
    expect(deliveryState(b, after)).toBe("ready");
    expect(deliveryState({ ...b, finished_at: "2026-11-10T14:00:00Z" }, after)).toBe("done");
    // not confirmed yet: confirm first, even once the date passed
    expect(deliveryState({ ...b, status: "awaiting_trainer" }, after)).toBe("confirm_first");
    expect(deliveryState({ ...b, status: "cancelled" }, after)).toBe("none");
    expect(deliveryState({ ...b, status: "needs_trainer" }, after)).toBe("none");
  });
  it("reads a saved report back, ignoring anything malformed", () => {
    expect(asDeliveryReport({ attended: 3, topics: "x", engagement: 2 })).toEqual({ attended: 3, topics: "x", engagement: 2, challenges: "", follow_up: "" });
    expect(asDeliveryReport(null)).toBeNull();
    expect(asDeliveryReport({ topics: "x" })).toBeNull();
  });
});

describe("the any-time test switch", () => {
  it("opens Mark as delivered before the session starts, but only for a confirmed day", async () => {
    const { deliveryState, deliveryOpen } = await import("@/lib/delivery");
    const day = { status: "confirmed", date: "2099-01-10", start_time: "10:00:00", finished_at: null };
    expect(deliveryState(day)).toBe("not_yet");
    expect(deliveryState(day, Date.now(), true)).toBe("ready");
    expect(deliveryOpen(day, Date.now(), true)).toBe(true);
    expect(deliveryState({ ...day, status: "awaiting_trainer" }, Date.now(), true)).toBe("confirm_first");
    expect(deliveryState({ ...day, finished_at: "2099-01-10T15:00:00Z" }, Date.now(), true)).toBe("done");
  });
});
