import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/supabase";

export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ items: [] }, { status: 401 });
  const { data } = await db().from("notifications").select("*").eq("user_id", u.id).order("created_at", { ascending: false }).limit(40);
  return NextResponse.json({ items: data ?? [] });
}

export async function POST() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({}, { status: 401 });
  await db().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", u.id).is("read_at", null);
  return NextResponse.json({ ok: true });
}
