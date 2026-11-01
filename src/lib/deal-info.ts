import "server-only";
import { db } from "./supabase";

export type DealInfo = {
  company: string;
  participants: number;
  departments: [string, number][];
  days: { id: string; day_number: number; date: string; start_time: string; end_time: string; location: string | null }[];
};

// What a trainer may know about the deal behind a booking: company, who attends and every training day.
// Nothing commercial, and not the participants' names.
export async function getDealInfo(dealId: string | null): Promise<DealInfo | null> {
  if (!dealId) return null;
  const [{ data: deal }, { data: people }, { data: days }] = await Promise.all([
    db().from("deals").select("company_name").eq("id", dealId).maybeSingle(),
    db().from("deal_participants").select("department").eq("deal_id", dealId).range(0, 999),
    db().from("bookings").select("id, day_number, date, start_time, end_time, location").eq("deal_id", dealId).neq("status", "cancelled").order("day_number"),
  ]);
  if (!deal) return null;
  const counts = new Map<string, number>();
  for (const p of (people ?? []) as { department: string | null }[]) {
    const d = p.department?.trim();
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return {
    company: (deal as { company_name: string }).company_name,
    participants: (people ?? []).length,
    departments: [...counts.entries()].sort((a, b) => b[1] - a[1]),
    days: (days ?? []) as DealInfo["days"],
  };
}
