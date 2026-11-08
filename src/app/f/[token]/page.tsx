import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { FeedbackForm } from "@/components/feedback-form";
import { CalendarIcon, CheckIcon, UsersIcon } from "@/components/icons";
import { db } from "@/lib/supabase";
import { feedbackWindow, fmtDate, isFuture, isPast } from "@/lib/format";
import { feedbackAlwaysOpen, getFeedbackForm, takesFeedback } from "@/lib/feedback-mode";

export const metadata: Metadata = { title: "Training feedback · Meska Company Brain" };

function Notice({ icon, title, text }: { icon?: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-ds-border bg-ds-surface px-6 py-12 text-center">
      {icon && <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-ds-primary-soft text-ds-primary">{icon}</span>}
      <h2 className="text-lg font-semibold text-ds-heading">{title}</h2>
      <p className="mt-1 text-sm text-ds-text">{text}</p>
    </div>
  );
}

// The page participants open from the training's QR code. Public: no sign-in.
export default async function FeedbackPage({ params }: PageProps<"/f/[token]">) {
  const { token } = await params;
  const { data } = /^[0-9a-f-]{36}$/i.test(token)
    ? await db().from("bookings").select("id, status, date, start_time, end_time, day_number, trainers(full_name)").eq("feedback_token", token).maybeSingle()
    : { data: null };
  const b = data as unknown as { id: string; status: string; date: string; start_time: string; end_time: string; day_number: number; trainers: { full_name: string } | null } | null;
  const alwaysOpen = await feedbackAlwaysOpen();
  const valid = !!b && takesFeedback(b.status, alwaysOpen);

  let body: ReactNode;
  if (!b || !valid) body = <Notice title="This link isn't valid" text="Ask your trainer for the QR code of today's session." />;
  else {
    const { opens, closes } = feedbackWindow(b);
    const already = (await cookies()).get(`fb_${b.id}`);
    body = already ? (
      <Notice icon={<CheckIcon size={26} />} title="Feedback already sent" text="You've already shared your feedback for this session. Thank you!" />
    ) : !alwaysOpen && isFuture(opens) ? (
      <Notice icon={<CalendarIcon size={24} />} title="Not open yet" text={`Feedback opens when the training starts on ${fmtDate(b.date)}.`} />
    ) : !alwaysOpen && isPast(closes) ? (
      <Notice title="Feedback has closed" text="Feedback for this session is closed. Thank you!" />
    ) : (
      <FeedbackForm token={token} questions={(await getFeedbackForm()).questions} />
    );
  }

  return (
    <div className="min-h-screen bg-ds-canvas">
      <div className="h-1 bg-ds-primary" />
      <main className="mx-auto max-w-2xl px-4 pb-10 pt-6 sm:pt-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-horizontal-dark-text.png" alt="Meska AI" className="h-8 w-auto" />

        <header className="mb-6 mt-6">
          <span className="inline-flex items-center rounded-md bg-ds-primary-soft px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ds-primary">Training feedback</span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ds-heading sm:text-[28px]">How was today&apos;s session?</h1>
          <p className="mt-1 text-sm text-ds-text">Your answers are anonymous and take about a minute.</p>
          {b && valid && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ds-border bg-ds-surface px-3 py-1 text-xs text-ds-heading">
                <CalendarIcon size={14} className="text-ds-primary" /> {fmtDate(b.date)} · Day {b.day_number}
              </span>
              {b.trainers?.full_name && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-ds-border bg-ds-surface px-3 py-1 text-xs text-ds-heading">
                  <UsersIcon size={14} className="text-ds-primary" /> Trainer: {b.trainers.full_name}
                </span>
              )}
            </div>
          )}
        </header>

        {body}

        <p className="mt-8 text-center text-xs text-ds-text">© 2026 Meska AI · Confidential</p>
      </main>
    </div>
  );
}
