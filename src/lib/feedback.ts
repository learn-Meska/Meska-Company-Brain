import "server-only";
import { db } from "./supabase";
import { nps } from "./survey";
import { summarizeQuestions, type QuestionSummary, type ResponseRow } from "./feedback-form";

export type Response = ResponseRow & { booking_id: string; created_at: string };
export type Summary = {
  count: number;
  nps: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  // every other question of the form, summed up (works for older responses too)
  questions: QuestionSummary[];
};

export function summarize(rows: Response[]): Summary {
  const scores = rows.map((r) => r.recommend).filter((x): x is number => x != null);
  return {
    count: rows.length,
    nps: nps(scores),
    promoters: scores.filter((s) => s >= 9).length,
    passives: scores.filter((s) => s === 7 || s === 8).length,
    detractors: scores.filter((s) => s <= 6).length,
    questions: summarizeQuestions(rows),
  };
}

export async function bookingFeedback(bookingId: string) {
  const { data } = await db().from("feedback_responses").select("*").eq("booking_id", bookingId).order("created_at");
  return summarize((data ?? []) as Response[]);
}
