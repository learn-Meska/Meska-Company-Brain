import { describe, expect, it } from "vitest";
import { isSegment, segmentOf, SEGMENT_LABEL } from "@/lib/segment";

describe("deal segment", () => {
  it("uses the deal's segment", () => {
    expect(segmentOf("b2b")).toBe("b2b");
    expect(segmentOf("b2c")).toBe("b2c");
  });
  it("counts trainings without a deal, or with an unknown value, as B2B (Growth)", () => {
    expect(segmentOf(null)).toBe("b2b");
    expect(segmentOf(undefined)).toBe("b2b");
    expect(segmentOf("retail")).toBe("b2b");
  });
  it("only accepts known segments from the filter", () => {
    expect(isSegment("b2c")).toBe(true);
    expect(isSegment("all")).toBe(false);
    expect(SEGMENT_LABEL.b2b).toBe("B2B");
  });
});
