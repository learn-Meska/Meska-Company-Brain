import "server-only";
import { searchTrainers } from "./search";
import { availabilityAnswer, type CheckDay } from "./availability-check";

// No auth checks here, so never export these from a "use server" file.

// The trainers Training Excellence can assign to a day: active and free in every slot the time touches.
// For now matching is on time availability only (no industry, audience, function or skill). The assign screen
// and Growth's yes/no check both use this rule, so "a trainer is available" means the assign screen has someone.
export async function assignableTrainers(d: CheckDay, excludeBookingId?: string) {
  const r = await searchTrainers({ date: d.date, start: d.start, end: d.end, audienceId: "", functionId: "", industryId: "", skillIds: [], excludeBookingId });
  return r.matches;
}

// Yes or no per day (and whether one trainer could take them all). No names, scores or counts leave the server.
export async function availabilityFor(days: CheckDay[]) {
  const lists = await Promise.all(days.map((d) => assignableTrainers(d)));
  return availabilityAnswer(lists.map((l) => l.map((t) => t.id)));
}
