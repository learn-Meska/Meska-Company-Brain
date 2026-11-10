// Feedback the Meska team adds by hand on a training, e.g. what the client said to Growth on a call.
// Optional. Growth, Training Excellence and admins see it; the trainer never does and scores don't use it.
// Pure rules, tested in tests/team-feedback.test.ts.

export const FEEDBACK_SOURCES = ["client", "participants", "trainer", "internal"] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];
export const FEEDBACK_SOURCE_LABEL: Record<FeedbackSource, string> = {
  client: "From the client",
  participants: "From participants",
  trainer: "From the trainer",
  internal: "Our own view",
};

// The portal the note was written from.
export const FEEDBACK_TEAMS = ["growth", "approver", "admin"] as const;
export type FeedbackTeam = (typeof FEEDBACK_TEAMS)[number];
export const FEEDBACK_TEAM_LABEL: Record<FeedbackTeam, string> = { growth: "Growth", approver: "Training Excellence", admin: "Admin" };
export const isFeedbackTeam = (v: unknown): v is FeedbackTeam => typeof v === "string" && (FEEDBACK_TEAMS as readonly string[]).includes(v);

export const MAX_FEEDBACK_CHARS = 4000;
export const RATING_LABEL: Record<number, string> = { 1: "Very unhappy", 2: "Unhappy", 3: "Neutral", 4: "Happy", 5: "Very happy" };

export type TeamFeedbackInput = { source?: unknown; rating?: unknown; body?: unknown };
export type TeamFeedback = { source: FeedbackSource; rating: number | null; body: string };

// The text is the only required part; the rating (1 to 5) is optional.
export function readTeamFeedback(input: TeamFeedbackInput): TeamFeedback | { error: string } {
  const body = typeof input.body === "string" ? input.body.replace(/\r\n/g, "\n").trim() : "";
  if (!body) return { error: "Write the feedback first." };
  if (body.length > MAX_FEEDBACK_CHARS) return { error: `Keep the feedback under ${MAX_FEEDBACK_CHARS.toLocaleString("en-US")} characters.` };
  const source = (FEEDBACK_SOURCES as readonly unknown[]).includes(input.source) ? (input.source as FeedbackSource) : "client";
  const raw = input.rating == null || input.rating === "" ? null : Number(input.rating);
  if (raw != null && (!Number.isInteger(raw) || raw < 1 || raw > 5)) return { error: "The rating is from 1 to 5, or leave it empty." };
  return { source, rating: raw, body };
}

// Only the Meska team writes and reads it: Growth, Training Excellence and admins, in the view they're using.
export const seesTeamFeedback = (role: string): role is FeedbackTeam => isFeedbackTeam(role);

// The author removes their own note; a company admin removes any.
export const mayDeleteFeedback = (me: { id: string; role: string; real_role: string }, authorId: string | null) => (me.role === "admin" && me.real_role === "admin") || (!!authorId && authorId === me.id);
