"use server";

import { revalidatePath } from "next/cache";
import { can, requireRole } from "@/lib/auth";
import { participantRows, participantsError, type Participant } from "@/lib/deal";
import { esc } from "@/lib/email";
import { friendlyError, isUuid } from "@/lib/format";
import { audit, notify } from "@/lib/notify";
import { db } from "@/lib/supabase";
import { trainingTeam } from "@/lib/team";
import { seesDealOf } from "@/lib/team-people";

type Stored = { position: number; name: string; title: string | null; department: string | null };

// The audience is optional on a New deal, so the participant list can be added (or replaced) afterwards:
// by Training Excellence with "Edit trainings", or by Growth with "Send new deals" on a deal it can open.
export async function saveParticipants(bookingId: string, list: unknown) {
  const me = await requireRole("admin", "approver", "growth");
  if (!isUuid(bookingId)) return { error: "Training not found." };
  const { data } = await db().from("bookings").select("id, deal_id, program_name, created_by").eq("id", bookingId).maybeSingle();
  const b = data as { id: string; deal_id: string | null; program_name: string; created_by: string | null } | null;
  if (!b?.deal_id) return { error: "Training not found." };
  if (!(can(me, "te.edit") || (can(me, "growth.new_deal") && (await seesDealOf(me, b.created_by))))) return { error: "Training not found." };
  const bad = participantsError(list);
  if (bad) return { error: bad };
  const people = list as Participant[];
  if (!people.length) return { error: "The file has no participants. Add one participant per row under the header." };

  const dealId = b.deal_id;
  const { data: before } = await db().from("deal_participants").select("position, name, title, department").eq("deal_id", dealId).order("position").range(0, 999);
  const old = (before ?? []) as Stored[];
  // Replace the whole list. If the new one can't be saved, the previous one is put back.
  if (old.length) {
    const { error } = await db().from("deal_participants").delete().eq("deal_id", dealId);
    if (error) return { error: friendlyError(error.message) };
  }
  const { error } = await db().from("deal_participants").insert(participantRows(dealId, people));
  if (error) {
    if (old.length) await db().from("deal_participants").insert(old.map((p) => ({ deal_id: dealId, position: p.position, name: p.name, title: p.title, department: p.department })));
    return { error: friendlyError(error.message) };
  }
  await audit(me.id, "participants_updated", b.id, { program: b.program_name, participants: people.length, before: old.length });

  // The content team writes for this audience, so everyone on the training hears about it.
  const what = old.length ? "updated" : "added";
  await notify(await trainingTeam({ deal_id: dealId, created_by: b.created_by }, me.id), {
    title: `Participant list ${what}: ${b.program_name}`,
    body: `${me.full_name} · ${people.length} ${people.length === 1 ? "participant" : "participants"}`,
    link: `/bookings/${b.id}`,
    email: {
      subject: `Participant list ${what} for ${b.program_name} (${people.length} ${people.length === 1 ? "participant" : "participants"})`,
      heading: `The participant list was ${what}`,
      intro: `<b>${esc(me.full_name)}</b> ${what} the participant list of <b>${esc(b.program_name)}</b>.`,
      rows: [
        ["Program", esc(b.program_name)],
        ["Participants", `${people.length}${old.length ? ` (was ${old.length})` : ""}`],
      ],
      next: ["<b>Content team:</b> open the content request to read the audience and adjust the content if needed.", "Nothing else is needed. The trainer sees the number of participants per department, never their names."],
      button: "View the training",
    },
  });
  revalidatePath(`/bookings/${b.id}`);
  revalidatePath("/bookings", "layout");
  revalidatePath("/dashboard", "layout");
  revalidatePath(`/content/${dealId}`);
  revalidatePath("/me/bookings", "layout");
  return { ok: `Saved ${people.length} ${people.length === 1 ? "participant" : "participants"}. The team was notified.` };
}
