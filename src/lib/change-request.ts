// Change requests: Growth asks Training Excellence to change a training (another trainer, another date, or to
// cancel it) and says why. Growth never changes the trainer itself. Pure rules, tested in
// tests/change-request.test.ts.

export const CHANGE_KINDS = ["trainer", "date", "cancel"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];
export const isChangeKind = (v: unknown): v is ChangeKind => typeof v === "string" && (CHANGE_KINDS as readonly string[]).includes(v);

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  trainer: "A different trainer",
  date: "A different date or time",
  cancel: "Cancel the training",
};
// "<Growth person> asked for …"
export const CHANGE_KIND_ASK: Record<ChangeKind, string> = {
  trainer: "a different trainer",
  date: "a different date or time",
  cancel: "the training to be cancelled",
};

export type ChangeStatus = "open" | "done" | "declined" | "withdrawn";
export const CHANGE_STATUS_LABEL: Record<ChangeStatus, string> = { open: "Waiting for Training Excellence", done: "Done", declined: "Declined", withdrawn: "Withdrawn" };

export const MIN_REASON_CHARS = 10;
export const MAX_REASON_CHARS = 2000;

const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "");

// What Growth typed: the kind of change and a reason Training Excellence can act on.
export function readChangeRequest(input: { kind?: unknown; reason?: unknown }): { kind: ChangeKind; reason: string } | { error: string } {
  if (!isChangeKind(input.kind)) return { error: "Choose what you want changed." };
  const reason = clean(input.reason);
  if (reason.length < MIN_REASON_CHARS) return { error: "Write the reason, so Training Excellence can act on it (a sentence is enough)." };
  if (reason.length > MAX_REASON_CHARS) return { error: `Keep the reason under ${MAX_REASON_CHARS.toLocaleString("en-US")} characters.` };
  return { kind: input.kind, reason };
}

// Training Excellence's answer. Declining needs a note, so Growth knows why.
export function readResolution(input: { outcome?: unknown; note?: unknown }): { outcome: "done" | "declined"; note: string | null } | { error: string } {
  if (input.outcome !== "done" && input.outcome !== "declined") return { error: "Choose how to answer the request." };
  const note = clean(input.note);
  if (input.outcome === "declined" && note.length < MIN_REASON_CHARS) return { error: "Write a short note for Growth on why it stays as it is." };
  if (note.length > MAX_REASON_CHARS) return { error: `Keep the note under ${MAX_REASON_CHARS.toLocaleString("en-US")} characters.` };
  return { outcome: input.outcome, note: note || null };
}

export type RequestDay = { date: string; status: string; trainer_id: string | null; finished_at: string | null };

// The days a change can still touch: not cancelled, not delivered and not gone by.
export const openDays = <T extends RequestDay>(days: T[], today: string) =>
  days.filter((d) => ["needs_trainer", "pending_approval", "awaiting_trainer", "confirmed"].includes(d.status) && !d.finished_at && d.date >= today);

// Whether a request of this kind still makes sense for a training. A different trainer needs a day that has
// one; a new date or a cancellation needs a day still to come. Once this is false, an open request is closed
// on its own (the trainer declined or was replaced, or the training was cancelled or delivered).
export function stillApplies(kind: ChangeKind, days: RequestDay[], today: string) {
  const open = openDays(days, today);
  return kind === "trainer" ? open.some((d) => d.trainer_id) : open.length > 0;
}

// The kinds Growth may ask for on this training now. While Growth can still edit or cancel the days itself
// (before the trainer confirms), only the trainer needs a request.
export function requestableKinds(days: RequestDay[], today: string, canChangeItself: boolean): ChangeKind[] {
  return CHANGE_KINDS.filter((k) => stillApplies(k, days, today) && (k === "trainer" || !canChangeItself));
}

// Why Growth can't send this request; null when it can. One request is open per training at a time.
export function requestProblem(kind: ChangeKind, days: RequestDay[], today: string, hasOpenRequest: boolean) {
  if (hasOpenRequest) return "A change request is already waiting for Training Excellence on this training. Withdraw it first to send another.";
  if (stillApplies(kind, days, today)) return null;
  return kind === "trainer" ? "No upcoming day of this training has a trainer to change." : "No upcoming day of this training is left to change.";
}
