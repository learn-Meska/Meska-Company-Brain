"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { egp, parseCompensation, type CompensationRow } from "@/lib/compensation";
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
    training_date: str(fd, "training_date"),
    training: str(fd, "training"),
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
async function tellTrainer(trainerId: string, title: string, row: CompensationRow) {
  const { data } = await db().from("trainers").select("user_id").eq("id", trainerId).maybeSingle();
  const recipient = await userById((data as { user_id: string | null } | null)?.user_id);
  await notify([recipient], { title, body: `${row.training}: ${egp(row.amount)}`, link: "/me/compensation" });
}

async function trainerExists(id: string) {
  const { data } = await db().from("trainers").select("id").eq("id", id).maybeSingle();
  return !!data;
}

const backTo = (fd: FormData) => {
  const trainer = str(fd, "filter");
  return isUuid(trainer) ? `/compensation?trainer=${trainer}` : "/compensation";
};

export async function addCompensation(fd: FormData) {
  const me = await requireRole("approver", "admin");
  const parsed = readLine(fd);
  if ("error" in parsed) return parsed;
  const { row } = parsed;
  if (!(await trainerExists(row.trainer_id))) return { error: "Trainer not found." };
  const { data, error } = await db().from("compensation_lines").insert({ ...row, created_by: me.id }).select("id").single();
  if (error) return failed("addCompensation", error);
  await audit(me.id, "compensation_added", null, { id: (data as { id: string }).id, trainer_id: row.trainer_id, training: row.training, amount: row.amount, status: row.status });
  await tellTrainer(row.trainer_id, row.status === "paid" ? "Payment marked paid" : "Compensation added", row);
  refresh();
  return { ok: "Line added." };
}

export async function updateCompensation(fd: FormData) {
  const me = await requireRole("approver", "admin");
  const id = str(fd, "id");
  if (!isUuid(id)) return { error: "Line not found." };
  const parsed = readLine(fd);
  if ("error" in parsed) return parsed;
  const { row } = parsed;
  if (!(await trainerExists(row.trainer_id))) return { error: "Trainer not found." };
  const { data: cur } = await db().from("compensation_lines").select("status").eq("id", id).maybeSingle();
  if (!cur) return { error: "This line was deleted meanwhile." };
  const { data, error } = await db().from("compensation_lines").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) return failed("updateCompensation", error);
  if (!data?.length) return { error: "This line was deleted meanwhile." };
  await audit(me.id, "compensation_updated", null, { id, trainer_id: row.trainer_id, training: row.training, amount: row.amount, status: row.status });
  if (row.status === "paid" && (cur as { status: string }).status !== "paid") await tellTrainer(row.trainer_id, "Payment marked paid", row);
  refresh();
  redirect(backTo(fd));
}

export async function deleteCompensation(fd: FormData) {
  const me = await requireRole("approver", "admin");
  const id = str(fd, "id");
  if (!isUuid(id)) return { error: "Line not found." };
  const { data, error } = await db().from("compensation_lines").delete().eq("id", id).select("trainer_id, training, amount, status");
  if (error) return failed("deleteCompensation", error);
  if (!data?.length) return { error: "This line was deleted meanwhile." };
  await audit(me.id, "compensation_deleted", null, { id, ...(data[0] as Record<string, unknown>) });
  refresh();
  redirect(backTo(fd));
}
