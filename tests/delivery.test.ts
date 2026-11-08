import { describe, expect, it } from "vitest";
import { asDeliveryReport, readDeliveryReport } from "../src/lib/delivery";

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
  it("reads a saved report back, ignoring anything malformed", () => {
    expect(asDeliveryReport({ attended: 3, topics: "x", engagement: 2 })).toEqual({ attended: 3, topics: "x", engagement: 2, challenges: "", follow_up: "" });
    expect(asDeliveryReport(null)).toBeNull();
    expect(asDeliveryReport({ topics: "x" })).toBeNull();
  });
});
