// The month calendar draws uploaded B2C sessions as B2C cards beside the bookings.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const { MonthCalendar, monthGrid } = await import("@/components/month-calendar");

const session = {
  id: "s1",
  program: "AI Copilot Diploma",
  cohort: "W16",
  session: "Onboarding",
  date: "2026-11-07",
  start_time: "17:00:00",
  end_time: "22:00:00",
  location: null,
  trainer_name: "Sayed (no profile)",
  status: "needs_trainer" as const,
  delivered: false,
  format: "offline",
};

describe("calendar B2C cards", () => {
  it("shows each session as a B2C card with its trainer, time and status colour", () => {
    const html = renderToStaticMarkup(
      createElement(MonthCalendar, {
        grid: monthGrid("2026-11"),
        bookings: [],
        href: () => "",
        title: () => "",
        qs: (m: string) => `/calendar?m=${m}`,
        path: "/calendar",
        sessions: [session, { ...session, id: "s2", date: "2026-11-08", session: "Session 1", status: "confirmed" as const, delivered: true, trainer_name: "Amr Fahmy", location: "Creativa" }],
      }),
    );
    expect(html.match(/>B2C</g)).toHaveLength(2);
    expect(html).toContain("AI Copilot Diploma W16 - Onboarding");
    expect(html).toContain("Sayed (no profile)");
    expect(html).toContain("5:00 PM - 10:00 PM");
    expect(html).toContain("bg-[#FDE2EC]"); // needs a trainer: pink
    expect(html).toContain("bg-[#D5F5E1]"); // delivered: green
    expect(html).toContain("Creativa");
    expect(html).toContain("2 trainings this month");
  });
});
