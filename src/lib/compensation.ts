// Trainer compensation is entered by hand by Training Excellence. This only checks that what was typed is usable
// and adds up the summary cards; amounts are never calculated from hours, rates, tiers or scores.
import { isUuid } from "./format";

export const COMPENSATION_STATUSES = ["pending", "approved", "paid"] as const;
export type CompensationStatus = (typeof COMPENSATION_STATUSES)[number];
export const COMPENSATION_STATUS_LABEL: Record<CompensationStatus, string> = { pending: "Pending", approved: "Approved", paid: "Paid" };

export type CompensationLine = {
  id: string;
  trainer_id: string;
  booking_id: string | null;
  training_date: string;
  training: string;
  hours: number;
  rate: number;
  amount: number;
  status: CompensationStatus;
  payment_date: string | null;
};
// What Training Excellence chooses and types. The training's name and date come from the chosen booking.
export type CompensationInput = Omit<CompensationLine, "id" | "training" | "training_date"> & { booking_id: string };

export const COMPENSATION_COLUMNS = "id, trainer_id, booking_id, training_date, training, hours, rate, amount, status, payment_date";

// A training can be chosen while it is assigned to the trainer: waiting for their answer, or confirmed.
export const ASSIGNED_STATUSES = ["awaiting_trainer", "confirmed"];
export const isAssignedTo = (b: { trainer_id: string | null; status: string }, trainerId: string) => b.trainer_id === trainerId && ASSIGNED_STATUSES.includes(b.status);

// "Cairo Logistics Co., AI Strategy Workshop, Day 1". Only multi-day trainings have a batch, so only they show the day.
export function trainingLabel(b: { program_name: string; day_number: number; batch_id: string | null; deals?: { company_name: string | null } | null }) {
  return [b.deals?.company_name?.trim(), b.program_name, b.batch_id ? `Day ${b.day_number}` : null].filter(Boolean).join(", ");
}

const MAX_NUMBER = 1_000_000_000;

function isDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function toNumber(s: string) {
  const clean = s.replace(/,/g, "").trim();
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 && n <= MAX_NUMBER ? n : null;
}

export function parseCompensation(input: Record<keyof CompensationInput, string>): { error: string } | { row: CompensationInput } {
  if (!isUuid(input.trainer_id)) return { error: "Choose a trainer." };
  if (!isUuid(input.booking_id)) return { error: "Choose a training." };
  const hours = toNumber(input.hours);
  if (hours === null) return { error: "Enter the hours as a number." };
  const rate = toNumber(input.rate);
  if (rate === null) return { error: "Enter the rate as a number." };
  const amount = toNumber(input.amount);
  if (amount === null) return { error: "Enter the amount as a number." };
  if (!(COMPENSATION_STATUSES as readonly string[]).includes(input.status)) return { error: "Choose a status." };
  const paymentDate = input.payment_date.trim();
  if (paymentDate && !isDate(paymentDate)) return { error: "Enter a valid payment date." };
  return {
    row: {
      trainer_id: input.trainer_id,
      booking_id: input.booking_id,
      hours,
      rate,
      amount,
      status: input.status as CompensationStatus,
      payment_date: paymentDate || null,
    },
  };
}

// The three cards at the top of the page. `month` is YYYY-MM.
export function summarizeCompensation(lines: Pick<CompensationLine, "training_date" | "hours" | "amount" | "status" | "payment_date">[], month: string) {
  const total = (status: CompensationStatus) => lines.filter((l) => l.status === status).reduce((sum, l) => sum + Number(l.amount), 0);
  const inMonth = lines.filter((l) => l.training_date.startsWith(`${month}-`));
  const dates = lines.filter((l) => l.status === "approved" && l.payment_date).map((l) => l.payment_date as string).sort();
  return {
    nextPayment: total("approved"),
    nextPaymentDate: dates[0] ?? null,
    waiting: total("pending"),
    hours: inMonth.reduce((sum, l) => sum + Number(l.hours), 0),
    days: inMonth.length,
  };
}

export const egp = (n: number) => `EGP ${Number(n).toLocaleString("en-US")}`;
