"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/supabase";
import { feedbackWindow } from "@/lib/format";
import { YES_NO_QUESTIONS } from "@/lib/survey";

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
  const raw = String(fd.get("recommend") ?? "");
  const recommend = Number(raw);
  if (raw === "" || !Number.isInteger(recommend) || recommend < 0 || recommend > 10) return { error: "Please pick a score from 0 to 10." };
  const yesNo = Object.fromEntries(YES_NO_QUESTIONS.map((q) => [q.key, fd.get(q.key) === "yes" ? true : fd.get(q.key) === "no" ? false : null]));
  if (Object.values(yesNo).some((v) => v == null)) return { error: "Please answer Yes or No to every question." };
  const reason = String(fd.get("reason") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 2000) || null;
  const { error } = await db().from("feedback_responses").insert({ booking_id: b.id, recommend, reason, ...yesNo });
  if (error) return { error: "Something went wrong. Please try again." };
  jar.set(`fb_${b.id}`, "1", { maxAge: 60 * 60 * 24 * 7, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return { ok: "Thank you! Your feedback was sent." };
}
