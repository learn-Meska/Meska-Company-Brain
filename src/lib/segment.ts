// Deal segments. Every deal Growth sends from New deal is B2B; B2C deals will be added later.
export const SEGMENTS = ["b2b", "b2c"] as const;
export type Segment = (typeof SEGMENTS)[number];
export const SEGMENT_LABEL: Record<Segment, string> = { b2b: "B2B", b2c: "B2C" };

export const isSegment = (v: unknown): v is Segment => typeof v === "string" && (SEGMENTS as readonly string[]).includes(v);

// The segment of a training: its deal's segment. Trainings made before deals existed came from Growth, so B2B.
export function segmentOf(dealSegment: string | null | undefined): Segment {
  return isSegment(dealSegment) ? dealSegment : "b2b";
}
