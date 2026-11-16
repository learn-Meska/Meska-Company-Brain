import "server-only";
import { searchTrainers } from "./search";
import { db } from "./supabase";
import { slotsFor } from "./format";
import { getTrainerProfiles } from "./scoring";
import { availabilityAnswer, trainerDayStatus, type CheckDay, type TrainerDayStatus } from "./availability-check";

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

// The assign screen: every active trainer, and for each day whether they are free, booked or unavailable.
// Locks held by the day itself don't count (a day being reassigned doesn't block its own trainer).
export async function trainerStatusesFor(days: { id: string; date: string; start: string; end: string }[]) {
  const dates = [...new Set(days.map((d) => d.date))];
  const [profiles, { data: avail }, { data: locks }] = await Promise.all([
    getTrainerProfiles(),
    dates.length ? db().from("availability").select("trainer_id, date, slot").in("date", dates) : Promise.resolve({ data: [] }),
    dates.length ? db().from("booking_locks").select("trainer_id, date, slot, booking_id").in("date", dates) : Promise.resolve({ data: [] }),
  ]);
  const key = (t: string, d: string) => `${t}|${d}`;
  const free = new Map<string, Set<string>>();
  for (const a of (avail ?? []) as { trainer_id: string; date: string; slot: string }[]) {
    const k = key(a.trainer_id, a.date);
    if (!free.has(k)) free.set(k, new Set());
    free.get(k)!.add(a.slot);
  }
  const trainers = profiles
    .filter((t) => t.active)
    .map((t) => ({ id: t.id, full_name: t.full_name, tier: t.tier ? { name: t.tier.name, color: t.tier.color } : null, total: t.total }));
  return {
    trainers,
    days: days.map((d) => {
      const slots = slotsFor(d.start, d.end);
      const booked = new Map<string, Set<string>>();
      for (const l of (locks ?? []) as { trainer_id: string; date: string; slot: string; booking_id: string }[]) {
        if (l.date !== d.date || l.booking_id === d.id) continue;
        if (!booked.has(l.trainer_id)) booked.set(l.trainer_id, new Set());
        booked.get(l.trainer_id)!.add(l.slot);
      }
      const status: Record<string, TrainerDayStatus> = {};
      for (const t of trainers) status[t.id] = trainerDayStatus(slots, free.get(key(t.id, d.date)), booked.get(t.id));
      return { id: d.id, slots, status };
    }),
  };
}
