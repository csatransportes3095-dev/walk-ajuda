import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(process.cwd(), "workers/windows/browser-session.mjs"), "utf8");

describe("H2ADS proxy rotation guard", () => {
  it("suspende trafego para IP alterado e somente revalida IP original", () => {
    expect(source).toContain("browserExitHandled || browserProbeInProgress");
    expect(source).toContain("normalizeIp(frontIp) !== normalizeIp(sessionLockedIp)");
    expect(source).toContain('killSwitchReason: "session_ip_changed"');
  });

  it("mantem a politica de aceitar novo IP somente entre sessoes", () => {
    expect(source).toContain('proxyRotationPolicy: "provider_managed_between_sessions"');
    expect(source).not.toContain("rotationMinutes * 60_000");
  });
});
