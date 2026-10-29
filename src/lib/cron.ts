import "server-only";
import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

// Scheduled jobs send "Authorization: Bearer <CRON_SECRET>"; compared in constant time.
export function cronAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
