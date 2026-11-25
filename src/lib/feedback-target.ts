import "server-only";
import { db } from "./supabase";
import { isUuid } from "./format";

// What a feedback QR code points at: a booking day (B2B) or an uploaded B2C session. Both use /f/<token>.
export type FeedbackTarget = {
  kind: "booking" | "b2c";
  id: string;
  status: string;
  date: string;
  start_time: string;
  end_time: string;
  // shown on the form, e.g. "Day 2" or "Session 2"
  label: string;
  trainerName: string | null;
  trainerId: string | null;
  // the trainer's login, so they can't rate their own session
  trainerUserId: string | null;
};

type Trainer = { full_name?: string; user_id: string | null } | null;

export async function findFeedbackTarget(token: string): Promise<FeedbackTarget | null> {
  if (!isUuid(token)) return null;
  const { data: b } = await db()
    .from("bookings")
    .select("id, status, date, start_time, end_time, day_number, trainer_id, trainers(full_name, user_id)")
    .eq("feedback_token", token)
    .maybeSingle();
  if (b) {
    const x = b as unknown as { id: string; status: string; date: string; start_time: string; end_time: string; day_number: number; trainer_id: string | null; trainers: Trainer };
    return {
      kind: "booking",
      id: x.id,
      status: x.status,
      date: x.date,
      start_time: x.start_time,
      end_time: x.end_time,
      label: `Day ${x.day_number}`,
      trainerName: x.trainers?.full_name ?? null,
      trainerId: x.trainer_id,
      trainerUserId: x.trainers?.user_id ?? null,
    };
  }
  const { data: s } = await db()
    .from("b2c_sessions")
    .select("id, status, date, start_time, end_time, session, trainer_name, trainer_id, trainers(user_id)")
    .eq("feedback_token", token)
    .maybeSingle();
  if (!s) return null;
  const y = s as unknown as { id: string; status: string; date: string; start_time: string; end_time: string; session: string; trainer_name: string | null; trainer_id: string | null; trainers: Trainer };
  return {
    kind: "b2c",
    id: y.id,
    status: y.status,
    date: y.date,
    start_time: y.start_time,
    end_time: y.end_time,
    label: y.session,
    trainerName: y.trainer_name,
    trainerId: y.trainer_id,
    trainerUserId: y.trainers?.user_id ?? null,
  };
}
