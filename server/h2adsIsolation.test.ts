import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const h2AdsSources = [
  "server/h2ads.ts",
  "server/routers/h2ads.ts",
  "server/h2adsWorkerRoute.ts",
  "client/src/pages/H2Ads.tsx",
  "drizzle/0137_h2ads_base.sql",
  "drizzle/0138_h2ads_network_metadata.sql",
  "drizzle/0140_h2ads_browser_workers.sql",
  "drizzle/0141_h2ads_browser_preparation.sql",
  "drizzle/0142_h2ads_browser_manual_commands.sql",
  "workers/windows/browser-runner.mjs",
  "workers/windows/browser-session.mjs",
].map(file => fs.readFileSync(path.join(projectRoot, file), "utf8")).join("\n");
const h2AdsVisualStyles = fs.readFileSync(path.join(projectRoot, "client/src/index.css"), "utf8");

describe("isolamento da base H2 Ads", () => {
  it("usa somente tabelas próprias com prefixo h2ads_", () => {
    expect(h2AdsSources).toContain("h2ads_groups");
    expect(h2AdsSources).toContain("h2ads_instances");
    for (const legacyTable of ["customers", "registrations", "orderStatusHistory", "loans", "expenses", "cards", "accessCodes"]) {
      expect(h2AdsSources).not.toContain(legacyTable);
    }
  });

  it("não declara endpoints de browser remoto, nem credenciais de proxy em texto aberto", () => {
    for (const prohibitedField of ["proxyUrl", "proxyPassword", "browserWSEndpoint", "playwright", "chromium", "firefox", "worker_threads"]) {
      expect(h2AdsSources).not.toContain(prohibitedField);
    }
  });

  it("mantém o aprimoramento de monitor grande restrito à raiz visual H2 Ads", () => {
    expect(h2AdsSources).toContain('className="h2ads-workspace');
    expect(h2AdsVisualStyles).toContain(".h2ads-workspace");
    expect(h2AdsVisualStyles).toContain("@media (min-width: 1536px)");
    expect(h2AdsVisualStyles).not.toContain(".h2ads-workspace button {\n    onClick");
  });
});
