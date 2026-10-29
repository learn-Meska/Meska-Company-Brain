"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/supabase";
import { feedbackWindow, isUuid } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";

// A training room rarely holds more than this; anything beyond it is treated as abuse.
const MAX_RESPONSES = 150;
const MAX_PER_MINUTE = 40;

// Public (no login): participants submit anonymous feedback from the QR code.
export async function submitParticipantFeedback(token: string, fd: FormData) {
  if (!isUuid(token)) return { error: "This feedback link is not valid." };
  const { data } = await db().from("bookings").select("id, status, date, start_time, end_time, trainers(user_id)").eq("feedback_token", token).maybeSingle();
  const b = data as unknown as { id: string; status: string; date: string; start_time: string; end_time: string; trainers: { user_id: string | null } | null } | null;
  if (!b || b.status !== "confirmed") return { error: "This feedback link is not valid." };
  // The trainer can't rate their own session.
  const me = await getCurrentUser();
  if (me && b.trainers?.user_id && me.id === b.trainers.user_id) return { error: "Trainers can't submit feedback for their own session." };
  const { opens, closes } = feedbackWindow(b);
  const now = Date.now();
  if (now < opens.getTime()) return { error: "Feedback opens when the training starts." };
  if (now > closes.getTime()) return { error: "Feedback for this training has closed." };
  const jar = await cookies();
  if (jar.get(`fb_${b.id}`)) return { error: "You've already sent feedback for this session. Thank you!" };
  const trainer = Number(fd.get("trainer_score"));
  const content = Number(fd.get("content_score"));
  if (![1, 2, 3, 4, 5].includes(trainer) || ![1, 2, 3, 4, 5].includes(content)) return { error: "Please rate both the trainer and the content." };
  // The cookie only stops honest repeats, so also cap volume: a burst limit and a ceiling per session.
  const [{ count: total }, { count: recent }] = await Promise.all([
    db().from("feedback_responses").select("id", { count: "exact", head: true }).eq("booking_id", b.id),
    db().from("feedback_responses").select("id", { count: "exact", head: true }).eq("booking_id", b.id).gte("created_at", new Date(now - 60_000).toISOString()),
  ]);
  if ((total ?? 0) >= MAX_RESPONSES) return { error: "This session has reached the maximum number of responses. Thank you!" };
  if ((recent ?? 0) >= MAX_PER_MINUTE) return { error: "Lots of people are sending feedback right now. Please try again in a minute." };
  const clip = (k: string) => String(fd.get(k) ?? "").replace(/\r\n/g, "\n").trim().slice(0, 2000) || null;
  const { error } = await db().from("feedback_responses").insert({ booking_id: b.id, trainer_score: trainer, content_score: content, liked: clip("liked"), improve: clip("improve") });
  if (error) return { error: "Something went wrong. Please try again." };
  jar.set(`fb_${b.id}`, "1", { maxAge: 60 * 60 * 24 * 7, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return { ok: "Thank you! Your feedback was sent." };
}
