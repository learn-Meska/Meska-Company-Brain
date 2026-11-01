import "server-only";
import { db } from "./supabase";

export type DealInfo = {
  company: string;
  participants: number;
  departments: [string, number][];
  days: { id: string; day_number: number; date: string; start_time: string; end_time: string; location: string | null }[];
  // the guide and files the content team submitted for this deal; null until they submit
  content: { guide: string | null; submittedAt: string; files: { id: string; file_name: string; size_bytes: number | null }[] } | null;
};

// What a trainer may know about the deal behind a booking: company, who attends, every training day and the
// content the content team submitted. Nothing commercial, and not the participants' names.
export async function getDealInfo(dealId: string | null): Promise<DealInfo | null> {
  if (!dealId) return null;
  const [{ data: deal }, { data: contentRow }, { data: people }, { data: days }, { data: files }] = await Promise.all([
    db().from("deals").select("company_name").eq("id", dealId).maybeSingle(),
    // read apart from the company so a database without the content columns yet still shows the rest of the ticket
    db().from("deals").select("content_guide, content_submitted_at").eq("id", dealId).maybeSingle(),
    db().from("deal_participants").select("department").eq("deal_id", dealId).range(0, 999),
    db().from("bookings").select("id, day_number, date, start_time, end_time, location").eq("deal_id", dealId).neq("status", "cancelled").order("day_number"),
    db().from("deal_content").select("id, file_name, size_bytes").eq("deal_id", dealId).order("created_at"),
  ]);
  if (!deal) return null;
  const d = { ...(deal as { company_name: string }), ...((contentRow ?? {}) as { content_guide?: string | null; content_submitted_at?: string | null }) };
  const counts = new Map<string, number>();
  for (const p of (people ?? []) as { department: string | null }[]) {
    const dep = p.department?.trim();
    if (dep) counts.set(dep, (counts.get(dep) ?? 0) + 1);
  }
  return {
    company: d.company_name,
    participants: (people ?? []).length,
    departments: [...counts.entries()].sort((a, b) => b[1] - a[1]),
    days: (days ?? []) as DealInfo["days"],
    content: d.content_submitted_at ? { guide: d.content_guide ?? null, submittedAt: d.content_submitted_at, files: (files ?? []) as NonNullable<DealInfo["content"]>["files"] } : null,
  };
}
