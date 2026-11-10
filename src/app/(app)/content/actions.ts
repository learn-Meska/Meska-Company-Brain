"use server";

import { revalidatePath } from "next/cache";
import { can, requireAccess, requireUser } from "@/lib/auth";
import { approvesContent, approvesContentOf, leaderOptions } from "@/lib/team-access";
import { teamPeople } from "@/lib/team-people";
import { db } from "@/lib/supabase";
import { esc } from "@/lib/email";
import { checkFile, downloadName, safeName } from "@/lib/files";
import { fmtDate, friendlyError, isUuid } from "@/lib/format";
import { audit, BOOKING_SELECT, notify, trainerRecipient, userById, usersWithRoles, type BookingRow } from "@/lib/notify";
import { trainingTeam } from "@/lib/team";

const MAX_GUIDE = 20000;
const MAX_NOTE = 1000;

type LiveDeal = { id: string; company_name: string; content_submitted_at: string | null; content_review_requested_at: string | null; content_review_requested_by: string | null };

// A member's approval request goes to their own team leader and to the content admins; with none of them,
// the company admins get it, so a request never gets stuck.
async function contentApprovers(member: { id: string; reports_to?: Record<string, string> | null }) {
  const people = await teamPeople();
  const leader = leaderOptions(people, "content", member.id).find((p) => p.id === member.reports_to?.content);
  const admins = people.filter((p) => (p.roles ?? []).includes("content") && (p.team_admin_of ?? []).includes("content"));
  const list = [...(leader ? [leader] : []), ...admins];
  const unique = [...new Map(list.map((p) => [p.id, { id: p.id, email: p.email, full_name: p.full_name }])).values()];
  return (unique.length ? unique : await usersWithRoles("admin")).filter((u) => u.id !== member.id);
}

// The member whose content is waiting for approval, with the leader they're assigned to.
async function reviewRequester(id: string | null) {
  if (!id) return null;
  const { data } = await db().from("app_users").select("id, full_name, reports_to").eq("id", id).maybeSingle();
  return data as { id: string; full_name: string; reports_to: Record<string, string> | null } | null;
}

// A deal the content team can work on: it exists and still has at least one live day.
async function liveDeal(dealId: string) {
  if (!isUuid(dealId)) return null;
  const { data: deal } = await db().from("deals").select("id, company_name, content_submitted_at, content_review_requested_at, content_review_requested_by").eq("id", dealId).maybeSingle();
  if (!deal) return null;
  const { data } = await db().from("bookings").select(BOOKING_SELECT).eq("deal_id", dealId).neq("status", "cancelled").order("day_number");
  const days = (data ?? []) as BookingRow[];
  if (!days.length) return null;
  return { deal: deal as LiveDeal, days };
}

// One-time URL so the browser uploads straight to storage (no server size limit).
export async function createContentUpload(dealId: string, fileName: string) {
  await requireAccess("content.write");
  if (!(await liveDeal(dealId))) return { error: "Request not found." };
  const bad = checkFile(fileName);
  if (bad) return { error: bad };
  const path = `deals/${dealId}/${Date.now()}-${safeName(fileName)}`;
  const { data, error } = await db().storage.from("materials").createSignedUploadUrl(path);
  if (error) return { error: error.message };
  return { path, token: data.token };
}

export async function recordContentFile(dealId: string, path: string, fileName: string, size: number) {
  const me = await requireAccess("content.write");
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
  await requireAccess("content.write");
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

// A content admin (or company admin) submits straight to the trainer. A content member's submission waits for a
// content admin's approval: the guide is kept in content_review_guide and the content admins are emailed.
export async function submitContent(dealId: string, guide: string) {
  const me = await requireAccess("content.submit");
  const d = await liveDeal(dealId);
  if (!d) return { error: "Request not found." };
  const text = typeof guide === "string" ? guide.trim() : "";
  if (text.length > MAX_GUIDE) return { error: "The guide is too long. Move the rest into a file." };
  const { count } = await db().from("deal_content").select("id", { count: "exact", head: true }).eq("deal_id", dealId);
  if (!text && !count) return { error: "Write the guide or upload at least one file first." };
  const label = `${d.deal.company_name} — ${d.days[0].program_name}`;

  if (!approvesContent(me)) {
    const { error } = await db()
      .from("deals")
      .update({ content_review_guide: text || null, content_review_requested_at: new Date().toISOString(), content_review_requested_by: me.id, content_review_note: null })
      .eq("id", dealId);
    if (error) return { error: friendlyError(error.message) };
    await audit(me.id, "content_review_requested", d.days[0].id, { company: d.deal.company_name, files: count ?? 0 });
    await notify(await contentApprovers(me), {
      title: `Content waiting for your approval: ${label}`,
      body: `${me.full_name} sent the content for approval.`,
      link: `/content/${dealId}`,
      email: {
        subject: `Action needed: approve the content for ${label} (from ${me.full_name})`,
        heading: "Content is waiting for your approval",
        intro: `<b>${esc(me.full_name)}</b> prepared the content for this training and sent it for your approval. The trainer sees it only after you approve it.`,
        rows: [
          ["Company", esc(d.deal.company_name)],
          ["Program", esc(d.days[0].program_name)],
          ["Files", String(count ?? 0)],
        ],
        next: ["Open the content and review the guide and files.", "<b>Approve</b> it by submitting, so the trainer and the team are notified, or <b>send it back</b> with a note on what to change."],
        button: "Review the content",
      },
    });
    revalidatePath(`/content/${dealId}`);
    revalidatePath("/content");
    return { ok: "Sent to your team leader for approval. You'll be told once it's approved." };
  }

  // Content waiting for approval is approved by the member's own team leader or a content admin.
  if (d.deal.content_review_requested_at && d.deal.content_review_requested_by !== me.id) {
    const waitingFor = await reviewRequester(d.deal.content_review_requested_by);
    if (!approvesContentOf(me, waitingFor)) return { error: `This content is waiting for ${waitingFor?.full_name ?? "the member"}'s team leader or a content admin to approve it.` };
  }

  const again = !!d.deal.content_submitted_at;
  const requesterId = d.deal.content_review_requested_at && d.deal.content_review_requested_by !== me.id ? d.deal.content_review_requested_by : null;
  const { error } = await db()
    .from("deals")
    .update({
      content_guide: text || null,
      content_submitted_at: new Date().toISOString(),
      content_submitted_by: me.id,
      content_review_guide: null,
      content_review_requested_at: null,
      content_review_requested_by: null,
      content_review_note: null,
    })
    .eq("id", dealId);
  if (error) return { error: friendlyError(error.message) };
  await audit(me.id, "content_submitted", d.days[0].id, { company: d.deal.company_name, files: count ?? 0, update: again, approved_for: requesterId });

  // each assigned trainer once, linked to their own first day
  const mine = new Map<string, BookingRow>();
  for (const b of d.days) if (b.trainer_id && ["awaiting_trainer", "confirmed"].includes(b.status) && !mine.has(b.trainer_id)) mine.set(b.trainer_id, b);
  for (const b of mine.values()) {
    await notify([await trainerRecipient(b)], {
      title: `${again ? "Updated" : "New"} content for ${b.program_name}`,
      body: "Your guide and files are ready on the training.",
      link: `/me/bookings/${b.id}`,
      email: {
        subject: `${again ? "Content updated" : "Content ready"} for ${b.program_name} — your training on ${fmtDate(b.date, { day: "numeric", month: "long" })}`,
        heading: again ? "The training content was updated" : "Your training content is ready",
        step: "content",
        intro: `The content team ${again ? "updated" : "prepared"} the content for <b>${esc(b.program_name)}</b>.`,
        next: [`Open your training to read the guide and download the files${again ? " (the latest version replaces the previous one)" : ""}.`, "Prepare the session with it before the training day."],
        button: "Open the training",
      },
    });
  }
  const seen = mine.size ? " The assigned trainer can now see it." : " The trainer will see it once one is assigned.";
  const requester = requesterId ? await userById(requesterId) : null;
  if (requester) {
    await notify([requester], {
      title: `Content approved: ${label}`,
      body: `${me.full_name} approved your content.`,
      link: `/content/${dealId}`,
      email: {
        subject: `Approved: your content for ${label}`,
        heading: "Your content was approved",
        step: "content",
        intro: `<b>${esc(me.full_name)}</b> approved the content you prepared.${seen}`,
        next: ["Nothing else is needed. If the training changes, you can update the content and send it again."],
        button: "Open the content",
      },
    });
  }
  await notify((await trainingTeam(d.days[0], me.id)).filter((u) => u.id !== requester?.id), {
    title: `Content ${again ? "updated" : "submitted"}: ${label}`,
    body: `${me.full_name} ${again ? "updated" : "submitted"} the content.`,
    link: `/bookings/${d.days[0].id}`,
    email: {
      subject: `Content ${again ? "updated" : "ready"}: ${label}`,
      heading: again ? "The training content was updated" : "The training content is ready",
      step: "content",
      intro: `<b>${esc(me.full_name)}</b> ${requester ? `approved the content from <b>${esc(requester.full_name)}</b>` : again ? "updated the content" : "submitted the content"} for this training.${seen}`,
      rows: [
        ["Company", esc(d.deal.company_name)],
        ["Program", esc(d.days[0].program_name)],
        ["Files", String(count ?? 0)],
      ],
      next: [mine.size ? "The assigned trainer was notified and can read the guide and download the files on the training." : "The trainer will see the content as soon as one is assigned and confirms."],
      button: "View the training",
    },
  });
  revalidatePath(`/content/${dealId}`);
  revalidatePath("/content");
  for (const b of d.days) revalidatePath(`/me/bookings/${b.id}`);
  const done = mine.size ? "The trainer was notified." : "The trainer will see it once one is assigned.";
  return { ok: requester ? `Approved and submitted. ${done}` : `Content submitted. ${done}` };
}

// A content admin sends a member's content back with a note; the draft stays so they can fix it and resend.
export async function returnContent(dealId: string, note: string) {
  const me = await requireAccess("content.view");
  if (!approvesContent(me)) return { error: "Only a team leader or a content admin can send content back." };
  const d = await liveDeal(dealId);
  if (!d) return { error: "Request not found." };
  const pendingAt = d.deal.content_review_requested_at;
  if (!pendingAt) return { error: "Nothing is waiting for approval." };
  if (!approvesContentOf(me, await reviewRequester(d.deal.content_review_requested_by))) return { error: "Only this member's team leader or a content admin can send it back." };
  const text = typeof note === "string" ? note.trim() : "";
  if (!text) return { error: "Write what needs to change." };
  if (text.length > MAX_NOTE) return { error: `Keep the note under ${MAX_NOTE} characters.` };
  const { data, error } = await db()
    .from("deals")
    .update({ content_review_requested_at: null, content_review_note: text })
    .eq("id", dealId)
    .eq("content_review_requested_at", pendingAt)
    .select("id");
  if (error) return { error: friendlyError(error.message) };
  if (!data?.length) return { error: "This content changed meanwhile. Refresh and try again." };
  await audit(me.id, "content_review_returned", d.days[0].id, { company: d.deal.company_name, note: text });
  const requester = await userById(d.deal.content_review_requested_by);
  const label = `${d.deal.company_name} — ${d.days[0].program_name}`;
  if (requester && requester.id !== me.id) {
    await notify([requester], {
      title: `Changes requested: ${label}`,
      body: text.slice(0, 140),
      link: `/content/${dealId}`,
      email: {
        subject: `Action needed: changes requested on your content for ${label}`,
        heading: "Your content needs changes",
        intro: `<b>${esc(me.full_name)}</b> reviewed the content you sent and asked for changes before it goes to the trainer. Their note is below.`,
        content: text,
        next: ["Open the content, make the changes in the guide or the files, then send it for approval again."],
        button: "Open the content",
      },
    });
  }
  revalidatePath(`/content/${dealId}`);
  revalidatePath("/content");
  return { ok: "Sent back with your note." };
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
  } else if (!(can(me, "content.view") || me.role === "approver" || me.role === "growth")) {
    return { error: "File not found." };
  }
  const { data: s, error } = await db().storage.from("materials").createSignedUrl(f.file_path, 300, { download: downloadName(f.file_name, f.file_path) });
  if (error) return { error: error.message };
  return { url: s.signedUrl };
}
