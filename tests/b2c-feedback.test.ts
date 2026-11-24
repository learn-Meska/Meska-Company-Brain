import { describe, expect, it } from "vitest";
import { canGetB2CQr, offersB2CQr } from "@/lib/b2c-feedback";

const user = (o: Partial<{ role: string; real_role: string; permissions: string[]; trainer_id: string | null }>) => ({
  id: "u1",
  role: "trainer",
  real_role: "trainer",
  permissions: [] as string[],
  trainer_id: null as string | null,
  ...o,
});

describe("B2C feedback QR", () => {
  it("is downloadable by admins and Training Excellence with the dashboard access", () => {
    expect(canGetB2CQr(user({ role: "admin", real_role: "admin" }), "t9")).toBe(true);
    expect(canGetB2CQr(user({ role: "approver", real_role: "approver", permissions: ["te.dashboard"] }), "t9")).toBe(true);
  });
  it("is downloadable by the session's own trainer only", () => {
    expect(canGetB2CQr(user({ trainer_id: "t9" }), "t9")).toBe(true);
    expect(canGetB2CQr(user({ trainer_id: "t1" }), "t9")).toBe(false);
    expect(canGetB2CQr(user({ trainer_id: "t1" }), null)).toBe(false);
  });
  it("is not offered to Growth", () => {
    expect(canGetB2CQr(user({ role: "growth", real_role: "growth", permissions: ["growth.new_deal"] }), "t9")).toBe(false);
  });
  it("shows on upcoming confirmed sessions only", () => {
    expect(offersB2CQr({ status: "confirmed", date: "2026-11-24" }, "2026-11-24")).toBe(true);
    expect(offersB2CQr({ status: "confirmed", date: "2026-12-01" }, "2026-11-24")).toBe(true);
    expect(offersB2CQr({ status: "confirmed", date: "2026-11-23" }, "2026-11-24")).toBe(false);
    expect(offersB2CQr({ status: "needs_trainer", date: "2026-12-01" }, "2026-11-24")).toBe(false);
  });
});
