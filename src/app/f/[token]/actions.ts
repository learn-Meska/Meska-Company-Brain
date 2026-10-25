"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/supabase";
import { feedbackWindow } from "@/lib/format";

// Public (no login): participants submit anonymous feedback from the QR code.
export async function submitParticipantFeedback(token: string, fd: FormData) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { error: "This feedback link is not valid." };
  const { data } = await db().from("bookings").select("id, status, date, start_time, end_time").eq("feedback_token", token).maybeSingle();
  const b = data as { id: string; status: string; date: string; start_time: string; end_time: string } | null;
  if (!b || b.status !== "confirmed") return { error: "This feedback link is not valid." };
  const { opens, closes } = feedbackWindow(b);
  const now = Date.now();
  if (now < opens.getTime()) return { error: "Feedback opens when the training starts." };
  if (now > closes.getTime()) return { error: "Feedback for this training has closed." };
  const jar = await cookies();
  if (jar.get(`fb_${b.id}`)) return { error: "You've already sent feedback for this session. Thank you!" };
  const trainer = Number(fd.get("trainer_score"));
  const content = Number(fd.get("content_score"));
  if (![1, 2, 3, 4, 5].includes(trainer) || ![1, 2, 3, 4, 5].includes(content)) return { error: "Please rate both the trainer and the content." };
  const clip = (k: string) => String(fd.get(k) ?? "").replace(/\r\n/g, "\n").trim().slice(0, 2000) || null;
  const { error } = await db().from("feedback_responses").insert({ booking_id: b.id, trainer_score: trainer, content_score: content, liked: clip("liked"), improve: clip("improve") });
  if (error) return { error: "Something went wrong. Please try again." };
  jar.set(`fb_${b.id}`, "1", { maxAge: 60 * 60 * 24 * 7, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return { ok: "Thank you! Your feedback was sent." };
}
