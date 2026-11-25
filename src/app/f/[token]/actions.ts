"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/supabase";
import { feedbackWindow, isUuid } from "@/lib/format";
import { findFeedbackTarget } from "@/lib/feedback-target";
import { feedbackAlwaysOpen, getFeedbackForm, takesFeedback } from "@/lib/feedback-mode";
import { readAnswers } from "@/lib/feedback-form";
import { getCurrentUser } from "@/lib/auth";

// A training room rarely holds more than this; anything beyond it is treated as abuse.
const MAX_RESPONSES = 150;
const MAX_PER_MINUTE = 40;

// Public (no login): participants submit anonymous feedback from the QR code.
export async function submitParticipantFeedback(token: string, fd: FormData) {
  if (!isUuid(token)) return { error: "This feedback link is not valid." };
  // a booking day (B2B) or an uploaded B2C session
  const b = await findFeedbackTarget(token);
  const alwaysOpen = await feedbackAlwaysOpen();
  if (!b || !takesFeedback(b.status)) return { error: "This feedback link is not valid." };
  // The trainer can't rate their own session.
  const me = await getCurrentUser();
  if (me && b.trainerUserId && me.id === b.trainerUserId) return { error: "Trainers can't submit feedback for their own session." };
  const { opens, closes } = feedbackWindow(b);
  const now = Date.now();
  if (!alwaysOpen && now < opens.getTime()) return { error: "Feedback opens when the training starts." };
  if (!alwaysOpen && now > closes.getTime()) return { error: "Feedback for this training has closed." };
  const jar = await cookies();
  if (jar.get(`fb_${b.id}`)) return { error: "You've already sent feedback for this session. Thank you!" };
  const read = readAnswers(await getFeedbackForm(), (name) => {
    const v = fd.get(name);
    return typeof v === "string" ? v : null;
  });
  if ("error" in read) return { error: read.error };
  // The cookie only stops honest repeats, so also cap volume: a burst limit and a ceiling per session.
  // B2C answers live in their own table, keyed by the session
  const table = b.kind === "b2c" ? "b2c_feedback_responses" : "feedback_responses";
  const key = b.kind === "b2c" ? "b2c_session_id" : "booking_id";
  const [{ count: total }, { count: recent }] = await Promise.all([
    db().from(table).select("id", { count: "exact", head: true }).eq(key, b.id),
    db().from(table).select("id", { count: "exact", head: true }).eq(key, b.id).gte("created_at", new Date(now - 60_000).toISOString()),
  ]);
  if ((total ?? 0) >= MAX_RESPONSES) return { error: "This session has reached the maximum number of responses. Thank you!" };
  if ((recent ?? 0) >= MAX_PER_MINUTE) return { error: "Lots of people are sending feedback right now. Please try again in a minute." };
  const answer = { recommend: read.recommend, reason: read.reason, ...read.legacy, answers: read.answers };
  const { error } =
    b.kind === "b2c"
      ? await db().from("b2c_feedback_responses").insert({ b2c_session_id: b.id, trainer_id: b.trainerId, ...answer })
      : await db().from("feedback_responses").insert({ booking_id: b.id, ...answer });
  if (error) return { error: "Something went wrong. Please try again." };
  jar.set(`fb_${b.id}`, "1", { maxAge: 60 * 60 * 24 * 7, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return { ok: "Thank you! Your feedback was sent." };
}
