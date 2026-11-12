import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("H2 Android native isolated architecture", () => {
  const router = read("server/routers/h2Android.ts");
  const transport = read("server/h2AndroidAgentRoute.ts");
  const agent = read("workers/windows/H2AndroidAgent.ps1");
  const dashboard = read("client/src/pages/AdminH2Android.tsx");
  const root = read("server/routers.ts");
  const app = read("client/src/App.tsx");
  it("restricts dashboard endpoints to ADM and pairs only once", () => {
    for (const mutation of ["overview", "importProxies", "createPairing", "createProfile", "renameProfile", "command", "revokeAgent"]) {
      expect(router).toMatch(new RegExp(mutation + ": adminProcedure"));
    }
    expect(app).toContain('<Route path={"/ADIMIN/ANDROID"}><AdminGuard><AdminH2Android /></AdminGuard></Route>');
    expect(router).toContain("usedAt IS NULL AND expiresAt > NOW() FOR UPDATE");
    expect(transport).toContain("authenticateAndroidAgent");
  });
  it("prevents allocation duplication and permanently deletes proxies after local confirmation", () => {
    expect(router).toContain("LIMIT 1 FOR UPDATE");
    expect(router).toContain("profileId VARCHAR(36) NULL UNIQUE");
    expect(router).toContain("proxyId BIGINT UNSIGNED NOT NULL UNIQUE");
    expect(router).toContain("if (input.success && job.action === \"delete\")");
    expect(router).toContain("DELETE FROM h2_android_proxies WHERE profileId=");
    expect(router).toContain("await tx.execute(sql");
  });
  it("does not clone AVDs, expose emulator screen to web or mutate H2ADS resources", () => {
    expect(agent).toContain("create avd -n $Name -k $Image");
    expect(agent).toContain("-http-proxy");
    expect(agent).toContain("ANDROID_AVD_HOME");
    expect(agent).not.toContain("H2AdsWorker");
    expect(router).not.toContain("h2AdsProxyPool");
    expect(dashboard).not.toContain("mobileRemoteFrame");
    expect(root).toContain("h2Android: h2AndroidRouter");
  });
  it("keeps encrypted proxy credentials inside agent-only authenticated endpoint", () => {
    expect(router).toContain("encryptH2AdsProxy");
    expect(router).toContain("decryptH2AdsProxy");
    expect(router).not.toContain("proxyConfig: input");
    expect(transport).toContain("authorization");
    expect(transport).toContain("res.status(401)");
  });
});
