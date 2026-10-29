"use server";

import { revalidatePath } from "next/cache";
import { requireTrainer } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { audit, notify, usersWithRoles } from "@/lib/notify";
import { friendlyError, fmtDate, isMonth, todayISO } from "@/lib/format";

type Cell = { date: string; slot: "morning" | "evening" };

// Replaces the trainer's availability for one month with the given set of slots.
export async function saveAvailability(month: string, cells: Cell[], submit: boolean) {
  const me = await requireTrainer();
  if (!me.trainer_id) return { error: "Your login isn't linked to a trainer profile yet." };
  if (!isMonth(month)) return { error: "Invalid month." };
  if (month < todayISO().slice(0, 7)) return { error: "Past months can't be changed." };
  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  if (!Array.isArray(cells) || cells.length > 62) return { error: "Invalid availability." };
  // Rebuild every cell from known fields only: the arguments come straight from the browser.
  const clean: Cell[] = [];
  for (const c of cells) {
    if (!c || typeof c.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(c.date) || (c.slot !== "morning" && c.slot !== "evening")) return { error: "Invalid availability." };
    if (c.date < start || c.date > end) return { error: "Dates must be inside the selected month." };
    clean.push({ date: c.date, slot: c.slot });
  }
  cells = [...new Map(clean.map((c) => [`${c.date}|${c.slot}`, c])).values()];

  const { data, error: readError } = await db().from("availability").select("id, date, slot").eq("trainer_id", me.trainer_id).gte("date", start).lte("date", end);
  if (readError) return { error: "Couldn't load your current availability. Please try again." };
  const current = (data ?? []) as (Cell & { id: string })[];
  const key = (c: Cell) => `${c.date}|${c.slot}`;
  const wanted = new Set(cells.map(key));
  const have = new Set(current.map(key));

  // Add first, then remove: a failed insert then leaves the old availability untouched.
  const add = cells.filter((c) => !have.has(key(c))).map((c) => ({ trainer_id: me.trainer_id, date: c.date, slot: c.slot }));
  if (add.length) {
    const { error } = await db().from("availability").insert(add);
    if (error) return { error: friendlyError(error.message) };
  }
  const blocked: string[] = [];
  for (const c of current.filter((c) => !wanted.has(key(c)))) {
    const { error } = await db().from("availability").delete().eq("id", c.id);
    if (error) blocked.push(`${fmtDate(c.date, { day: "numeric", month: "short" })} (${c.slot})`);
  }
  if (submit) {
    const { error } = await db().from("availability_months").upsert({ trainer_id: me.trainer_id, month: start, submitted_at: new Date().toISOString() });
    if (error) return { error: friendlyError(error.message) };
    await audit(me.id, "availability_submitted", null, { month, slots: cells.length });
    const label = new Date(start).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    await notify(await usersWithRoles("admin"), {
      title: `${me.full_name} confirmed availability for ${label}`,
      body: `${cells.length} slots available.`,
      link: `/trainers/${me.trainer_id}`,
    });
  }
  revalidatePath("/me/availability");
  if (blocked.length) return { error: `You are already booked for this day: ${blocked.join(", ")}. Those slots were kept.` };
  return { ok: submit ? "Availability saved and confirmed for the month." : "Availability saved." };
}
