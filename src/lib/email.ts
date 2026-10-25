import "server-only";
import nodemailer from "nodemailer";
import { db } from "./supabase";
import { EMAIL_LOGO_PNG_BASE64 } from "./email-logo";

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

function mailer() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  transport ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  return transport;
}

export const siteUrl = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Every email is recorded in email_outbox; without Gmail credentials it stays "queued" so nothing is lost.
export type Attachment = { filename: string; content: string | Buffer; contentType: string };

export async function sendEmail(to: string, subject: string, html: string, extra: Attachment[] = []) {
  const { data } = await db().from("email_outbox").insert({ to_email: to, subject, html }).select("id").single();
  const id = (data as { id: string } | null)?.id;
  const t = mailer();
  if (!t) {
    console.log(`[email not sent: Gmail not configured] to=${to} subject="${subject}"`);
    return;
  }
  try {
    await t.sendMail({
      from: `"${process.env.MAIL_FROM_NAME ?? "Meska AI"}" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
      attachments: [
        ...(html.includes("cid:meska-logo")
          ? [{ filename: "meska-logo.png", content: Buffer.from(EMAIL_LOGO_PNG_BASE64, "base64"), contentType: "image/png", cid: "meska-logo" }]
          : []),
        ...extra,
      ],
    });
    if (id) await db().from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[email failed]", msg);
    if (id) await db().from("email_outbox").update({ status: "failed", error: msg }).eq("id", id);
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type EmailRow = [label: string, value: string];

// One branded layout for every message the system sends.
export function emailLayout(opts: {
  greeting: string;
  intro: string;
  rows?: EmailRow[];
  content?: string;
  extra?: string;
  button?: { label: string; url: string };
  footnote?: string;
}) {
  const rows = (opts.rows ?? [])
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;color:#5E6B82;font-size:13px;width:140px;vertical-align:top;border-top:1px solid #E1E7F1">${esc(k)}</td><td style="padding:8px 12px;color:#1A2436;font-size:14px;font-weight:600;border-top:1px solid #E1E7F1">${v}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#F5F7FC;font-family:Poppins,Segoe UI,Arial,sans-serif;color:#1F2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FC;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E1E7F1">
<tr><td style="background:linear-gradient(150deg,#0B1E3A,#14315E 45%,#1D4ED8);padding:22px 28px;color:#fff">
<img src="cid:meska-logo" alt="Meska AI" width="150" style="display:block;height:auto;border:0;margin-bottom:14px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#93C5FD;font-weight:500">Programs, Learning &amp; Delivery</div>
<div style="font-size:20px;font-weight:700;margin-top:4px">Meska Training Center</div></td></tr>
<tr><td style="padding:26px 28px">
<p style="margin:0 0 12px;font-size:15px">${esc(opts.greeting)}</p>
<p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#33415C">${opts.intro}</p>
${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E1E7F1;border-radius:10px;border-collapse:separate;margin-bottom:18px">${rows}</table>` : ""}
${opts.content ? `<div style="background:linear-gradient(120deg,#EFF6FF,#DBEAFE);border-left:4px solid #2563EB;border-radius:0 10px 10px 0;padding:14px 16px;margin-bottom:18px"><div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#2563EB;font-weight:600;margin-bottom:6px">Content to be delivered</div><div style="font-size:14px;line-height:1.65;white-space:pre-wrap">${esc(opts.content)}</div></div>` : ""}
${opts.extra ?? ""}
${opts.button ? `<p style="margin:6px 0 18px"><a href="${opts.button.url}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:14px">${esc(opts.button.label)}</a></p>` : ""}
${opts.footnote ? `<p style="margin:0;font-size:12.5px;color:#5E6B82;line-height:1.6">${opts.footnote}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;background:#F5F7FC;font-size:11.5px;color:#97A3B8">Sent by Meska Training Center.<br>© 2026 Meska AI — Confidential</td></tr>
</table></td></tr></table></body></html>`;
}

export { esc };
