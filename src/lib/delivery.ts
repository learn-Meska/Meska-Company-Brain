// The trainer's delivery report for one training day. Pure rules, tested in tests/delivery.test.ts.

import { cairoStart } from "./format";

// A day can be marked as delivered from the moment its session starts (Cairo time), not before.
// anyTime: the "Mark as delivered any time" test switch (settings "delivery_test") lifts the wait.
export const deliveryOpen = (b: { date: string; start_time: string }, now = Date.now(), anyTime = false) => anyTime || now >= cairoStart(b.date, b.start_time).getTime();

// Where a training day stands for its trainer's "Mark as delivered" button:
// confirm_first: the trainer hasn't confirmed the day yet · not_yet: confirmed, the session hasn't started ·
// ready: the session started and no report was sent · done: delivered · none: nothing to deliver (cancelled…).
export type DeliveryState = "none" | "confirm_first" | "not_yet" | "ready" | "done";
export function deliveryState(b: { status: string; date: string; start_time: string; finished_at: string | null }, now = Date.now(), anyTime = false): DeliveryState {
  if (b.status === "awaiting_trainer") return "confirm_first";
  if (b.status !== "confirmed") return "none";
  if (b.finished_at) return "done";
  return deliveryOpen(b, now, anyTime) ? "ready" : "not_yet";
}

export type DeliveryReport ={ attended: number; topics: string; engagement: number; challenges: string; follow_up: string };
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
