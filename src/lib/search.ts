import "server-only";
import { db } from "./supabase";
import { slotsFor } from "./format";
import { getTrainerProfiles, type TrainerProfile } from "./scoring";

export type SearchInput = {
  date: string;
  start: string;
  end: string;
  audienceId: string;
  functionId: string;
  industryId: string;
  skillIds: string[];
  excludeBookingId?: string;
};

export type SearchResult = { matches: TrainerProfile[]; slots: string[]; unavailableCount: number };

// Trainers who fit the profile filters and, when a date is given, are free in every slot the time touches.
export async function searchTrainers(q: SearchInput): Promise<SearchResult> {
  if (!q.date) return { matches: filterProfiles(await getTrainerProfiles(), q), slots: [], unavailableCount: 0 };
  const slots = slotsFor(q.start, q.end);
  if (!slots.length || q.end <= q.start) return { matches: [], slots, unavailableCount: 0 };

  const [{ data: avail }, { data: locks }] = await Promise.all([
    db().from("availability").select("trainer_id, slot").eq("date", q.date).in("slot", slots),
    db().from("booking_locks").select("trainer_id, slot, booking_id").eq("date", q.date).in("slot", slots),
  ]);
  const free = new Map<string, Set<string>>();
  for (const a of (avail ?? []) as { trainer_id: string; slot: string }[]) {
    if (!free.has(a.trainer_id)) free.set(a.trainer_id, new Set());
    free.get(a.trainer_id)!.add(a.slot);
  }
  for (const l of (locks ?? []) as { trainer_id: string; slot: string; booking_id: string }[]) {
    if (l.booking_id !== q.excludeBookingId) free.get(l.trainer_id)?.delete(l.slot);
  }
  const candidates = [...free.entries()].filter(([, s]) => slots.every((x) => s.has(x))).map(([id]) => id);
  const profiles = await getTrainerProfiles(candidates);
  const matches = filterProfiles(profiles, q);
  return { matches, slots, unavailableCount: profiles.length - matches.length };
}

function filterProfiles(profiles: TrainerProfile[], q: SearchInput) {
  const matches = profiles.filter((t) => {
    if (!t.active) return false;
    const skillSet = new Set(t.skills.map((s) => s.id));
    const tags = new Set(t.lookups.map((l) => l.id));
    if (!q.skillIds.every((s) => skillSet.has(s))) return false;
    for (const id of [q.audienceId, q.functionId, q.industryId]) if (id && !tags.has(id)) return false;
    // A tier with no audience rules may train anyone.
    if (q.audienceId && t.tier && t.tier.audience_ids.length && !t.tier.audience_ids.includes(q.audienceId)) return false;
    return true;
  });
  return matches.sort((a, b) => b.total - a.total);
}
