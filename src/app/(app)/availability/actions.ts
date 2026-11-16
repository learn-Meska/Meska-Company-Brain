"use server";

import { requireRole } from "@/lib/auth";
import { availabilityFor } from "@/lib/availability";
import { readAvailabilityQuery } from "@/lib/availability-check";
import { todayISO } from "@/lib/format";

// Growth (and the booking team) ask whether a trainer can take each day. The answer is yes or no per day:
// trainer names, profiles and counts are never returned here.
export async function checkAvailability(input: unknown) {
  await requireRole("admin", "approver", "growth");
  const q = readAvailabilityQuery(input, todayISO());
  if ("error" in q) return { error: q.error };
  return availabilityFor(q.days, q.industryId);
}
