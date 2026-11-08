// Rules for the Training Excellence dashboard: how days become trainings, and where each training stands.

import { describe, expect, it } from "vitest";
import { buildTrainings, confirmationLabel, contentOpen, contentState, cycleStage, isDeclined, needsAttention, type CycleDay, type CycleDeal, type Stage } from "@/lib/cycle";
import { checkAudioFile, isAudioPath } from "@/lib/files";

const TODAY = "2026-11-10";
const LATER = "2026-12-01";
const PAST = "2026-11-01";
const DONE = "2026-11-01T18:00:00Z";

let seq = 0;
function day(over: Partial<CycleDay> = {}): CycleDay {
  seq += 1;
  return {
    id: `b${seq}`,
    deal_id: null,
    batch_id: null,
    program_name: "AI in HR",
    day_number: 1,
    date: LATER,
    start_time: "10:00:00",
    end_time: "15:00:00",
    status: "confirmed",
    trainer_id: "t1",
    industry: { name: "Fintech" },
    created_by: "u1",
    created_at: "2026-10-01T10:00:00Z",
    trainer_comment: null,
    trainer_responded_at: null,
    finished_at: null,
    brief_submitted_at: null,
    trainers: { full_name: "Amr" },
    ...over,
  };
}
const deal = (over: Partial<CycleDeal> = {}): CycleDeal => ({ id: "d1", company_name: "Aman", content_guide: null, content_submitted_at: "2026-10-05T10:00:00Z", created_at: "2026-10-02T10:00:00Z", ...over });
const build = (days: CycleDay[], over: Partial<Parameters<typeof buildTrainings>[0]> = {}) =>
  buildTrainings({ days, deals: [], contentFileDealIds: [], feedback: [], audioBookingIds: [], names: new Map([["u1", "Sara"]]), today: TODAY, ...over });

describe("grouping", () => {
  it("one row per deal, even when its days have different batches", () => {
    const rows = build([day({ deal_id: "d1", batch_id: "x", day_number: 1 }), day({ deal_id: "d1", batch_id: "y", day_number: 2 })], { deals: [deal()] });
    expect(rows).toHaveLength(1);
    expect(rows[0].live).toBe(2);
    expect(rows[0].company).toBe("Aman");
  });
  it("older days with no deal group by batch, and single bookings stand alone", () => {
    const rows = build([day({ batch_id: "x" }), day({ batch_id: "x", day_number: 2 }), day(), day()]);
    expect(rows.map((r) => r.live).sort()).toEqual([1, 1, 2]);
  });
  it("older bookings have no company and no content step", () => {
    const [row] = build([day()]);
    expect(row.company).toBeNull();
    expect(row.content).toBe("none");
    expect(row.stage).toBe("scheduled");
  });
  it("shows the Growth lead, and the deal's date when there is one", () => {
    const [row] = build([day({ deal_id: "d1" })], { deals: [deal()] });
    expect(row.requestedByName).toBe("Sara");
    expect(row.requestedAt).toBe("2026-10-02T10:00:00Z");
  });
  it("an unknown requester has no name instead of failing", () => {
    expect(build([day({ created_by: "gone" })])[0].requestedByName).toBeNull();
    expect(build([day({ created_by: null })])[0].requestedByName).toBeNull();
  });
});

describe("counts", () => {
  it("cancelled days stay listed but are left out of the counts and the link", () => {
    const cancelled = day({ batch_id: "x", day_number: 1, status: "cancelled", finished_at: DONE, brief_submitted_at: DONE });
    const kept = day({ batch_id: "x", day_number: 2, status: "awaiting_trainer" });
    const [row] = build([cancelled, kept], { audioBookingIds: [cancelled.id] });
    expect(row.days).toHaveLength(2);
    expect(row.live).toBe(1);
    expect(row.confirmed).toBe(0);
    expect(row.finished).toBe(0);
    expect(row.briefs).toBe(0);
    expect(row.audios).toBe(0);
    expect(row.linkId).toBe(kept.id);
  });
  it("a cancelled day doesn't change the status", () => {
    const rows = build([day({ batch_id: "x", status: "cancelled", trainer_id: null }), day({ batch_id: "x" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].stage).toBe("scheduled");
  });
  it("adds up confirmed days, delivered days, briefs, audio and distinct trainers", () => {
    const a = day({ batch_id: "x", day_number: 1, date: PAST, finished_at: DONE, brief_submitted_at: DONE });
    const b = day({ batch_id: "x", day_number: 2, trainer_id: "t2", trainers: { full_name: "Mona" } });
    const c = day({ batch_id: "x", day_number: 3, status: "awaiting_trainer" });
    const [row] = build([c, a, b], { audioBookingIds: [a.id] });
    expect(row.confirmed).toBe(2);
    expect(row.finished).toBe(1);
    expect(row.briefs).toBe(1);
    expect(row.audios).toBe(1);
    expect(row.trainers.map((t) => t.name)).toEqual(["Amr", "Mona"]);
    expect(row.days.map((d) => d.day_number)).toEqual([1, 2, 3]);
    expect(row.nextDate).toBe(LATER);
    expect(row.started).toBe(true);
  });
});

describe("feedback score", () => {
  it("is the NPS across every day of the training", () => {
    const a = day({ batch_id: "x", date: PAST });
    const b = day({ batch_id: "x", day_number: 2, date: PAST });
    const [row] = build([a, b], { feedback: [{ booking_id: a.id, recommend: 10 }, { booking_id: b.id, recommend: 9 }, { booking_id: b.id, recommend: 3 }, { booking_id: "someone-else", recommend: 0 }] });
    expect(row.responses).toBe(3);
    expect(row.score).toBe(33);
  });
  it("is empty with no responses, and with responses that gave no score", () => {
    expect(build([day()])[0]).toMatchObject({ responses: 0, score: null });
    const d = day();
    expect(build([d], { feedback: [{ booking_id: d.id, recommend: null }] })[0]).toMatchObject({ responses: 1, score: null });
  });
});

describe("content", () => {
  const empty = { content_guide: null, content_submitted_at: null };
  it("no deal has no content step", () => expect(contentState(null, false)).toBe("none"));
  it("nothing saved yet is not added", () => {
    expect(contentState(empty, false)).toBe("needs_content");
    expect(contentState({ ...empty, content_guide: "   " }, false)).toBe("needs_content");
  });
  it("a saved guide or a file is in progress", () => {
    expect(contentState({ ...empty, content_guide: "Draft" }, false)).toBe("in_progress");
    expect(contentState(empty, true)).toBe("in_progress");
  });
  it("submitted wins over everything", () => expect(contentState({ content_guide: "x", content_submitted_at: "2026-10-05T10:00:00Z" }, true)).toBe("submitted"));
  it("reads uploaded files from the deal", () => {
    const [row] = build([day({ deal_id: "d1" })], { deals: [deal({ content_submitted_at: null })], contentFileDealIds: ["d1"] });
    expect(row.content).toBe("in_progress");
  });
  it("is only still expected before any day has gone by", () => {
    expect(contentOpen("needs_content", [{ date: LATER }], TODAY)).toBe(true);
    expect(contentOpen("in_progress", [{ date: TODAY }], TODAY)).toBe(true);
    expect(contentOpen("needs_content", [{ date: PAST }, { date: LATER }], TODAY)).toBe(false);
    expect(contentOpen("submitted", [{ date: LATER }], TODAY)).toBe(false);
    expect(contentOpen("none", [{ date: LATER }], TODAY)).toBe(false);
    expect(contentOpen("needs_content", [], TODAY)).toBe(false);
  });
});

describe("training status", () => {
  const d = (over: Partial<CycleDay> = {}) => day(over);
  it("cancelled when no day is live", () => {
    expect(cycleStage([], TODAY)).toBe("cancelled");
    expect(build([d({ status: "cancelled" })])[0].stage).toBe("cancelled");
  });
  it("needs a trainer beats everything else, and that is where a reassign lands", () => {
    expect(cycleStage([d({ trainer_id: null, status: "needs_trainer" }), d({ status: "awaiting_trainer" }), d({ finished_at: DONE })], TODAY)).toBe("needs_trainer");
  });
  it("waiting on trainer beats the dates", () => {
    expect(cycleStage([d({ status: "awaiting_trainer" }), d()], TODAY)).toBe("waiting_trainer");
    expect(cycleStage([d({ status: "pending_approval" })], TODAY)).toBe("waiting_trainer");
    expect(cycleStage([d({ date: PAST, status: "awaiting_trainer" })], TODAY)).toBe("waiting_trainer");
  });
  it("scheduled when confirmed and nothing has started", () => expect(cycleStage([d()], TODAY)).toBe("scheduled"));
  it("in delivery while it's running, including today", () => {
    expect(cycleStage([d({ date: PAST }), d()], TODAY)).toBe("in_delivery");
    expect(cycleStage([d({ date: TODAY })], TODAY)).toBe("in_delivery");
    expect(cycleStage([d({ date: PAST, finished_at: DONE }), d()], TODAY)).toBe("in_delivery");
  });
  it("a report is due when the dates passed and the trainer hasn't marked it delivered", () => {
    expect(cycleStage([d({ date: PAST })], TODAY)).toBe("report_due");
    expect(cycleStage([d({ date: PAST, finished_at: DONE }), d({ date: PAST })], TODAY)).toBe("report_due");
  });
  it("delivered only when the trainer marked every live day", () => {
    expect(cycleStage([d({ date: PAST, finished_at: DONE })], TODAY)).toBe("delivered");
    expect(cycleStage([d({ date: TODAY, finished_at: DONE })], TODAY)).toBe("delivered");
    expect(build([d({ batch_id: "x", date: PAST, finished_at: DONE }), d({ batch_id: "x", status: "cancelled" })])[0].stage).toBe("delivered");
  });
});

describe("trainer confirmation", () => {
  const declined = { status: "needs_trainer", trainer_id: null, trainer_responded_at: DONE };
  const row = (status: string, trainer_id: string | null = "t1") => ({ status, trainer_id, trainer_responded_at: null });
  it("reads across the days", () => {
    expect(confirmationLabel([])).toBe("—");
    expect(confirmationLabel([row("confirmed"), row("confirmed")])).toBe("Confirmed");
    expect(confirmationLabel([row("confirmed"), row("awaiting_trainer")])).toBe("1 of 2 confirmed");
    expect(confirmationLabel([row("awaiting_trainer")])).toBe("Pending");
    expect(confirmationLabel([row("needs_trainer", null)])).toBe("No trainer yet");
  });
  it("a decline stands out until someone is reassigned", () => {
    expect(confirmationLabel([row("confirmed"), declined])).toBe("Declined");
    expect(isDeclined(declined)).toBe(true);
    expect(isDeclined({ ...declined, trainer_responded_at: null })).toBe(false);
    expect(isDeclined({ ...declined, status: "awaiting_trainer", trainer_id: "t1" })).toBe(false);
  });
});

describe("needs attention", () => {
  const IN_7 = "2026-11-17";
  const IN_8 = "2026-11-18";
  it("a declined day however far away it is", () => {
    expect(needsAttention([day({ status: "needs_trainer", trainer_id: null, trainer_responded_at: DONE, date: LATER })], "needs_trainer", "submitted", TODAY)).toBe(true);
  });
  it("the 7-day boundary is inclusive for a missing trainer, confirmation and content", () => {
    for (const [stage, content, over] of [
      ["needs_trainer", "submitted", { status: "needs_trainer", trainer_id: null }],
      ["waiting_trainer", "submitted", { status: "awaiting_trainer" }],
      ["scheduled", "needs_content", {}],
      ["scheduled", "in_progress", {}],
    ] as const) {
      expect(needsAttention([day({ ...over, date: IN_7 })], stage, content, TODAY)).toBe(true);
      expect(needsAttention([day({ ...over, date: IN_8 })], stage, content, TODAY)).toBe(false);
    }
  });
  it("crosses month and year ends", () => {
    expect(needsAttention([day({ status: "awaiting_trainer", date: "2027-01-02" })], "waiting_trainer", "submitted", "2026-12-28")).toBe(true);
    expect(needsAttention([day({ status: "awaiting_trainer", date: "2027-01-05" })], "waiting_trainer", "submitted", "2026-12-28")).toBe(false);
  });
  it("looks at the open day, not the training's first day", () => {
    expect(needsAttention([day({ date: PAST }), day({ date: LATER, status: "awaiting_trainer" })], "waiting_trainer", "submitted", TODAY)).toBe(false);
  });
  it("flags an open day that already went by", () => expect(needsAttention([day({ date: PAST, status: "awaiting_trainer" })], "waiting_trainer", "submitted", TODAY)).toBe(true));
  it("settled trainings never need attention", () => {
    for (const stage of ["scheduled", "in_delivery", "report_due", "delivered", "cancelled"] as Stage[]) expect(needsAttention([day({ date: TODAY })], stage, "submitted", TODAY)).toBe(false);
  });
});

describe("order and the Active / Past filter", () => {
  it("attention first, then nearest date, then finished ones newest first", () => {
    const soon = day({ date: "2026-11-20", program_name: "soon" });
    const urgent = day({ date: "2026-11-30", program_name: "urgent", status: "needs_trainer", trainer_id: null, trainer_responded_at: DONE });
    const far = day({ date: "2026-12-20", program_name: "far" });
    const oldest = day({ date: "2026-10-01", program_name: "oldest" });
    const recent = day({ date: "2026-11-05", program_name: "recent" });
    expect(build([recent, far, oldest, soon, urgent]).map((r) => r.program)).toEqual(["urgent", "soon", "far", "recent", "oldest"]);
  });
  it("every training has one status, so the status counts add up to the total", () => {
    const rows = build([day(), day({ status: "awaiting_trainer" }), day({ status: "needs_trainer", trainer_id: null }), day({ date: PAST }), day({ status: "cancelled" })]);
    expect(new Set(rows.map((r) => r.stage)).size).toBe(5);
  });
});

describe("date, company and industry", () => {
  it("shows the first and last live day, and the industry", () => {
    const a = day({ batch_id: "x", day_number: 1, date: "2026-11-20", start_time: "18:00:00" });
    const b = day({ batch_id: "x", day_number: 2, date: "2026-11-15" });
    const [row] = build([a, b, day({ batch_id: "x", day_number: 3, date: "2026-11-01", status: "cancelled" })]);
    expect(row.firstDate).toBe("2026-11-15");
    expect(row.firstDay.id).toBe(b.id);
    expect(row.industry).toBe("Fintech");
  });
  it("a fully cancelled training keeps the dates it was booked for", () => {
    expect(build([day({ status: "cancelled", date: "2026-11-01" })])[0].firstDate).toBe("2026-11-01");
  });
  it("a booking with no industry stays empty", () => expect(build([day({ industry: null })])[0].industry).toBeNull());
});

describe("training audio", () => {
  it("accepts audio files only", () => {
    for (const ok of ["talk.mp3", "TALK.M4A", "talk.wav"]) expect(checkAudioFile(ok)).toBeNull();
    for (const bad of ["talk.pdf", "talk.exe", "talk.mp4", ""]) expect(checkAudioFile(bad)).toMatch(/MP3/);
  });
  it("is told apart from brief documents by its stored name", () => {
    expect(isAudioPath("b1/audio-1700000000-talk.mp3")).toBe(true);
    expect(isAudioPath("b1/brief-1700000000-audio-notes.pdf")).toBe(false);
  });
});

describe("dashboard filters", () => {
  it("groups every confirmation label into a filter", async () => {
    const { confirmationFilter } = await import("../src/lib/cycle");
    expect(confirmationFilter("Pending")).toBe("pending");
    expect(confirmationFilter("Confirmed")).toBe("confirmed");
    expect(confirmationFilter("2 of 3 confirmed")).toBe("partly");
    expect(confirmationFilter("Declined")).toBe("declined");
    expect(confirmationFilter("No trainer yet")).toBe("no_trainer");
    expect(confirmationFilter("—")).toBeNull();
  });
});
