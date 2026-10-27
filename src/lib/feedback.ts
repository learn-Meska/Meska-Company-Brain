import "server-only";
import { db } from "./supabase";
import { nps, YES_NO_QUESTIONS, type YesNoKey } from "./survey";

export type Response = { booking_id: string; recommend: number | null; reason: string | null; created_at: string } & Record<YesNoKey, boolean | null>;
export type Summary = {
  count: number;
  nps: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  // share of "Yes" per question, 0–100
  yes: { key: YesNoKey; label: string; short: string; percent: number | null }[];
  reasons: string[];
};

export function summarize(rows: Response[]): Summary {
  const scores = rows.map((r) => r.recommend).filter((x): x is number => x != null);
  return {
    count: rows.length,
    nps: nps(scores),
    promoters: scores.filter((s) => s >= 9).length,
    passives: scores.filter((s) => s === 7 || s === 8).length,
    detractors: scores.filter((s) => s <= 6).length,
    yes: YES_NO_QUESTIONS.map((q) => {
      const answers = rows.map((r) => r[q.key]).filter((x): x is boolean => x != null);
      return { ...q, percent: answers.length ? Math.round((answers.filter(Boolean).length / answers.length) * 100) : null };
    }),
    reasons: rows.map((r) => r.reason?.trim()).filter((x): x is string => !!x),
  };
}

export async function bookingFeedback(bookingId: string) {
  const { data } = await db().from("feedback_responses").select("*").eq("booking_id", bookingId).order("created_at");
  return summarize((data ?? []) as Response[]);
}
