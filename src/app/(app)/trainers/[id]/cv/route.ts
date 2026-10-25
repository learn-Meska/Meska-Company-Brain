import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/supabase";

// Download a trainer's CV through a short-lived signed link (staff, or the trainer themself).
export async function GET(_req: NextRequest, ctx: RouteContext<"/trainers/[id]/cv">) {
  const u = await getCurrentUser();
  const { id } = await ctx.params;
  if (!u || (u.role === "trainer" && u.trainer_id !== id)) return new NextResponse("Not found", { status: 404 });
  const { data } = await db().from("trainers").select("cv_path, cv_name").eq("id", id).maybeSingle();
  const t = data as { cv_path: string | null; cv_name: string | null } | null;
  if (!t?.cv_path) return new NextResponse("No CV uploaded", { status: 404 });
  const { data: s, error } = await db().storage.from("cvs").createSignedUrl(t.cv_path, 300, { download: t.cv_name ?? "CV.pdf" });
  if (error || !s) return new NextResponse("Could not open the CV", { status: 500 });
  return NextResponse.redirect(s.signedUrl);
}
