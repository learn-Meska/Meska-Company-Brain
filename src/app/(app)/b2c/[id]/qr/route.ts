import QRCode from "qrcode";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { siteUrl } from "@/lib/email";
import { isUuid } from "@/lib/format";
import { takesFeedback } from "@/lib/feedback-mode";
import { canGetB2CQr } from "@/lib/b2c-feedback";

// Downloadable QR code for one B2C session; participants scan it to open the same anonymous feedback form as B2B.
export async function GET(_req: NextRequest, ctx: RouteContext<"/b2c/[id]/qr">) {
  const u = await getCurrentUser();
  const { id } = await ctx.params;
  if (!u || !isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const { data } = await db().from("b2c_sessions").select("trainer_id, status, feedback_token, program, cohort, session, date").eq("id", id).maybeSingle();
  const s = data as { trainer_id: string | null; status: string; feedback_token: string; program: string; cohort: string; session: string; date: string } | null;
  if (!s || !canGetB2CQr(u, s.trainer_id) || !takesFeedback(s.status)) return new NextResponse("Not found", { status: 404 });
  const png = await QRCode.toBuffer(`${siteUrl()}/f/${s.feedback_token}`, { type: "png", width: 1024, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0B1E3A", light: "#FFFFFF" } });
  const name = `Feedback QR - ${`${s.program} ${s.cohort} - ${s.session}`.replace(/[^\w .-]/g, "")} - ${s.date}.png`;
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
