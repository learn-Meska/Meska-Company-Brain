// The trainer's delivery report for one training day. Pure rules, tested in tests/delivery.test.ts.

export type DeliveryReport = { attended: number; topics: string; engagement: number; challenges: string; follow_up: string };
export type DeliveryInput = { brief?: unknown; attended?: unknown; topics?: unknown; engagement?: unknown; challenges?: unknown; follow_up?: unknown };

export const ENGAGEMENT_LABEL: Record<number, string> = { 1: "Very low", 2: "Low", 3: "Moderate", 4: "High", 5: "Very high" };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");

// Checks what the trainer typed and returns the clean report, or a message to show them.
export function readDeliveryReport(input: DeliveryInput): { report: DeliveryReport; brief: string } | { error: string } {
  const attended = Number(input.attended);
  if (input.attended === "" || input.attended == null || !Number.isInteger(attended) || attended < 0 || attended > 10000) return { error: "Enter how many participants attended." };
  const topics = text(input.topics, 4000);
  if (!topics) return { error: "Write the topics you covered." };
  const engagement = Number(input.engagement);
  if (!Number.isInteger(engagement) || engagement < 1 || engagement > 5) return { error: "Rate the participants' engagement from 1 to 5." };
  return {
    report: { attended, topics, engagement, challenges: text(input.challenges, 4000), follow_up: text(input.follow_up, 4000) },
    brief: text(input.brief, 10000),
  };
}

// A report saved in the database, if it has the expected shape.
export function asDeliveryReport(v: unknown): DeliveryReport | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<DeliveryReport>;
  return typeof r.attended === "number" && typeof r.topics === "string" && typeof r.engagement === "number"
    ? { attended: r.attended, topics: r.topics, engagement: r.engagement, challenges: r.challenges ?? "", follow_up: r.follow_up ?? "" }
    : null;
}
