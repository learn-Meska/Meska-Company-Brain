import "server-only";
import { db } from "./supabase";

export type Response = { booking_id: string; trainer_score: number; content_score: number; liked: string | null; improve: string | null; created_at: string };
export type Summary = { count: number; trainer: number | null; content: number | null; liked: string[]; improve: string[] };

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

export function summarize(rows: Response[]): Summary {
  return {
    count: rows.length,
    trainer: avg(rows.map((r) => r.trainer_score)),
    content: avg(rows.map((r) => r.content_score)),
    liked: rows.map((r) => r.liked?.trim()).filter((x): x is string => !!x),
    improve: rows.map((r) => r.improve?.trim()).filter((x): x is string => !!x),
  };
}

export async function bookingFeedback(bookingId: string) {
  const { data } = await db().from("feedback_responses").select("*").eq("booking_id", bookingId).order("created_at");
  return summarize((data ?? []) as Response[]);
}
