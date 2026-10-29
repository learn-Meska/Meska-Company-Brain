import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { siteUrl } from "@/lib/email";
import { trainingIcs } from "@/lib/ics";

// "Add to my calendar": .ics file that Outlook, Apple Calendar and Google Calendar all open.
export async function GET(_req: NextRequest, ctx: RouteContext<"/bookings/[id]/ics">) {
  const u = await getCurrentUser();
  const { id } = await ctx.params;
  const { data } = await db().from("bookings").select("id, trainer_id, status, program_name, day_number, date, start_time, end_time, location, content").eq("id", id).maybeSingle();
  const b = data as (Parameters<typeof trainingIcs>[0] & { trainer_id: string; status: string }) | null;
  const allowed = u && b && ((!!u.trainer_id && u.trainer_id === b.trainer_id) || u.role === "admin" || u.role === "approver");
  if (!allowed || !["awaiting_trainer", "confirmed"].includes(b.status)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(trainingIcs(b, `${siteUrl()}/me/bookings/${b.id}`), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="Meska training ${b.date}.ics"`, "Cache-Control": "no-store" },
  });
}
