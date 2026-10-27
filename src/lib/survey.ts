// Meska Trainee Feedback Survey v2 — shared by the public form, summaries and scoring.
export const RECOMMEND_QUESTION = "Based on today’s training, how likely is it that you would recommend Meska to a friend or colleague?";
export const REASON_QUESTION = "What’s the main reason for your score?";

export const YES_NO_QUESTIONS = [
  { key: "told_objectives", label: "At the start, we were told what we will learn.", short: "Told what they'd learn" },
  { key: "practised", label: "During the session, I was given a chance to practise what I was learning.", short: "Had a chance to practise" },
  { key: "ai_safety", label: "During the session, we were told what is safe and what is not safe to put into AI tools.", short: "Told what's safe to put into AI" },
] as const;

export type YesNoKey = (typeof YES_NO_QUESTIONS)[number]["key"];

// Net Promoter Score: % promoters (9–10) minus % detractors (0–6), from −100 to 100.
export function nps(scores: number[]) {
  if (!scores.length) return null;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

export const fmtNps = (n: number | null) => (n == null ? "—" : n > 0 ? `+${n}` : String(n));
