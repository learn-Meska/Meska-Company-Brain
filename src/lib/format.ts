export const SLOT_LABEL: Record<string, string> = {
  morning: "Morning (9 AM – 5 PM)",
  evening: "Evening (6 PM – 11 PM)",
};

export const STATUS_LABEL: Record<string, string> = {
  needs_trainer: "Needs a trainer",
  pending_approval: "Pending approval",
  rejected: "Rejected",
  awaiting_trainer: "Pending trainer confirmation",
  confirmed: "Confirmed",
  declined: "Declined by trainer",
  cancelled: "Cancelled",
};

export const ACTIVE_STATUSES = ["needs_trainer", "pending_approval", "awaiting_trainer", "confirmed"];

// Must match slots_for() in the database
export function slotsFor(start: string, end: string): ("morning" | "evening")[] {
  const s = start.slice(0, 5);
  const e = end.slice(0, 5);
  const r: ("morning" | "evening")[] = [];
  if (s < "17:00" && e > "09:00") r.push("morning");
  if (s < "23:00" && e > "18:00") r.push("evening");
  return r;
}

export function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function fmtDate(d: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" }) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", opts);
}

export function fmtDateTime(ts: string) {
  return new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

// Turns database errors raised by triggers into messages people can act on
export function friendlyError(msg: string | undefined) {
  if (!msg) return "Something went wrong.";
  if (msg.includes("slot_already_booked")) return "This trainer is already booked in that slot.";
  if (msg.includes("trainer_not_available")) return "The trainer hasn't marked themselves available for that slot.";
  if (msg.includes("time_outside_slots")) return "The time must fall within the Morning (9 AM – 5 PM) or Evening (6 PM – 11 PM) slot.";
  if (msg.includes("already booked for this day")) return "You are already booked for this day.";
  return msg;
}

export const AUDIT_LABEL: Record<string, string> = {
  booking_created: "Trainer booked",
  training_requested: "Training requested (Growth)",
  trainer_assigned: "Trainer assigned",
  booking_approved: "Booking approved",
  booking_rejected: "Booking rejected",
  booking_confirmed: "Trainer confirmed",
  booking_declined: "Trainer declined",
  booking_edited: "Booking edited",
  booking_cancelled: "Booking cancelled",
  material_uploaded: "Material uploaded",
  trainer_created: "Trainer profile created",
  trainer_invited: "Trainer invited",
  team_member_added: "Team member added",
  team_member_removed: "Team member removed",
  feedback_imported: "Feedback imported",
  availability_submitted: "Availability submitted",
  brief_submitted: "Training finished / brief submitted",
};

// Training start in Cairo time.
export function cairoStart(date: string, time: string) {
  const guess = new Date(`${date}T${time.slice(0, 5)}:00Z`);
  const local = new Date(guess.toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (local.getTime() - utc.getTime()));
}

// Trainers only learn the program (client) name 2 days before the training.
export const PROGRAM_REVEAL_HOURS = 48;
export function programVisible(b: { date: string; start_time: string }, now = Date.now()) {
  return now >= cairoStart(b.date, b.start_time).getTime() - PROGRAM_REVEAL_HOURS * 3_600_000;
}
export function trainerTitle(b: { program_name: string; day_number: number; date: string; start_time: string }) {
  return `${programVisible(b) ? b.program_name : "Meska AI training"} — Day ${b.day_number}`;
}

// Participant feedback form: open from the training's start until 6 hours after it ends (Cairo time).
export const FEEDBACK_HOURS_AFTER = 6;
export function feedbackWindow(b: { date: string; start_time: string; end_time: string }) {
  const opens = cairoStart(b.date, b.start_time);
  const closes = new Date(cairoStart(b.date, b.end_time).getTime() + FEEDBACK_HOURS_AFTER * 3_600_000);
  return { opens, closes };
}
export const isPast = (d: Date) => Date.now() > d.getTime();
export const isFuture = (d: Date) => Date.now() < d.getTime();
