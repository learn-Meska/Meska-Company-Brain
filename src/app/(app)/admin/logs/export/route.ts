import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { AUDIT_LABEL, todayISO } from "@/lib/format";

type Log = { action: string; details: Record<string, unknown> | null; created_at: string; app_users: { full_name: string; email: string } | null };

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Full activity log as CSV (opens in Excel / Google Sheets). Admin only.
export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return new NextResponse("Not found", { status: 404 });
  const only = req.nextUrl.searchParams.get("only");
  let q = db().from("audit_log").select("action, details, created_at, app_users(full_name, email)").order("created_at", { ascending: false }).limit(10000);
  if (only === "cancellations") q = q.eq("action", "booking_cancelled");
  const { data } = await q;

  const header = ["Date", "Time (Cairo)", "Who", "Email", "Action", "Training", "Reason", "Changes", "Comment", "Short notice"];
  const rows = ((data ?? []) as unknown as Log[]).map((l) => {
    const d = l.details ?? {};
    const at = new Date(l.created_at);
    const changes = Array.isArray(d.changes) ? (d.changes as { field: string; from: string; to: string }[]).map((c) => `${c.field}: ${c.from} → ${c.to}`).join(" | ") : "";
    return [
      at.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }),
      at.toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" }),
      l.app_users?.full_name ?? "System",
      l.app_users?.email ?? "",
      AUDIT_LABEL[l.action] ?? l.action,
      d.program ?? d.name ?? d.email ?? "",
      d.reason ?? "",
      changes,
      d.comment ?? "",
      d.short_notice === true ? "Yes" : d.short_notice === false ? "No" : "",
    ];
  });
  // BOM so Excel opens accents and arrows correctly
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Meska Activity Log${only === "cancellations" ? " - Cancellations" : ""} ${todayISO()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
