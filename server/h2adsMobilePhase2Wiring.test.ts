import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("H2ADS Mobile fase 2: ligacoes seguras", () => {
  const router = read("server/routers/h2ads.ts");
  const workerRoute = read("server/h2adsWorkerRoute.ts");
  const workerAgent = read("workers/windows/H2AdsWorker.ps1");
  const browser = read("workers/windows/browser-session.mjs");
  const mobile = read("client/src/pages/H2AdsMobile.tsx");
  const viewer = read("client/src/pages/H2AdsMobileRemoteViewer.tsx");

  it("mantem sessao remota desativada por padrao e protege por ADM", () => {
    expect(read("server/h2adsMobileRemoteBridge.ts")).toContain('process.env.H2ADS_MOBILE_REMOTE_ENABLED === "1"');
    expect(router).toContain("mobileRemoteStart: adminProcedure");
    expect(router).toContain("mobileRemoteFrame: adminProcedure");
    expect(router).toContain("mobileRemoteInput: adminProcedure");
    expect(router).toContain("mobileRemoteStop: adminProcedure");
    expect(router).toContain("h2AdsRemoteOwnerForOpenInstance(input.instanceId)");
    expect(router).toContain("h2AdsMobileRemoteEnabled()");
    expect(viewer).toContain("mobileRemoteFrame.useMutation()");
    expect(viewer).not.toContain("mobileRemoteFrame.useQuery");
    expect(viewer).not.toContain("localStorage");
  });

  it("nao modifica proxies nem permite depuracao remota quando o piloto esta desligado", () => {
    expect(workerRoute).toContain('command.command === "launch_browser" && h2AdsMobileRemoteEnabled()');
    expect(workerAgent).toContain('H2ADS_REMOTE_DEBUG');
    expect(browser).toContain('process.env.H2ADS_REMOTE_DEBUG === "1"');
    expect(browser).toContain('"--remote-debugging-pipe"');
    expect(browser).not.toContain("--remote-debugging-port");
    expect(browser).toContain('["ignore", "ignore", "ignore", "pipe", "pipe"]');
    expect(read("workers/windows/mobile-remote.mjs")).toContain("Target.attachToTarget");
    expect(read("workers/windows/mobile-remote.mjs")).toContain('inputBuffer.indexOf("\\0")');
    expect(workerRoute).toContain("authenticateRequest(req, res)");
    expect(workerRoute).toContain("MOBILE_REMOTE_MAX_FRAME_BYTES");
  });

  it("mostra controles no celular somente para instancias abertas no PC", () => {
    expect(mobile).toContain("isOpen && online && remoteStatus.data?.enabled");
    expect(mobile).toContain("H2AdsMobileRemoteViewer");
    expect(viewer).toContain("kind: \"tap\"");
    expect(viewer).toContain('kind: "scroll"');
    expect(viewer).toContain('kind: "text"');
    expect(viewer).toContain('kind: "key"');
    expect(viewer).toContain("frameRequest.mutateAsync");
  });
});
