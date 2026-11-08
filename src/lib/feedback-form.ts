// The participant feedback form that Training Excellence edits, and how answers are read and summed up.
// Pure rules, tested in tests/feedback-form.test.ts. The form lives in settings ("feedback_form").
import { REASON_QUESTION, RECOMMEND_QUESTION, YES_NO_QUESTIONS, type YesNoKey } from "./survey";

export type QType = "nps" | "yes_no" | "rating" | "choice" | "text";
export type Question = { id: string; type: QType; label: string; required: boolean; options?: string[] };
export type FeedbackFormDef = { questions: Question[] };
export type Answer = { id: string; type: QType; label: string; value: number | boolean | string | null };

export const QTYPE_LABEL: Record<QType, string> = { nps: "Recommend score (0–10)", yes_no: "Yes / No", rating: "Rating (1–5)", choice: "Multiple choice", text: "Text answer" };
export const MAX_QUESTIONS = 20;

// The form participants saw before it became editable; also how older responses are read.
export const DEFAULT_FORM: FeedbackFormDef = {
  questions: [
    { id: "recommend", type: "nps", label: RECOMMEND_QUESTION, required: true },
    { id: "reason", type: "text", label: REASON_QUESTION, required: false },
    ...YES_NO_QUESTIONS.map((q) => ({ id: q.key, type: "yes_no" as const, label: q.label, required: true })),
  ],
};

const TYPES: QType[] = ["nps", "yes_no", "rating", "choice", "text"];
const ID = /^[a-z0-9_]{1,40}$/;
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

// Whatever is stored, a form participants can fill in: the 0–10 recommend question is always there, first.
export function normalizeForm(raw: unknown): FeedbackFormDef {
  const list = Array.isArray((raw as FeedbackFormDef | null)?.questions) ? (raw as FeedbackFormDef).questions : null;
  if (!list) return DEFAULT_FORM;
  const seen = new Set<string>();
  const questions: Question[] = [];
  for (const q of list.slice(0, MAX_QUESTIONS + 1)) {
    if (!q || typeof q !== "object" || !TYPES.includes(q.type) || !ID.test(String(q.id)) || seen.has(q.id)) continue;
    const label = clean(q.label, 300);
    if (!label) continue;
    const options = q.type === "choice" ? [...new Set((q.options ?? []).map((o) => clean(o, 120)).filter(Boolean))].slice(0, 10) : undefined;
    if (q.type === "choice" && (options?.length ?? 0) < 2) continue;
    seen.add(q.id);
    questions.push({ id: q.id, type: q.type, label, required: q.type === "nps" ? true : !!q.required, ...(options ? { options } : {}) });
  }
  const nps = questions.find((q) => q.type === "nps") ?? DEFAULT_FORM.questions[0];
  return { questions: [{ ...nps, id: "recommend" }, ...questions.filter((q) => q.type !== "nps" && q.id !== "recommend")] };
}

// What's wrong with a form someone is about to save, or null.
export function formError(raw: unknown): string | null {
  const list = (raw as FeedbackFormDef | null)?.questions;
  if (!Array.isArray(list) || !list.length) return "Add at least one question.";
  if (list.length > MAX_QUESTIONS) return `Keep the form to ${MAX_QUESTIONS} questions or fewer.`;
  if (list.filter((q) => q?.type === "nps").length !== 1) return "The form needs exactly one recommend (0–10) question.";
  for (const [i, q] of list.entries()) {
    if (!TYPES.includes(q?.type)) return `Question ${i + 1}: choose a type.`;
    if (!clean(q.label, 300)) return `Question ${i + 1}: write the question.`;
    if (String(q.label).length > 300) return `Question ${i + 1}: keep it under 300 characters.`;
    if (q.type === "choice") {
      const opts = (q.options ?? []).map((o) => clean(o, 120)).filter(Boolean);
      if (new Set(opts).size < 2) return `Question ${i + 1}: add at least two different choices.`;
      if (opts.length > 10) return `Question ${i + 1}: keep it to 10 choices.`;
    }
  }
  return null;
}

type Read = { answers: Answer[]; recommend: number; reason: string | null; legacy: Partial<Record<YesNoKey, boolean | null>> };

// Reads a participant's answers (form field "q_<id>") against the form, or says what's missing.
export function readAnswers(form: FeedbackFormDef, get: (name: string) => string | null): Read | { error: string } {
  const answers: Answer[] = [];
  let recommend: number | null = null;
  for (const q of form.questions) {
    const raw = (get(`q_${q.id}`) ?? "").trim();
    let value: number | boolean | string | null = null;
    if (q.type === "nps") {
      const n = Number(raw);
      if (raw === "" || !Number.isInteger(n) || n < 0 || n > 10) return { error: "Please pick a score from 0 to 10." };
      value = recommend = n;
    } else if (q.type === "yes_no") {
      value = raw === "yes" ? true : raw === "no" ? false : null;
    } else if (q.type === "rating") {
      const n = Number(raw);
      value = raw !== "" && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
    } else if (q.type === "choice") {
      value = q.options?.includes(raw) ? raw : null;
    } else {
      value = raw.replace(/\r\n/g, "\n").slice(0, 2000) || null;
    }
    if (value == null && q.required) return { error: q.type === "text" ? "Please answer every required question." : "Please answer every question marked with *." };
    answers.push({ id: q.id, type: q.type, label: q.label, value });
  }
  const reasonAnswer = answers.find((a) => a.id === "reason" && a.type === "text");
  const legacy = Object.fromEntries(
    YES_NO_QUESTIONS.map((y) => {
      const a = answers.find((x) => x.id === y.key && x.type === "yes_no");
      return [y.key, a ? (a.value as boolean | null) : null];
    }),
  ) as Partial<Record<YesNoKey, boolean | null>>;
  return { answers, recommend: recommend!, reason: (reasonAnswer?.value as string | null) ?? null, legacy };
}

export type ResponseRow = { recommend: number | null; reason: string | null; answers?: unknown } & Partial<Record<YesNoKey, boolean | null>>;

export type QuestionSummary = {
  id: string;
  type: Exclude<QType, "nps">;
  label: string;
  answered: number;
  yesPercent?: number | null;
  average?: number | null;
  ratings?: number[];
  choices?: { option: string; count: number }[];
  texts?: string[];
};

// Responses sent before the form became editable only have the fixed columns.
function answersOf(r: ResponseRow): Answer[] {
  if (Array.isArray(r.answers)) return r.answers as Answer[];
  return DEFAULT_FORM.questions.map((q) => ({
    id: q.id,
    type: q.type,
    label: q.label,
    value: q.type === "nps" ? r.recommend : q.id === "reason" ? r.reason : ((r[q.id as YesNoKey] as boolean | null | undefined) ?? null),
  }));
}

// One summary per question (except the recommend score), in the order the questions appeared.
export function summarizeQuestions(rows: ResponseRow[]): QuestionSummary[] {
  const by = new Map<string, { type: QType; label: string; values: Answer["value"][] }>();
  for (const r of rows) {
    for (const a of answersOf(r)) {
      if (a.type === "nps") continue;
      const key = `${a.id}:${a.type}`;
      const cur = by.get(key) ?? { type: a.type, label: a.label, values: [] };
      cur.label = a.label;
      cur.values.push(a.value);
      by.set(key, cur);
    }
  }
  return [...by.entries()].map(([key, { type, label, values }]) => {
    const id = key.split(":")[0];
    const given = values.filter((v) => v != null && v !== "");
    const base = { id, type: type as Exclude<QType, "nps">, label, answered: given.length };
    if (type === "yes_no") {
      const b = given as boolean[];
      return { ...base, yesPercent: b.length ? Math.round((b.filter(Boolean).length / b.length) * 100) : null };
    }
    if (type === "rating") {
      const n = given as number[];
      return { ...base, average: n.length ? Math.round((n.reduce((s, x) => s + x, 0) / n.length) * 10) / 10 : null, ratings: [1, 2, 3, 4, 5].map((k) => n.filter((x) => x === k).length) };
    }
    if (type === "choice") {
      const counts = new Map<string, number>();
      for (const v of given as string[]) counts.set(v, (counts.get(v) ?? 0) + 1);
      return { ...base, choices: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([option, count]) => ({ option, count })) };
    }
    return { ...base, texts: (given as string[]).map((t) => t.trim()).filter(Boolean) };
  });
}
