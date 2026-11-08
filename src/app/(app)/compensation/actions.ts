"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccess } from "@/lib/auth";
import { egp, isAssignedTo, parseCompensation, trainingLabel, type CompensationInput } from "@/lib/compensation";
import { isUuid } from "@/lib/format";
import { audit, notify, userById } from "@/lib/notify";
import { db } from "@/lib/supabase";

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

function readLine(fd: FormData) {
  return parseCompensation({
    trainer_id: str(fd, "trainer_id"),
    booking_id: str(fd, "booking_id"),
    hours: str(fd, "hours"),
    rate: str(fd, "rate"),
    amount: str(fd, "amount"),
    status: str(fd, "status"),
    payment_date: str(fd, "payment_date"),
  });
}

function failed(where: string, error: { message: string }) {
  console.error(`[${where}]`, error.message);
  return { error: "That couldn't be saved. Please try again." };
}

function refresh() {
  revalidatePath("/compensation");
  revalidatePath("/me/compensation");
}

// In-app only: a trainer who hasn't accepted their invite has no account, and sees the line once they sign in.
async function tellTrainer(trainerId: string, title: string, training: string, amount: number) {
  const { data } = await db().from("trainers").select("user_id").eq("id", trainerId).maybeSingle();
  const recipient = await userById((data as { user_id: string | null } | null)?.user_id);
  await notify([recipient], { title, body: `${training}: ${egp(amount)}`, link: "/me/compensation" });
}

// The chosen training must be assigned to the chosen trainer. Its name and date come from the booking, never the browser.
async function assignedTraining(row: CompensationInput) {
  const { data } = await db().from("bookings").select("trainer_id, status, date, program_name, day_number, batch_id, deals(company_name)").eq("id", row.booking_id).maybeSingle();
  const b = data as unknown as ({ trainer_id: string | null; status: string; date: string } & Parameters<typeof trainingLabel>[0]) | null;
  if (!b || !isAssignedTo(b, row.trainer_id)) return null;
  return { training: trainingLabel(b), training_date: b.date };
}

const backTo = (fd: FormData) => {
  const trainer = str(fd, "filter");
  return isUuid(trainer) ? `/compensation?trainer=${trainer}` : "/compensation";
};

export async function addCompensation(fd: FormData) {
  const me = await requireAccess("te.compensation");
  const parsed = readLine(fd);
  if ("error" in parsed) return parsed;
  const { row } = parsed;
  const chosen = await assignedTraining(row);
  if (!chosen) return { error: "That training isn't assigned to this trainer any more. Choose another one." };
  const { data, error } = await db().from("compensation_lines").insert({ ...row, ...chosen, created_by: me.id }).select("id").single();
  if (error) return failed("addCompensation", error);
  await audit(me.id, "compensation_added", null, { id: (data as { id: string }).id, trainer_id: row.trainer_id, booking_id: row.booking_id, training: chosen.training, amount: row.amount, status: row.status });
  await tellTrainer(row.trainer_id, row.status === "paid" ? "Payment marked paid" : "Compensation added", chosen.training, row.amount);
  refresh();
  return { ok: "Line added." };
}

export async function updateCompensation(fd: FormData) {
  const me = await requireAccess("te.compensation");
  const id = str(fd, "id");
  if (!isUuid(id)) return { error: "Line not found." };
  const parsed = readLine(fd);
  if ("error" in parsed) return parsed;
  const { row } = parsed;
  const { data: curData } = await db().from("compensation_lines").select("status, trainer_id, booking_id, training, training_date").eq("id", id).maybeSingle();
  const cur = curData as { status: string; trainer_id: string; booking_id: string | null; training: string; training_date: string } | null;
  if (!cur) return { error: "This line was deleted meanwhile." };
  // A line keeps its training when only the amounts change, even if the day was reassigned or cancelled since.
  const same = cur.booking_id === row.booking_id && cur.trainer_id === row.trainer_id;
  const chosen = same ? { training: cur.training, training_date: cur.training_date } : await assignedTraining(row);
  if (!chosen) return { error: "That training isn't assigned to this trainer any more. Choose another one." };
  const { data, error } = await db().from("compensation_lines").update({ ...row, ...chosen, updated_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) return failed("updateCompensation", error);
  if (!data?.length) return { error: "This line was deleted meanwhile." };
  await audit(me.id, "compensation_updated", null, { id, trainer_id: row.trainer_id, booking_id: row.booking_id, training: chosen.training, amount: row.amount, status: row.status });
  if (row.status === "paid" && cur.status !== "paid") await tellTrainer(row.trainer_id, "Payment marked paid", chosen.training, row.amount);
  refresh();
  redirect(backTo(fd));
}

export async function deleteCompensation(fd: FormData) {
  const me = await requireAccess("te.compensation");
  const id = str(fd, "id");
  if (!isUuid(id)) return { error: "Line not found." };
  const { data, error } = await db().from("compensation_lines").delete().eq("id", id).select("trainer_id, training, amount, status");
  if (error) return failed("deleteCompensation", error);
  if (!data?.length) return { error: "This line was deleted meanwhile." };
  await audit(me.id, "compensation_deleted", null, { id, ...(data[0] as Record<string, unknown>) });
  refresh();
  redirect(backTo(fd));
}
