// Compensation is entered by hand: these only check what's typed is usable and that the cards add up.

import { describe, expect, it } from "vitest";
import { egp, parseCompensation, summarizeCompensation } from "@/lib/compensation";

const TRAINER = "11111111-1111-4111-8111-111111111111";
const input = (over: Partial<Parameters<typeof parseCompensation>[0]> = {}) => ({
  trainer_id: TRAINER,
  training_date: "2026-11-11",
  training: "  Cairo Logistics Co., AI Strategy Workshop ",
  hours: "4",
  rate: "700",
  amount: "2,800",
  status: "approved",
  payment_date: "2026-11-30",
  ...over,
});

describe("parseCompensation", () => {
  it("keeps only the known fields, trimmed and as numbers", () => {
    const extra = { ...input(), created_by: "someone", id: "x" };
    expect(parseCompensation(extra)).toEqual({
      row: { trainer_id: TRAINER, training_date: "2026-11-11", training: "Cairo Logistics Co., AI Strategy Workshop", hours: 4, rate: 700, amount: 2800, status: "approved", payment_date: "2026-11-30" },
    });
  });

  it("never recalculates: the amount stays what was typed", () => {
    const r = parseCompensation(input({ hours: "4", rate: "700", amount: "5000" }));
    expect("row" in r && r.row.amount).toBe(5000);
  });

  it("allows an empty payment date", () => {
    const r = parseCompensation(input({ payment_date: " " }));
    expect("row" in r && r.row.payment_date).toBeNull();
  });

  it.each([
    [{ trainer_id: "nope" }, "Choose a trainer."],
    [{ training_date: "2026-02-31" }, "Enter the training date."],
    [{ training: "   " }, "Enter the training."],
    [{ training: "x".repeat(201) }, "Keep the training name under 200 characters."],
    [{ hours: "six" }, "Enter the hours as a number."],
    [{ rate: "-1" }, "Enter the rate as a number."],
    [{ amount: "" }, "Enter the amount as a number."],
    [{ amount: "Infinity" }, "Enter the amount as a number."],
    [{ status: "held" }, "Choose a status."],
    [{ payment_date: "soon" }, "Enter a valid payment date."],
  ])("rejects %j", (over, error) => {
    expect(parseCompensation(input(over))).toEqual({ error });
  });
});

describe("summarizeCompensation", () => {
  const line = (training_date: string, hours: number, amount: number, status: "pending" | "approved" | "paid", payment_date: string | null = null) => ({ training_date, hours, amount, status, payment_date });

  it("matches the mockup's cards", () => {
    const lines = [line("2026-11-04", 6, 4200, "paid"), line("2026-11-11", 4, 2800, "approved", "2026-11-30"), line("2026-11-18", 6, 4200, "pending")];
    expect(summarizeCompensation(lines, "2026-11")).toEqual({ nextPayment: 2800, nextPaymentDate: "2026-11-30", waiting: 4200, hours: 16, days: 3 });
  });

  it("uses the earliest approved payment date and ignores other months' hours", () => {
    const lines = [line("2026-10-31", 6, 100, "approved", "2026-12-15"), line("2026-11-01", 2, 100, "approved", "2026-11-30"), line("2026-11-02", 1, 100, "paid", "2026-11-01")];
    const s = summarizeCompensation(lines, "2026-11");
    expect(s.nextPaymentDate).toBe("2026-11-30");
    expect(s.hours).toBe(3);
    expect(s.days).toBe(2);
  });

  it("is all zeros with no lines", () => {
    expect(summarizeCompensation([], "2026-11")).toEqual({ nextPayment: 0, nextPaymentDate: null, waiting: 0, hours: 0, days: 0 });
  });
});

it("formats money like the mockup", () => {
  expect(egp(2800)).toBe("EGP 2,800");
});
