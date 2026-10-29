import QRCode from "qrcode";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { siteUrl } from "@/lib/email";
import { programVisible } from "@/lib/format";

// Downloadable QR code for one training day; participants scan it to open the anonymous feedback form.
export async function GET(_req: NextRequest, ctx: RouteContext<"/bookings/[id]/qr">) {
  const u = await getCurrentUser();
  const { id } = await ctx.params;
  const { data } = await db().from("bookings").select("trainer_id, status, feedback_token, program_name, day_number, date, start_time").eq("id", id).maybeSingle();
  const b = data as { trainer_id: string; status: string; feedback_token: string; program_name: string; day_number: number; date: string; start_time: string } | null;
  const allowed = u && b && (u.role === "admin" || u.role === "approver" || (!!u.trainer_id && u.trainer_id === b.trainer_id));
  if (!allowed || b.status !== "confirmed") return new NextResponse("Not found", { status: 404 });
  const png = await QRCode.toBuffer(`${siteUrl()}/f/${b.feedback_token}`, { type: "png", width: 1024, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0B1E3A", light: "#FFFFFF" } });
  const showProgram = u.role !== "trainer" || u.trainer_id !== b.trainer_id || programVisible(b);
  const name = `Feedback QR - ${showProgram ? b.program_name.replace(/[^\w .-]/g, "") + " - " : ""}Day ${b.day_number} - ${b.date}.png`;
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
