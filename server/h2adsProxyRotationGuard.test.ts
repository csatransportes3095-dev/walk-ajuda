import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(process.cwd(), "workers/windows/browser-session.mjs"), "utf8");
const autoProvisioning = fs.readFileSync(path.resolve(process.cwd(), "server/h2adsAutoProvisioning.ts"), "utf8");
const proxyPool = fs.readFileSync(path.resolve(process.cwd(), "server/h2adsProxyPool.ts"), "utf8");

describe("H2ADS proxy rotation guard", () => {
  it("suspende trafego para IP alterado e somente revalida IP original", () => {
    expect(source).toContain("browserExitHandled || browserProbeInProgress");
    expect(source).toContain("normalizeIp(observedIp) !== normalizeIp(sessionLockedIp)");
    expect(source).toContain('killSwitchReason: "session_ip_changed"');
  });

  it("mantem a politica de aceitar novo IP somente entre sessoes", () => {
    expect(source).toContain('proxyRotationPolicy: "provider_managed_between_sessions"');
    expect(source).not.toContain("rotationMinutes * 60_000");
  });

  it("reserva e valida somente SOCKS5 na troca automatica", () => {
    expect(proxyPool).toContain('requiredProtocol: H2AdsProxyProtocol = "socks5"');
    expect(proxyPool).toContain('eq(h2AdsProxyPool.protocol, requiredProtocol)');
    expect(autoProvisioning).toContain('reserveH2AdsProxyForInstance(instanceId, true, "socks5")');
    expect(autoProvisioning).toContain('candidate.protocol !== "socks5"');
    expect(autoProvisioning).toContain('proxy_protocol_not_socks5');
  });
});
