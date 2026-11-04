// Rules for the Training Excellence dashboard: how days become trainings, and where each training stands.

import { describe, expect, it } from "vitest";
import { buildTrainings, contentState, cycleStage, isDeclined, matchesWhen, needsAttention, type CycleDay, type CycleDeal } from "@/lib/cycle";

const TODAY = "2026-11-10";
const LATER = "2026-12-01";
const PAST = "2026-11-01";

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
    status: "confirmed",
    trainer_id: "t1",
    created_by: "u1",
    created_at: "2026-10-01T10:00:00Z",
    trainer_comment: null,
    trainer_responded_at: null,
    finished_at: null,
    trainers: { full_name: "Amr" },
    ...over,
  };
}
const deal = (over: Partial<CycleDeal> = {}): CycleDeal => ({ id: "d1", company_name: "Aman", content_guide: null, content_submitted_at: "2026-10-05T10:00:00Z", created_at: "2026-10-02T10:00:00Z", ...over });
const build = (days: CycleDay[], over: Partial<Parameters<typeof buildTrainings>[0]> = {}) =>
  buildTrainings({ days, deals: [], contentFileDealIds: [], feedbackBookingIds: [], names: new Map([["u1", "Sara"]]), today: TODAY, ...over });

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
  it("older bookings have no company and no content step, and don't wait on content", () => {
    const [row] = build([day()]);
    expect(row.company).toBeNull();
    expect(row.content).toBe("none");
    expect(row.stage).toBe("ready");
  });
  it("shows who requested it, and the deal's date when there is one", () => {
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
    const cancelled = day({ batch_id: "x", day_number: 1, status: "cancelled", finished_at: "2026-11-02T10:00:00Z" });
    const kept = day({ batch_id: "x", day_number: 2, status: "awaiting_trainer" });
    const [row] = build([cancelled, kept]);
    expect(row.days).toHaveLength(2);
    expect(row.live).toBe(1);
    expect(row.confirmed).toBe(0);
    expect(row.finished).toBe(0);
    expect(row.linkId).toBe(kept.id);
  });
  it("a cancelled day doesn't change the stage", () => {
    const rows = build([day({ batch_id: "x", status: "cancelled", trainer_id: null }), day({ batch_id: "x" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].stage).toBe("ready");
  });
  it("adds up confirmed days, finished days, feedback and distinct trainers", () => {
    const a = day({ batch_id: "x", day_number: 1, date: PAST, finished_at: "2026-11-01T18:00:00Z" });
    const b = day({ batch_id: "x", day_number: 2, trainer_id: "t2", trainers: { full_name: "Mona" } });
    const c = day({ batch_id: "x", day_number: 3, status: "awaiting_trainer" });
    const [row] = build([c, a, b], { feedbackBookingIds: [a.id, a.id, b.id, "someone-else"] });
    expect(row.confirmed).toBe(2);
    expect(row.finished).toBe(1);
    expect(row.feedback).toBe(3);
    expect(row.trainers.map((t) => t.name)).toEqual(["Amr", "Mona"]);
    expect(row.days.map((d) => d.day_number)).toEqual([1, 2, 3]);
    expect(row.nextDate).toBe(LATER);
    expect(row.started).toBe(true);
  });
});

describe("content", () => {
  const empty = { content_guide: null, content_submitted_at: null };
  it("no deal has no content step", () => expect(contentState(null, false)).toBe("none"));
  it("nothing saved yet needs content", () => {
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
});

describe("stage", () => {
  const d = (over: Partial<CycleDay> = {}) => day(over);
  it("cancelled when no day is live", () => expect(cycleStage([], "submitted", TODAY)).toBe("cancelled"));
  it("a training with only cancelled days is cancelled", () => expect(build([d({ status: "cancelled" })])[0].stage).toBe("cancelled"));
  it("needs a trainer beats everything else", () => {
    expect(cycleStage([d({ trainer_id: null, status: "needs_trainer" }), d({ status: "awaiting_trainer" })], "needs_content", TODAY)).toBe("needs_trainer");
  });
  it("waiting on trainer beats needs content", () => {
    expect(cycleStage([d({ status: "awaiting_trainer" }), d()], "needs_content", TODAY)).toBe("waiting_trainer");
    expect(cycleStage([d({ status: "pending_approval" })], "submitted", TODAY)).toBe("waiting_trainer");
  });
  it("needs content until it's submitted, draft or not", () => {
    expect(cycleStage([d()], "needs_content", TODAY)).toBe("needs_content");
    expect(cycleStage([d()], "in_progress", TODAY)).toBe("needs_content");
    expect(cycleStage([d({ date: TODAY })], "needs_content", TODAY)).toBe("needs_content");
  });
  it("ready when confirmed, content is in and nothing has started", () => {
    expect(cycleStage([d()], "submitted", TODAY)).toBe("ready");
    expect(cycleStage([d()], "none", TODAY)).toBe("ready");
  });
  it("in delivery while it's running, including today", () => {
    expect(cycleStage([d({ date: PAST }), d()], "submitted", TODAY)).toBe("in_delivery");
    expect(cycleStage([d({ date: TODAY })], "submitted", TODAY)).toBe("in_delivery");
    expect(cycleStage([d({ date: PAST }), d({ date: TODAY })], "submitted", TODAY)).toBe("in_delivery");
  });
  it("missing content doesn't block a training that already started", () => {
    expect(cycleStage([d({ date: PAST }), d()], "needs_content", TODAY)).toBe("in_delivery");
    expect(cycleStage([d({ date: PAST })], "needs_content", TODAY)).toBe("delivered");
  });
  it("delivered when every live day has passed", () => expect(cycleStage([d({ date: PAST })], "submitted", TODAY)).toBe("delivered"));
  it("a past day nobody confirmed is not called delivered", () => {
    expect(cycleStage([d({ date: PAST, status: "awaiting_trainer" })], "submitted", TODAY)).toBe("waiting_trainer");
    expect(cycleStage([d({ date: PAST, status: "needs_trainer", trainer_id: null })], "submitted", TODAY)).toBe("needs_trainer");
  });
});

describe("declined days", () => {
  const declined = { status: "needs_trainer", trainer_id: null, trainer_responded_at: "2026-11-02T10:00:00Z" };
  it("is a day back at needs_trainer with a response on it", () => expect(isDeclined(declined)).toBe(true));
  it("a day that never had a trainer isn't declined", () => expect(isDeclined({ ...declined, trainer_responded_at: null })).toBe(false));
  it("a reassigned day isn't declined", () => expect(isDeclined({ ...declined, status: "awaiting_trainer", trainer_id: "t1" })).toBe(false));
  it("needs attention however far away it is", () => expect(needsAttention([day({ ...declined, date: LATER })], "needs_trainer", TODAY)).toBe(true));
});

describe("needs attention", () => {
  const IN_7 = "2026-11-17";
  const IN_8 = "2026-11-18";
  it("the 7-day boundary is inclusive for every open step", () => {
    for (const [stage, over] of [
      ["needs_trainer", { status: "needs_trainer", trainer_id: null }],
      ["waiting_trainer", { status: "awaiting_trainer" }],
      ["needs_content", {}],
    ] as const) {
      expect(needsAttention([day({ ...over, date: IN_7 })], stage, TODAY)).toBe(true);
      expect(needsAttention([day({ ...over, date: IN_8 })], stage, TODAY)).toBe(false);
    }
  });
  it("crosses month and year ends", () => {
    expect(needsAttention([day({ status: "awaiting_trainer", date: "2027-01-02" })], "waiting_trainer", "2026-12-28")).toBe(true);
    expect(needsAttention([day({ status: "awaiting_trainer", date: "2027-01-05" })], "waiting_trainer", "2026-12-28")).toBe(false);
  });
  it("looks at the open day, not the training's first day", () => {
    const days = [day({ date: PAST }), day({ date: LATER, status: "awaiting_trainer" })];
    expect(needsAttention(days, "waiting_trainer", TODAY)).toBe(false);
  });
  it("flags an open day that already went by", () => expect(needsAttention([day({ date: PAST, status: "awaiting_trainer" })], "waiting_trainer", TODAY)).toBe(true));
  it("settled stages never need attention", () => {
    for (const stage of ["ready", "in_delivery", "delivered", "cancelled"] as const) expect(needsAttention([day({ date: TODAY })], stage, TODAY)).toBe(false);
  });
});

describe("order and the Active / Past filter", () => {
  it("attention first, then nearest date, then finished ones newest first", () => {
    const soon = day({ date: "2026-11-20", program_name: "soon" });
    const urgent = day({ date: "2026-11-30", program_name: "urgent", status: "needs_trainer", trainer_id: null, trainer_responded_at: "2026-11-02T10:00:00Z" });
    const far = day({ date: "2026-12-20", program_name: "far" });
    const oldest = day({ date: "2026-10-01", program_name: "oldest" });
    const recent = day({ date: "2026-11-05", program_name: "recent" });
    expect(build([recent, far, oldest, soon, urgent]).map((r) => r.program)).toEqual(["urgent", "soon", "far", "recent", "oldest"]);
  });
  it("delivered and cancelled are past, the rest are active, all has everything", () => {
    for (const stage of ["delivered", "cancelled"] as const) {
      expect(matchesWhen({ stage }, "past")).toBe(true);
      expect(matchesWhen({ stage }, "active")).toBe(false);
      expect(matchesWhen({ stage }, "all")).toBe(true);
    }
    for (const stage of ["needs_trainer", "waiting_trainer", "needs_content", "ready", "in_delivery"] as const) {
      expect(matchesWhen({ stage }, "active")).toBe(true);
      expect(matchesWhen({ stage }, "past")).toBe(false);
      expect(matchesWhen({ stage }, "all")).toBe(true);
    }
  });
});
