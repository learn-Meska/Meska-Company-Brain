"use server";

import { revalidatePath } from "next/cache";
import { requireTrainer } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { audit, notify, usersWithRoles } from "@/lib/notify";
import { friendlyError, fmtDate } from "@/lib/format";

type Cell = { date: string; slot: "morning" | "evening" };

// Replaces the trainer's availability for one month with the given set of slots.
export async function saveAvailability(month: string, cells: Cell[], submit: boolean) {
  const me = await requireTrainer();
  if (!me.trainer_id) return { error: "Your login isn't linked to a trainer profile yet." };
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Invalid month." };
  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  if (cells.some((c) => c.date < start || c.date > end)) return { error: "Dates must be inside the selected month." };

  const { data } = await db().from("availability").select("id, date, slot").eq("trainer_id", me.trainer_id).gte("date", start).lte("date", end);
  const current = (data ?? []) as (Cell & { id: string })[];
  const key = (c: Cell) => `${c.date}|${c.slot}`;
  const wanted = new Set(cells.map(key));
  const have = new Set(current.map(key));

  const blocked: string[] = [];
  for (const c of current.filter((c) => !wanted.has(key(c)))) {
    const { error } = await db().from("availability").delete().eq("id", c.id);
    if (error) blocked.push(`${fmtDate(c.date, { day: "numeric", month: "short" })} (${c.slot})`);
  }
  const add = cells.filter((c) => !have.has(key(c))).map((c) => ({ trainer_id: me.trainer_id, ...c }));
  if (add.length) {
    const { error } = await db().from("availability").insert(add);
    if (error) return { error: friendlyError(error.message) };
  }
  if (submit) {
    await db().from("availability_months").upsert({ trainer_id: me.trainer_id, month: start, submitted_at: new Date().toISOString() });
    await audit(me.id, "availability_submitted", null, { month, slots: cells.length });
    const label = new Date(start).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
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
