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
  let pdf: Buffer;
  try {
    pdf = await renderBioPdf({ t, photo: await photoBytes(t.photo_path) });
  } catch (e) {
    // most often a photo that can't be decoded: the bio still works without it
    console.error("[bio pdf]", e instanceof Error ? e.message : e);
    try {
      pdf = await renderBioPdf({ t, photo: null });
    } catch (e2) {
      console.error("[bio pdf retry]", e2 instanceof Error ? e2.message : e2);
      return new NextResponse("The profile PDF couldn't be generated. Please try again.", { status: 500 });
    }
  }
  // ASCII fallback name plus the real (e.g. Arabic) name for browsers that support it
  const ascii = t.full_name.replace(/[^\w .-]/g, "").trim() || "Trainer";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Meska Trainer Bio - ${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(`Meska Trainer Bio - ${t.full_name}.pdf`)}`,
      "Cache-Control": "no-store",
    },
  });
}
