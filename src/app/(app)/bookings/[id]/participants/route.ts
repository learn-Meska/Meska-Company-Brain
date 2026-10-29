import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { participantsCsv } from "@/lib/deal";

// The deal's participant list as a CSV in the template's format (Meska team only, never trainers).
export async function GET(_req: NextRequest, ctx: RouteContext<"/bookings/[id]/participants">) {
  const u = await getCurrentUser();
  const { id } = await ctx.params;
  if (!u || !["admin", "approver", "growth"].includes(u.role)) return new NextResponse("Not found", { status: 404 });
  const { data: b } = await db().from("bookings").select("deal_id, program_name").eq("id", id).maybeSingle();
  const booking = b as { deal_id: string | null; program_name: string } | null;
  if (!booking?.deal_id) return new NextResponse("Not found", { status: 404 });
  const { data } = await db().from("deal_participants").select("name, title, department").eq("deal_id", booking.deal_id).order("position").range(0, 999);
  const file = `${booking.program_name.replace(/[^\w\- ]+/g, "_").trim() || "deal"} participants.csv`;
  return new NextResponse(participantsCsv((data ?? []) as { name: string; title: string | null; department: string | null }[]), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "no-store" },
  });
}
