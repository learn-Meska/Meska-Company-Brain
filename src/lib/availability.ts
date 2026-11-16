import "server-only";
import { searchTrainers } from "./search";
import { availabilityAnswer, type CheckDay } from "./availability-check";

// No auth checks here, so never export these from a "use server" file.

// The trainers Training Excellence can assign to a New deal day: active, free in every slot the time touches
// and, when the deal's industry is known, working in that industry. The assign screen and Growth's yes/no
// check both use this rule, so "a trainer is available" always means the assign screen has someone to offer.
export async function assignableTrainers(d: CheckDay, industryId: string | null, excludeBookingId?: string) {
  const r = await searchTrainers({ date: d.date, start: d.start, end: d.end, audienceId: "", functionId: "", industryId: industryId ?? "", skillIds: [], excludeBookingId });
  return r.matches;
}

// Yes or no per day (and whether one trainer could take them all). No names, scores or counts leave the server.
export async function availabilityFor(days: CheckDay[], industryId: string | null) {
  const lists = await Promise.all(days.map((d) => assignableTrainers(d, industryId)));
  return availabilityAnswer(lists.map((l) => l.map((t) => t.id)));
}
