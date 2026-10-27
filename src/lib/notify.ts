import "server-only";
import { db } from "./supabase";
import { emailLayout, esc, sendEmail, siteUrl, type Attachment, type EmailRow } from "./email";
import { fmtDate, fmtTime, programVisible, STATUS_LABEL } from "./format";

type Recipient = { id: string; email: string; full_name: string };

// A login can hold several roles, so match on any of them.
export async function usersWithRoles(...roles: string[]): Promise<Recipient[]> {
  const { data } = await db().from("app_users").select("id, email, full_name").overlaps("roles", roles);
  return (data ?? []) as Recipient[];
}

export async function userWithRole(id: string | null | undefined, role: string): Promise<Recipient | null> {
  if (!id) return null;
  const { data } = await db().from("app_users").select("id, email, full_name").eq("id", id).contains("roles", [role]).maybeSingle();
  return (data as Recipient | null) ?? null;
}

export async function userById(id: string | null | undefined): Promise<Recipient | null> {
  if (!id) return null;
  const { data } = await db().from("app_users").select("id, email, full_name").eq("id", id).maybeSingle();
  return (data as Recipient | null) ?? null;
}

// In-app bell notification plus (optionally) an email to each recipient.
export async function notify(
  recipients: (Recipient | null | undefined)[],
  n: { title: string; body?: string; link?: string; email?: { subject: string; intro: string; rows?: EmailRow[]; content?: string; extra?: string; button?: string; attachments?: Attachment[] } },
) {
  const unique = [...new Map(recipients.filter((r): r is Recipient => !!r).map((r) => [r.id || r.email, r])).values()];
  if (!unique.length) return;
  // Trainers who haven't accepted their invite yet have no account, so they only get the email.
  const inApp = unique.filter((r) => r.id);
  if (inApp.length) {
    await db()
      .from("notifications")
      .insert(inApp.map((r) => ({ user_id: r.id, title: n.title, body: n.body ?? null, link: n.link ?? null })));
  }
  if (n.email) {
    const e = n.email;
    await Promise.all(
      unique.map((r) =>
        sendEmail(
          r.email,
          e.subject,
          emailLayout({
            greeting: `Dear ${r.full_name.split(" ")[0]},`,
            intro: e.intro,
            rows: e.rows,
            content: e.content,
            extra: e.extra,
            button: n.link ? { label: e.button ?? "Open in the system", url: siteUrl() + n.link } : undefined,
          }),
          e.attachments,
        ),
      ),
    );
  }
}

export async function audit(actorId: string | null, action: string, bookingId: string | null, details?: unknown) {
  await db().from("audit_log").insert({ actor_id: actorId, action, booking_id: bookingId, details: details ?? null });
}

export type BookingRow = {
  id: string;
  batch_id: string | null;
  program_name: string;
  day_number: number;
  trainer_id: string | null;
  same_trainer_pref: boolean;
  date: string;
  start_time: string;
  end_time: string;
  slots: string[];
  location: string | null;
  // client point of contact, the same on every day of a request (never shown to trainers)
  contact_name: string | null;
  contact_email: string | null;
  contact_mobile: string | null;
  audience_id: string | null;
  function_id: string | null;
  industry_id: string | null;
  skill_ids: string[];
  content: string;
  status: string;
  created_by: string | null;
  approver_id: string | null;
  approver_comment: string | null;
  decided_at: string | null;
  trainer_comment: string | null;
  trainer_responded_at: string | null;
  cancel_reason: string | null;
  brief: string | null;
  brief_submitted_at: string | null;
  feedback_token: string;
  finished_at: string | null;
  feedback_summary_sent_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  trainers?: { id: string; full_name: string; email: string | null; user_id: string | null };
  audience?: { name: string } | null;
  func?: { name: string } | null;
  industry?: { name: string } | null;
};

export const BOOKING_SELECT =
  "*, trainers(id, full_name, email, user_id), audience:lookups!bookings_audience_id_fkey(name), func:lookups!bookings_function_id_fkey(name), industry:lookups!bookings_industry_id_fkey(name)";

// forTrainer hides the program name until 2 days before the training.
export function bookingRows(b: BookingRow, forTrainer = false): EmailRow[] {
  const program = forTrainer && !programVisible(b) ? `Shared 2 days before the training — Day ${b.day_number}` : `${esc(b.program_name)} — Day ${b.day_number}`;
  return [
    ["Program", program],
    ["Date", esc(fmtDate(b.date))],
    ["Time", `${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`],
    ["Location", esc(b.location || "To be confirmed")],
    ["Industry", esc(b.industry?.name ?? "—")],
    ["Function", esc(b.func?.name ?? "—")],
    ["Audience level", esc(b.audience?.name ?? "—")],
    ["Status", esc(STATUS_LABEL[b.status] ?? b.status)],
  ];
}

export async function trainerRecipient(b: BookingRow): Promise<Recipient | null> {
  if (b.trainers?.user_id) return userById(b.trainers.user_id);
  if (b.trainers?.email) return { id: "", email: b.trainers.email, full_name: b.trainers.full_name };
  return null;
}
