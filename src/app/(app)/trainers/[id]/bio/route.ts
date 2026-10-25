import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTrainerProfiles } from "@/lib/scoring";
import { photoBytes } from "@/lib/photos";
import { renderBioPdf } from "@/lib/bio-pdf";

// Generated on every download, so the PDF always reflects the current profile.
export async function GET(_req: NextRequest, ctx: RouteContext<"/trainers/[id]/bio">) {
  const u = await getCurrentUser();
  const { id } = await ctx.params;
  if (!u || (u.role === "trainer" && u.trainer_id !== id)) return new NextResponse("Not found", { status: 404 });
  const [t] = await getTrainerProfiles([id]);
  if (!t) return new NextResponse("Not found", { status: 404 });
  const pdf = await renderBioPdf({ t, photo: await photoBytes(t.photo_path) });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Meska Trainer Bio - ${t.full_name.replace(/[^\w .-]/g, "")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
