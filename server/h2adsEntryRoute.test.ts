import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isH2AdsPath } from "../shared/h2adsRoute";

const projectRoot = path.resolve(import.meta.dirname, "..");

describe("H2 Ads entry route isolation", () => {
  it("accepts only the H2 Ads route and its real subpaths", () => {
    expect(isH2AdsPath("/h2ads")).toBe(true);
    expect(isH2AdsPath("/h2ads/instances")).toBe(true);
    expect(isH2AdsPath("/h2ads-console")).toBe(false);
    expect(isH2AdsPath("/admin/codes")).toBe(false);
  });

  it("keeps the entry card and route in the existing administrative app", () => {
    const appSource = fs.readFileSync(path.join(projectRoot, "client/src/App.tsx"), "utf8");
    const adminSource = fs.readFileSync(path.join(projectRoot, "client/src/pages/AdminCodes.tsx"), "utf8");

    expect(appSource).toContain('path={"/h2ads"}');
    expect(appSource).toContain("isH2AdsRoute");
    expect(appSource).toContain("<H2AdsGuard><H2Ads /></H2AdsGuard>");
    expect(adminSource).toContain("id: 'h2ads'");
    expect(adminSource).toContain("href: '/h2ads'");
  });

  it("keeps the H2 Ads page tied only to its own router, without business data or proxy secrets", () => {
    const pageSource = fs.readFileSync(path.join(projectRoot, "client/src/pages/H2Ads.tsx"), "utf8");

    expect(pageSource).toContain("H2 ADS");
    expect(pageSource).toContain("https://files.manuscdn.com/user_upload_by_module/session_file/310519663911003862/NUtvqlTplGBXXVCr.png");
    expect(pageSource).toContain("trpc.h2Ads.listDashboard");
    expect(pageSource).toContain("trpc.h2Ads.saveNetworkProfile");
    expect(pageSource).not.toContain("trpc.orders");
    expect(pageSource).not.toContain("trpc.customers");
    expect(pageSource).not.toContain("proxyUrl");
    expect(pageSource).not.toContain("proxyPassword");
    expect(pageSource).not.toContain("browserWSEndpoint");
  });
});
