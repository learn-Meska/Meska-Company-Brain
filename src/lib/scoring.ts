import "server-only";
import { db, fetchAll } from "./supabase";
import { todayISO } from "./format";
import { nps } from "./survey";

export type Category = { id: string; name: string; weight: number; source: "manual" | "feedback"; sort: number };
export type Tier = { id: string; name: string; min_score: number; color: string; audience_ids: string[] };
export type TrainerProfile = {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  bio: string | null;
  title: string | null;
  photo_path: string | null;
  cv_path: string | null;
  cv_name: string | null;
  feedback_name: string | null;
  overview: string | null;
  credentials: string | null;
  footprint_intro: string | null;
  footprint: string | null;
  expertise: string | null;
  thought_leadership: string | null;
  active: boolean;
  invited_at: string | null;
  skills: { id: string; name: string }[];
  lookups: { id: string; kind: "audience" | "function" | "industry"; name: string }[];
  categories: { id: string; name: string; weight: number; source: Category["source"]; score: number | null }[];
  total: number;
  calculated_total: number;
  score_override: number | null;
  tier: Tier | null;
  // average = imported scorecard rating (1–5); nps = QR survey Net Promoter Score (−100 to 100)
  feedback: { average: number | null; nps: number | null; npsResponses: number; responses: number; sessions: number; reasons: string[] };
  delivered: number;
};

export const nameKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await db().from("settings").select("value").eq("key", key).maybeSingle();
  return ((data as { value: T } | null)?.value ?? fallback) as T;
}

export async function getTiers(): Promise<Tier[]> {
  const [{ data: tiers }, { data: ta }] = await Promise.all([
    db().from("tiers").select("*").order("min_score", { ascending: false }),
    db().from("tier_audience").select("*"),
  ]);
  return ((tiers ?? []) as Omit<Tier, "audience_ids">[]).map((t) => ({
    ...t,
    min_score: Number(t.min_score),
    audience_ids: ((ta ?? []) as { tier_id: string; lookup_id: string }[]).filter((x) => x.tier_id === t.id).map((x) => x.lookup_id),
  }));
}

export function tierFor(total: number, tiers: Tier[]) {
  return [...tiers].sort((a, b) => b.min_score - a.min_score).find((t) => total >= t.min_score) ?? null;
}

// Builds full profiles (scores, tier, feedback, delivered count) for the given trainers, or all of them.
export async function getTrainerProfiles(ids?: string[]): Promise<TrainerProfile[]> {
  const sb = db();
  let tq = sb.from("trainers").select("*").order("full_name");
  if (ids) tq = tq.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const { data: trainersRaw } = await tq;
  const trainers = (trainersRaw ?? []) as Omit<TrainerProfile, "skills" | "lookups" | "categories" | "total" | "calculated_total" | "tier" | "feedback" | "delivered">[];
  const tIds = trainers.map((t) => t.id);
  if (!tIds.length) return [];

  const [cats, tiers, ts, tl, scores, feedback, delivered, history, live] = await Promise.all([
    sb.from("score_categories").select("*").order("sort"),
    getTiers(),
    fetchAll((f, t) => sb.from("trainer_skills").select("trainer_id, skills(id, name)").in("trainer_id", tIds).order("trainer_id").order("skill_id").range(f, t)),
    fetchAll((f, t) => sb.from("trainer_lookups").select("trainer_id, lookups(id, kind, name, sort)").in("trainer_id", tIds).order("trainer_id").order("lookup_id").range(f, t)),
    fetchAll((f, t) => sb.from("trainer_scores").select("*").in("trainer_id", tIds).order("trainer_id").order("category_id").range(f, t)),
    fetchAll((f, t) => sb.from("feedback_sessions").select("trainer_name, responses, delivery").order("id").range(f, t)),
    fetchAll((f, t) => sb.from("bookings").select("trainer_id, date").eq("status", "confirmed").lt("date", todayISO()).in("trainer_id", tIds).order("id").range(f, t)),
    fetchAll((f, t) => sb.from("delivered_history").select("trainer_name, total, as_of").order("trainer_name").order("as_of").range(f, t)),
    // feedback collected in this system through the QR code
    fetchAll((f, t) => sb.from("feedback_responses").select("recommend, reason, created_at, bookings!inner(trainer_id)").in("bookings.trainer_id", tIds).order("created_at", { ascending: false }).order("id").range(f, t)),
  ]);
  const categories = ((cats.data ?? []) as Category[]).map((c) => ({ ...c, weight: Number(c.weight) }));

  return trainers.map((t) => {
    const skills = ((ts.data ?? []) as unknown as { trainer_id: string; skills: { id: string; name: string } }[])
      .filter((x) => x.trainer_id === t.id)
      .map((x) => x.skills)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    const lookups = ((tl.data ?? []) as unknown as { trainer_id: string; lookups: TrainerProfile["lookups"][number] & { sort: number } }[])
      .filter((x) => x.trainer_id === t.id)
      .map((x) => x.lookups)
      .filter(Boolean)
      .sort((a, b) => a.sort - b.sort);

    // scorecard rows are matched by name; feedback_name covers a different spelling there
    const names = new Set([nameKey(t.full_name), ...(t.feedback_name ? [nameKey(t.feedback_name)] : [])]);
    const isNamed = (n: string) => names.has(nameKey(n));
    const fb = ((feedback.data ?? []) as { trainer_name: string; responses: number; delivery: number | null }[]).filter(
      (f) => isNamed(f.trainer_name) && f.delivery != null,
    );
    const mine = ((live.data ?? []) as unknown as { recommend: number | null; reason: string | null; bookings: { trainer_id: string } }[]).filter(
      (r) => r.bookings.trainer_id === t.id && r.recommend != null,
    );
    const scorecardResponses = fb.reduce((s, f) => s + f.responses, 0);
    const fbAvg = scorecardResponses ? fb.reduce((s, f) => s + Number(f.delivery) * f.responses, 0) / scorecardResponses : null;
    const trainerNps = nps(mine.map((r) => r.recommend as number));
    const responses = scorecardResponses + mine.length;
    // Client Feedback (0–100): scorecard rating ×20 and the survey NPS (negative counts as 0), weighted by responses.
    const feedbackScore = responses
      ? ((fbAvg ?? 0) * 20 * scorecardResponses + Math.max(0, trainerNps ?? 0) * mine.length) / responses
      : null;

    const catScores = categories.map((c) => {
      let score: number | null = null;
      if (c.source === "manual") {
        const row = ((scores.data ?? []) as { trainer_id: string; category_id: string; score: number }[]).find(
          (s) => s.trainer_id === t.id && s.category_id === c.id,
        );
        score = row ? Number(row.score) : null;
      } else if (c.source === "feedback") {
        score = feedbackScore != null ? Math.round(feedbackScore * 10) / 10 : null;
      }
      return { id: c.id, name: c.name, weight: c.weight, source: c.source, score };
    });
    const weightSum = categories.reduce((s, c) => s + c.weight, 0);
    // A category with no data yet counts as 0 so every trainer is measured on the same scale.
    const calculated = weightSum ? Math.round((catScores.reduce((s, c) => s + (c.score ?? 0) * c.weight, 0) / weightSum) * 10) / 10 : 0;
    // An admin can fix a trainer's total (e.g. senior trainers placed in Tier 1); the tier follows it.
    const override = t.score_override != null ? Number(t.score_override) : null;
    const total = override ?? calculated;

    return {
      ...t,
      skills,
      lookups,
      categories: catScores,
      total,
      calculated_total: calculated,
      score_override: override,
      tier: tierFor(total, tiers),
      feedback: {
        average: fbAvg != null ? Math.round(fbAvg * 100) / 100 : null,
        nps: trainerNps,
        npsResponses: mine.length,
        responses,
        sessions: fb.length,
        reasons: mine.map((r) => r.reason?.trim()).filter((x): x is string => !!x).slice(0, 10),
      },
      // Scorecard total up to its import date, plus trainings confirmed in this system after it.
      delivered: (() => {
        const h = ((history.data ?? []) as { trainer_name: string; total: number; as_of: string }[]).find((x) => isNamed(x.trainer_name));
        const mine = ((delivered.data ?? []) as { trainer_id: string; date: string }[]).filter((b) => b.trainer_id === t.id && (!h || b.date > h.as_of));
        return (h ? h.total : fb.length) + mine.length;
      })(),
    };
  });
}
