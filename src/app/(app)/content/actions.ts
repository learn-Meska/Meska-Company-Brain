"use server";

import { revalidatePath } from "next/cache";
import { canManageContent, requireRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { esc } from "@/lib/email";
import { checkFile, downloadName, safeName } from "@/lib/files";
import { friendlyError, isUuid } from "@/lib/format";
import { audit, BOOKING_SELECT, notify, trainerRecipient, type BookingRow } from "@/lib/notify";
import { trainingTeam } from "@/lib/team";

const MAX_GUIDE = 20000;

// A deal the content team can work on: it exists and still has at least one live day.
async function liveDeal(dealId: string) {
  if (!isUuid(dealId)) return null;
  const { data: deal } = await db().from("deals").select("id, company_name, content_submitted_at").eq("id", dealId).maybeSingle();
  if (!deal) return null;
  const { data } = await db().from("bookings").select(BOOKING_SELECT).eq("deal_id", dealId).neq("status", "cancelled").order("day_number");
  const days = (data ?? []) as BookingRow[];
  if (!days.length) return null;
  return { deal: deal as { id: string; company_name: string; content_submitted_at: string | null }, days };
}

// One-time URL so the browser uploads straight to storage (no server size limit).
export async function createContentUpload(dealId: string, fileName: string) {
  await requireRole("content", "admin");
  if (!(await liveDeal(dealId))) return { error: "Request not found." };
  const bad = checkFile(fileName);
  if (bad) return { error: bad };
  const path = `deals/${dealId}/${Date.now()}-${safeName(fileName)}`;
  const { data, error } = await db().storage.from("materials").createSignedUploadUrl(path);
  if (error) return { error: error.message };
  return { path, token: data.token };
}

export async function recordContentFile(dealId: string, path: string, fileName: string, size: number) {
  const me = await requireRole("content", "admin");
  const d = await liveDeal(dealId);
  if (!d) return { error: "Request not found." };
  // Only a path this app handed out for this deal.
  if (typeof path !== "string" || !path.startsWith(`deals/${dealId}/`) || path.includes("..") || checkFile(path)) return { error: "Invalid upload." };
  const { error } = await db()
    .from("deal_content")
    .insert({ deal_id: dealId, file_path: path, file_name: String(fileName).slice(0, 200), size_bytes: Number.isFinite(Number(size)) ? Number(size) : null, uploaded_by: me.id });
  if (error) return { error: friendlyError(error.message) };
  await audit(me.id, "content_uploaded", d.days[0].id, { file: fileName, company: d.deal.company_name });
  revalidatePath(`/content/${dealId}`);
  return { ok: `Uploaded ${fileName}.` };
}

export async function deleteContentFile(fileId: string) {
  await requireRole("content", "admin");
  if (!isUuid(fileId)) return { error: "File not found." };
  const { data } = await db().from("deal_content").select("file_path, deal_id").eq("id", fileId).maybeSingle();
  const f = data as { file_path: string; deal_id: string } | null;
  if (!f) return { error: "File not found." };
  const { error } = await db().from("deal_content").delete().eq("id", fileId);
  if (error) return { error: friendlyError(error.message) };
  await db().storage.from("materials").remove([f.file_path]);
  revalidatePath(`/content/${f.deal_id}`);
  return { ok: "File removed." };
}

// Saves the written guide, marks the content as submitted and tells the trainers and the booking team.
// Trainers see the content on their training only after this.
export async function submitContent(dealId: string, guide: string) {
  const me = await requireRole("content", "admin");
  const d = await liveDeal(dealId);
  if (!d) return { error: "Request not found." };
  const text = typeof guide === "string" ? guide.trim() : "";
  if (text.length > MAX_GUIDE) return { error: "The guide is too long. Move the rest into a file." };
  const { count } = await db().from("deal_content").select("id", { count: "exact", head: true }).eq("deal_id", dealId);
  if (!text && !count) return { error: "Write the guide or upload at least one file first." };
  const again = !!d.deal.content_submitted_at;
  const { error } = await db()
    .from("deals")
    .update({ content_guide: text || null, content_submitted_at: new Date().toISOString(), content_submitted_by: me.id })
    .eq("id", dealId);
  if (error) return { error: friendlyError(error.message) };
  await audit(me.id, "content_submitted", d.days[0].id, { company: d.deal.company_name, files: count ?? 0, update: again });

  const label = `${d.deal.company_name} — ${d.days[0].program_name}`;
  // each assigned trainer once, linked to their own first day
  const mine = new Map<string, BookingRow>();
  for (const b of d.days) if (b.trainer_id && ["awaiting_trainer", "confirmed"].includes(b.status) && !mine.has(b.trainer_id)) mine.set(b.trainer_id, b);
  for (const b of mine.values()) {
    await notify([await trainerRecipient(b)], {
      title: `${again ? "Updated" : "New"} content for ${b.program_name}`,
      body: "Your guide and files are ready on the training.",
      link: `/me/bookings/${b.id}`,
      email: {
        subject: `${again ? "Updated" : "New"} training content — ${b.program_name}`,
        intro: `The content team ${again ? "updated" : "prepared"} the content for <b>${esc(b.program_name)}</b>. Open your training to read the guide and download the files.`,
        button: "Open the training",
      },
    });
  }
  await notify(await trainingTeam(d.days[0], me.id), {
    title: `Content ${again ? "updated" : "submitted"}: ${label}`,
    body: `${me.full_name} ${again ? "updated" : "submitted"} the content.`,
    link: `/bookings/${d.days[0].id}`,
    email: {
      subject: `Content ${again ? "updated" : "submitted"}: ${label}`,
      intro: `<b>${esc(me.full_name)}</b> ${again ? "updated" : "submitted"} the content for this training.${mine.size ? " The assigned trainer can now see it." : " The trainer will see it once one is assigned."}`,
      rows: [
        ["Company", esc(d.deal.company_name)],
        ["Program", esc(d.days[0].program_name)],
      ],
      button: "View the training",
    },
  });
  revalidatePath(`/content/${dealId}`);
  revalidatePath("/content");
  for (const b of d.days) revalidatePath(`/me/bookings/${b.id}`);
  return { ok: mine.size ? "Content submitted. The trainer was notified." : "Content submitted. The trainer will see it once one is assigned." };
}

// A download link for one content file: the content team and Meska staff, or the trainer assigned to this deal
// once the content has been submitted.
export async function contentLink(fileId: string) {
  const me = await requireUser();
  if (!isUuid(fileId)) return { error: "File not found." };
  const { data } = await db().from("deal_content").select("file_path, file_name, deal_id").eq("id", fileId).maybeSingle();
  const f = data as { file_path: string; file_name: string; deal_id: string } | null;
  if (!f) return { error: "File not found." };
  if (me.role === "trainer") {
    if (!me.trainer_id) return { error: "File not found." };
    const [{ data: deal }, { data: mine }] = await Promise.all([
      db().from("deals").select("content_submitted_at").eq("id", f.deal_id).maybeSingle(),
      db().from("bookings").select("id").eq("deal_id", f.deal_id).eq("trainer_id", me.trainer_id).limit(1),
    ]);
    if (!(deal as { content_submitted_at: string | null } | null)?.content_submitted_at || !(mine ?? []).length) return { error: "File not found." };
  } else if (!canManageContent(me) && me.role !== "approver" && me.role !== "growth") {
    return { error: "File not found." };
  }
  const { data: s, error } = await db().storage.from("materials").createSignedUrl(f.file_path, 300, { download: downloadName(f.file_name, f.file_path) });
  if (error) return { error: error.message };
  return { url: s.signedUrl };
}
