// Feedback Growth and Training Excellence add by hand on a training.
import { describe, expect, it } from "vitest";
import { mayDeleteFeedback, readTeamFeedback, seesTeamFeedback } from "../src/lib/team-feedback";

describe("team feedback", () => {
  it("only the text is required; the rating is optional", () => {
    expect(readTeamFeedback({ body: "  The client loved it.  " })).toEqual({ source: "client", rating: null, body: "The client loved it." });
    expect(readTeamFeedback({ body: "Good", rating: "", source: "internal" })).toEqual({ source: "internal", rating: null, body: "Good" });
    expect(readTeamFeedback({ body: "Good", rating: "4", source: "participants" })).toEqual({ source: "participants", rating: 4, body: "Good" });
  });
  it("refuses an empty or too long text and a rating outside 1 to 5", () => {
    expect(readTeamFeedback({ body: "   " })).toEqual({ error: "Write the feedback first." });
    expect(readTeamFeedback({ body: "x".repeat(4001) })).toEqual({ error: expect.stringMatching(/under 4,000/) });
    for (const rating of ["0", "6", "2.5", "abc"]) expect(readTeamFeedback({ body: "ok", rating })).toEqual({ error: expect.stringMatching(/1 to 5/) });
  });
  it("an unknown source falls back to the client", () => expect(readTeamFeedback({ body: "ok", source: "hacker" })).toMatchObject({ source: "client" }));
  it("is for Growth, Training Excellence and admins, never trainers or the content team", () => {
    expect(["growth", "approver", "admin"].every(seesTeamFeedback)).toBe(true);
    expect(["trainer", "content"].some(seesTeamFeedback)).toBe(false);
  });
  it("the author removes their own note, a company admin any", () => {
    const growth = { id: "g", role: "growth", real_role: "growth" };
    expect(mayDeleteFeedback(growth, "g")).toBe(true);
    expect(mayDeleteFeedback(growth, "someone")).toBe(false);
    expect(mayDeleteFeedback(growth, null)).toBe(false);
    expect(mayDeleteFeedback({ id: "a", role: "admin", real_role: "admin" }, "someone")).toBe(true);
    // a company admin previewing Growth acts as Growth
    expect(mayDeleteFeedback({ id: "a", role: "growth", real_role: "admin" }, "someone")).toBe(false);
  });
});
