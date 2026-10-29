import type { Metadata } from "next";
import { cookies } from "next/headers";
import AuthLayout from "@/app/(auth)/layout";
import { FeedbackForm } from "@/components/feedback-form";
import { db } from "@/lib/supabase";
import { feedbackWindow, fmtDate, isFuture, isPast } from "@/lib/format";

export const metadata: Metadata = { title: "Training feedback · Meska Company Brain" };

export default async function FeedbackPage({ params }: PageProps<"/f/[token]">) {
  const { token } = await params;
  const { data } = /^[0-9a-f-]{36}$/i.test(token)
    ? await db().from("bookings").select("id, status, date, start_time, end_time, day_number, trainers(full_name)").eq("feedback_token", token).maybeSingle()
    : { data: null };
  const b = data as unknown as { id: string; status: string; date: string; start_time: string; end_time: string; day_number: number; trainers: { full_name: string } | null } | null;
  let body: React.ReactNode;
  if (!b || b.status !== "confirmed") body = <p className="text-center text-muted">This feedback link is not valid.</p>;
  else {
    const { opens, closes } = feedbackWindow(b);
    const already = (await cookies()).get(`fb_${b.id}`);
    body = already ? (
      <p className="rounded-xl bg-good-bg px-4 py-6 text-center text-base font-medium text-good">You&apos;ve already sent feedback for this session. Thank you!</p>
    ) : isFuture(opens) ? (
        <p className="text-center text-muted">Feedback opens when the training starts on {fmtDate(b.date)}.</p>
      ) : isPast(closes) ? (
        <p className="text-center text-muted">Feedback for this training has closed. Thank you!</p>
      ) : (
        <FeedbackForm token={token} />
      );
  }
  return (
    <AuthLayout heading="Training Feedback">
      <div className="mb-5">
        <h1 className="h2">How was today&apos;s session?</h1>
        {b?.status === "confirmed" && (
          <p className="text-sm text-muted">
            {fmtDate(b.date)} · Day {b.day_number} · Trainer: <b className="text-ink">{b.trainers?.full_name ?? "—"}</b>
          </p>
        )}
      </div>
      {body}
    </AuthLayout>
  );
}
