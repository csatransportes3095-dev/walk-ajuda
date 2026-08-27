import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const h2AdsSources = [
  "server/h2ads.ts",
  "server/routers/h2ads.ts",
  "client/src/pages/H2Ads.tsx",
  "drizzle/0137_h2ads_base.sql",
  "drizzle/0138_h2ads_network_metadata.sql",
].map(file => fs.readFileSync(path.join(projectRoot, file), "utf8")).join("\n");

describe("isolamento da base H2 Ads", () => {
  it("usa somente tabelas próprias com prefixo h2ads_", () => {
    expect(h2AdsSources).toContain("h2ads_groups");
    expect(h2AdsSources).toContain("h2ads_instances");
    for (const legacyTable of ["customers", "registrations", "orderStatusHistory", "loans", "expenses", "cards", "accessCodes"]) {
      expect(h2AdsSources).not.toContain(legacyTable);
    }
  });

  it("não declara proxy, credencial, worker ou browser remoto", () => {
    for (const prohibitedField of ["proxyUrl", "proxyPassword", "browserWSEndpoint", "playwright", "chromium", "firefox", "worker_threads"]) {
      expect(h2AdsSources).not.toContain(prohibitedField);
    }
  });
});
