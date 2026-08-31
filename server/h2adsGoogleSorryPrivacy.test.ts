import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const session = fs.readFileSync(path.join(projectRoot, "workers/windows/browser-session.mjs"), "utf8");

describe("H2ADS Google unusual-traffic privacy guard", () => {
  it("redirects Google /sorry before the page can expose network details", () => {
    expect(session).toContain("createGoogleSorryPrivacyGuard");
    expect(session).toContain("declarativeNetRequest");
    expect(session).toContain("google\\.com/sorry");
    expect(session).toContain("google\\.com\\.br/sorry");
    expect(session).toContain('resourceTypes: ["main_frame"]');
    expect(session).toContain('extensionPath: "/blocked.html"');
    expect(session).toContain("--load-extension=");
  });

  it("keeps the existing proxy and browser privacy protections", () => {
    expect(session).toContain("--proxy-server=http://127.0.0.1:");
    expect(session).toContain("--disable-quic");
    expect(session).toContain("--force-webrtc-ip-handling-policy=disable_non_proxied_udp");
    expect(session).toContain("privacyGuardPreflight");
  });

  it("shows only a neutral local protection page", () => {
    expect(session).toContain("Conexao em verificacao");
    expect(session).toContain("Nenhum endereco IP, usuario, senha, host ou porta do proxy e exibido aqui");
    expect(session).not.toContain("201.17.208.107");
  });
});
