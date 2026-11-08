import { describe, expect, it } from "vitest";
import { DEFAULT_FORM, formError, normalizeForm, readAnswers, summarizeQuestions, type FeedbackFormDef } from "../src/lib/feedback-form";

const form: FeedbackFormDef = {
  questions: [
    { id: "recommend", type: "nps", label: "Recommend?", required: true },
    { id: "pace", type: "rating", label: "Pace", required: true },
    { id: "best", type: "choice", label: "Best part", required: false, options: ["Demo", "Practice"] },
    { id: "told_objectives", type: "yes_no", label: "Told objectives?", required: true },
    { id: "reason", type: "text", label: "Why?", required: false },
  ],
};
const get = (v: Record<string, string>) => (name: string) => v[name] ?? null;

describe("feedback form", () => {
  it("falls back to the original form, and always keeps the recommend question first", () => {
    expect(normalizeForm(null)).toEqual(DEFAULT_FORM);
    const moved = normalizeForm({ questions: [{ id: "x", type: "text", label: "Hi", required: false }, { id: "abc", type: "nps", label: "Score", required: false }] });
    expect(moved.questions.map((q) => [q.id, q.type, q.required])).toEqual([["recommend", "nps", true], ["x", "text", false]]);
    // a choice without two options is dropped; a missing recommend question is added back
    expect(normalizeForm({ questions: [{ id: "c", type: "choice", label: "Pick", required: true, options: ["One"] }] }).questions.map((q) => q.id)).toEqual(["recommend"]);
  });

  it("refuses forms that can't be filled in", () => {
    expect(formError(form)).toBeNull();
    expect(formError({ questions: [] })).toMatch(/at least one/);
    expect(formError({ questions: form.questions.filter((q) => q.type !== "nps") })).toMatch(/exactly one recommend/);
    expect(formError({ questions: [...form.questions, { id: "z", type: "text", label: "  ", required: false }] })).toMatch(/write the question/);
    expect(formError({ questions: [...form.questions, { id: "z", type: "choice", label: "Pick", required: false, options: ["A", "A"] }] })).toMatch(/two different choices/);
  });

  it("reads answers against the form and fills in the scoring columns", () => {
    const r = readAnswers(form, get({ q_recommend: "9", q_pace: "4", q_best: "Demo", q_told_objectives: "yes", q_reason: "Great" }));
    expect(r).toMatchObject({ recommend: 9, reason: "Great", legacy: { told_objectives: true, practised: null } });
    if ("answers" in r) expect(r.answers.map((a) => a.value)).toEqual([9, 4, "Demo", true, "Great"]);
  });

  it("requires the required questions and ignores invalid choices", () => {
    expect(readAnswers(form, get({ q_pace: "4", q_told_objectives: "yes" }))).toEqual({ error: expect.stringMatching(/0 to 10/) });
    expect(readAnswers(form, get({ q_recommend: "9", q_told_objectives: "yes" }))).toEqual({ error: expect.any(String) });
    const r = readAnswers(form, get({ q_recommend: "9", q_pace: "4", q_best: "Hacked", q_told_objectives: "no" }));
    if ("answers" in r) expect(r.answers.find((a) => a.id === "best")?.value).toBeNull();
  });

  it("sums up new and older responses question by question", () => {
    const fresh = readAnswers(form, get({ q_recommend: "9", q_pace: "4", q_best: "Demo", q_told_objectives: "yes" }));
    const old = { recommend: 6, reason: "Too fast", told_objectives: false, practised: true, ai_safety: null };
    const s = summarizeQuestions([{ recommend: 9, reason: null, answers: "answers" in fresh ? fresh.answers : [] }, old]);
    expect(s.find((q) => q.id === "told_objectives")).toMatchObject({ type: "yes_no", answered: 2, yesPercent: 50 });
    expect(s.find((q) => q.id === "pace")).toMatchObject({ average: 4, ratings: [0, 0, 0, 1, 0] });
    expect(s.find((q) => q.id === "best")?.choices).toEqual([{ option: "Demo", count: 1 }]);
    expect(s.find((q) => q.id === "reason")?.texts).toEqual(["Too fast"]);
    expect(s.some((q) => q.id === "recommend")).toBe(false);
  });
});
