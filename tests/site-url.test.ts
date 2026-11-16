// Links in emails must open the app, never the Vercel dashboard.

import { afterEach, describe, expect, it } from "vitest";
import { siteUrl } from "@/lib/email";

const saved = { site: process.env.SITE_URL, prod: process.env.VERCEL_PROJECT_PRODUCTION_URL };
afterEach(() => {
  process.env.SITE_URL = saved.site;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = saved.prod;
});
const set = (site?: string, prod?: string) => {
  if (site === undefined) delete process.env.SITE_URL; else process.env.SITE_URL = site;
  if (prod === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL; else process.env.VERCEL_PROJECT_PRODUCTION_URL = prod;
};

describe("siteUrl", () => {
  it("uses SITE_URL without a trailing slash", () => {
    set("https://brain.meska.ai/", "meska-trainers.vercel.app");
    expect(siteUrl()).toBe("https://brain.meska.ai");
  });
  it("ignores a SITE_URL that points at the Vercel dashboard", () => {
    set("https://vercel.com/meska2", "meska-trainers.vercel.app");
    expect(siteUrl()).toBe("https://meska-trainers.vercel.app");
  });
  it("falls back to the production address, then localhost", () => {
    set(undefined, "meska-trainers.vercel.app");
    expect(siteUrl()).toBe("https://meska-trainers.vercel.app");
    set(undefined, undefined);
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});
