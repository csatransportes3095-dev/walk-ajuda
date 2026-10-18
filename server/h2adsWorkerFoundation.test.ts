import fs from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { assertH2AdsSchemaStatementSafe } from "./h2adsSchemaMigration";

const projectRoot = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(projectRoot, file), "utf8");

describe("fundação multi-Worker H2 Ads", () => {
  it("mantém três tabelas H2 Ads idempotentes e sem comandos destrutivos", () => {
    const statements = read("drizzle/0140_h2ads_browser_workers.sql").split("--> statement-breakpoint").map(item => item.trim()).filter(Boolean);
    expect(statements).toHaveLength(3);
    statements.forEach(assertH2AdsSchemaStatementSafe);
    expect(statements.join("\n")).toContain("h2ads_browser_workers");
    expect(statements.join("\n")).toContain("h2ads_worker_pairing_codes");
    expect(statements.join("\n")).toContain("h2ads_instance_worker_assignments");
  });

  it("usa códigos de uso único, token com hash e heartbeat sem devolver segredo", () => {
    const source = read("server/h2ads.ts");
    const route = read("server/h2adsWorkerRoute.ts");
    expect(source).toContain("timingSafeEqual");
    expect(source).toContain("codeHash");
    expect(source).toContain("tokenHash");
    expect(source).toContain("isNull(h2AdsWorkerPairingCodes.usedAt)");
    expect(route).toContain("/api/h2ads/worker/claim");
    expect(route).toContain("/api/h2ads/worker/heartbeat");
    expect(route).toContain("/api/h2ads/worker/windows-agent.ps1");
    expect(route.toLowerCase()).toContain("x-h2ads-agent-version");
    expect(route).toContain("STALE_BROWSER_COMMAND_MS");
    expect(route).toContain("Cache-Control");
    expect(route).not.toContain("console.log");
  });

  it("permite somente sessão local manual e continua sem automação de sites", () => {
    const script = read("workers/windows/H2AdsWorker.ps1");
    const runner = read("workers/windows/browser-runner.mjs");
    const session = read("workers/windows/browser-session.mjs");
    expect(script).toContain('$AgentVersion = "1.4.0"');
    expect(script).toContain("ConvertFrom-SecureString");
    expect(script).toContain("ConvertTo-SecureString");
    expect(script).toContain("Read-Host");
    expect(script).toContain("AsSecureString");
    expect(script).toContain("Código de pareamento inválido");
    expect(script).toContain("Register-ScheduledTask");
    expect(script).toContain("New-ScheduledTaskSettingsSet");
    expect(script).toContain("RestartCount 999");
    expect(script).toContain("RestartInterval (New-TimeSpan -Minutes 1)");
    expect(script).toContain("MultipleInstances IgnoreNew");
    expect(script).toContain("Start-ScheduledTask");
    expect(script).toContain("StartH2AdsWorker.vbs");
    expect(script).toContain("schtasks.exe /Run /TN");
    expect(script).toContain("wscript.exe");
    expect(script).toContain("Get-Process -Id $nodePid -ErrorAction SilentlyContinue");
    expect(script).toContain("taskkill.exe /PID $nodePid /T /F 1>$null 2>$null");
    expect(script).toContain("CloseMainWindow()");
    expect(script).toContain("$pendingItems = @(");
    expect(script).toContain("$saved = [bool](Send-H2AdsProfileSnapshot $config $instanceId)");
    expect(script).toContain("nao usa break aqui");
    expect(script).toContain("/api/h2ads/worker/heartbeat");
    expect(script).toContain("/api/h2ads/worker/commands/next");
    expect(script).toContain("/api/h2ads/worker/profiles/");
    expect(script).toContain("X-H2ADS-Agent-Version");
    expect(script).toContain("X-H2ADS-Snapshot-SHA256");
    expect(script).toContain("Acquire-WorkerMutex");
    expect(script).toContain("Stop-ExistingWorkerProcesses");
    expect(script).toContain("Complete-LocalCommandFailure");
    expect(script).toContain("ProxyChainPackagePath");
    expect(script).toContain("Initialize-InstanceProfile");
    expect(script).toContain("Start-Sleep -Seconds 2");
    expect(script).toContain("SnapshotQueueWorker");
    expect(script).toContain("Queue-H2AdsProfileSnapshot");
    expect(script).toContain("Start-H2AdsSnapshotQueueWorker");
    expect(script).toContain('$ProgressPreference = "SilentlyContinue"');
    expect(session).toContain("rotationMinutes");
    expect(session).toContain("createFrontRelay");
    expect(session).toContain("createBackendRelay");
    expect(session).toContain("activeBackendPort");
    expect(session).toContain("verifyChromeProxyPath");
    expect(session).toContain("browserProxyVerified");
    expect(session).toContain("server.close(true)");
    expect(session).not.toContain("await previousRelay.close(true)");
    expect(session).toContain("uploadProfileSnapshot");
    expect(runner).toContain('host: "127.0.0.1"');
    expect(runner).toContain("https://api.ipify.org?format=json");
    expect(runner).not.toContain("console.log");
    expect(session).toContain("createInstanceLabelPage");
    expect(session).toContain("labelPageUrl");
    expect(session).toContain("privacyGuardPreflight");
    expect(session).toContain("--proxy-server=http://127.0.0.1:");
    expect(session).toContain("--user-data-dir=");
    expect(session).toContain("/api/h2ads/worker/runs/");
    for (const prohibited of ["playwright", "selenium", "puppeteer", "page.goto", "browser.newpage", "console.log"]) {
      expect(script.toLowerCase()).not.toContain(prohibited.toLowerCase());
      expect(runner.toLowerCase()).not.toContain(prohibited.toLowerCase());
      expect(session.toLowerCase()).not.toContain(prohibited.toLowerCase());
    }
  });

  it("bloqueia saída direta do Chrome dedicado antes da sessão", () => {
    const script = read("workers/windows/H2AdsWorker.ps1");
    const session = read("workers/windows/browser-session.mjs");
    expect(script).toContain("DedicatedChromePath");
    expect(script).toContain("Get-AuthenticodeSignature");
    expect(script).toContain("New-NetFirewallRule");
    expect(script).toContain("Direction Outbound");
    expect(script).toContain("Action Block");
    expect(script).toContain('RemoteAddress @("0.0.0.0-126.255.255.255", "128.0.0.0-255.255.255.255")');
    expect(script).toContain('RemoteAddress "Internet6"');
    expect(script).toContain("H2ADS_BROWSER_EXECUTABLE");
    expect(script).toContain("Execute a atualização do Worker como Administrador");
    expect(session).toContain('directBrowserEgress: "blocked_by_windows_firewall"');
    expect(session).toContain('const browserExecutable = process.env.H2ADS_BROWSER_EXECUTABLE');
    expect(session).toContain("KILL_SWITCH_CHECK_INTERVAL_MS = 5_000");
    // Falha de proxy deve bloquear trafego SEM matar o Chrome.
    expect(session).toContain("suspendProxyTraffic");
    expect(session).toContain("resumeProxyTraffic");
    expect(session).toContain("networkSuspended");
    expect(session).toContain("closeRelay(frontRelay)");
    expect(session).toContain("queueProfileSnapshot");
    expect(session).not.toContain("triggerKillSwitch");
    expect(session).not.toContain("terminateBrowserProcess");
    expect(session).not.toContain("taskkill.exe");
    expect(session).toContain("--disable-quic");
    expect(session).toContain("--dns-prefetch-disable");
    expect(session).toContain("--force-webrtc-ip-handling-policy=disable_non_proxied_udp");
  });

  it("falha de telemetria nao fecha nem bloqueia o navegador com proxy saudavel", async () => {
    const session = read("workers/windows/browser-session.mjs");
    const start = session.indexOf("async function reportObservedIp() {");
    const end = session.indexOf("async function enforceKillSwitch() {", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const events: string[] = [];
    const sandbox: Record<string, any> = {
      browser: { exitCode: null }, relayPort: 9876,
      rotationInProgress: false, ipCheckInProgress: false, networkSuspended: false, browserExitHandled: false,
      lastReportedIp: "198.51.100.10",
      checkIp: async () => "198.51.100.11",
      writeSession: () => undefined,
      post: async () => { throw new Error("panel_http_503"); },
      panelFailure: () => { events.push("panel_offline"); },
      suspendProxyTraffic: async () => { events.push("proxy_blocked"); },
    };
    runInNewContext(session.slice(start, end), sandbox);
    await sandbox.reportObservedIp();
    expect(events).toEqual(["panel_offline"]);
    expect(sandbox.ipCheckInProgress).toBe(false);
  });

  it("falha do verificador suspende somente o trafego, sem encerrar o Chrome", async () => {
    const session = read("workers/windows/browser-session.mjs");
    const start = session.indexOf("async function reportObservedIp() {");
    const end = session.indexOf("async function enforceKillSwitch() {", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const events: string[] = [];
    const sandbox: Record<string, any> = {
      browser: { exitCode: null }, relayPort: 9876,
      rotationInProgress: false, ipCheckInProgress: false, networkSuspended: false, browserExitHandled: false,
      checkIp: async () => { throw new Error("proxy_tcp_timeout"); },
      suspendProxyTraffic: async () => { events.push("proxy_suspended"); },
      post: async () => { events.push("panel_post"); },
      writeSession: () => undefined,
    };
    runInNewContext(session.slice(start, end), sandbox);
    await sandbox.reportObservedIp();
    expect(events).toEqual(["proxy_suspended"]);
    expect(sandbox.browser.exitCode).toBeNull();
  });

  it("suspensao desliga relays antigos e conserva a porta local bloqueada", async () => {
    const session = read("workers/windows/browser-session.mjs");
    const start = session.indexOf("async function suspendProxyTraffic(");
    const end = session.indexOf("async function resumeProxyTraffic()", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const events: string[] = [];
    const browser = { exitCode: null, pid: 12345 };
    const sandbox: Record<string, any> = {
      browser, browserExitHandled: false, networkSuspended: false, activeBackendPort: 8901, relayPort: 4567,
      frontRelay: { kind: "front" }, backendRelay: { kind: "backend" },
      classifyNetworkError: () => "proxy_tcp_timeout",
      closeRelay: async (relay: { kind: string }) => { events.push("close_" + relay.kind); },
      createFrontRelay: (port: number) => ({
        kind: "front_blocked", port, listen: async () => { events.push("rebind_front"); },
      }),
      writeSession: (status: Record<string, string>) => { events.push(status.networkState); },
    };
    runInNewContext(session.slice(start, end), sandbox);
    await sandbox.suspendProxyTraffic("proxy_tcp_timeout");
    expect(sandbox.networkSuspended).toBe(true);
    expect(sandbox.activeBackendPort).toBeUndefined();
    expect(sandbox.frontRelay.port).toBe(4567);
    expect(sandbox.backendRelay).toBeUndefined();
    expect(browser.pid).toBe(12345);
    expect(events).toEqual(["close_front", "close_backend", "rebind_front", "suspended"]);
  });

  it("nao reabre trafego durante recuperacao se a verificacao do proxy falha", async () => {
    const session = read("workers/windows/browser-session.mjs");
    const start = session.indexOf("async function resumeProxyTraffic() {");
    const end = session.indexOf("async function reportObservedIp() {", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const events: string[] = [];
    const sandbox: Record<string, any> = {
      networkSuspended: true, browserExitHandled: false, activeBackendPort: undefined,
      backendRelay: undefined, frontRelay: { kind: "front_blocked" }, relayPort: 9876,
      createBackendRelay: () => ({ port: 6543, listen: async () => undefined }),
      checkIpThroughPort: async () => { throw new Error("proxy_tcp_timeout"); },
      suspendProxyTraffic: async () => { events.push("keep_blocked"); },
    };
    runInNewContext(session.slice(start, end), sandbox);
    await sandbox.resumeProxyTraffic();
    expect(sandbox.networkSuspended).toBe(true);
    expect(sandbox.activeBackendPort).toBeUndefined();
    expect(events).toEqual(["keep_blocked"]);
  });

  it("mantém versões anteriores do perfil somente após validar o snapshot novo", () => {
    const snapshots = read("server/h2adsProfileSnapshots.ts");
    expect(snapshots).toContain("SNAPSHOT_RETENTION = 3");
    expect(snapshots).toContain("pruneOldH2AdsSnapshots");
    expect(snapshots).toContain("actualHash.toLowerCase() !== input.plainSha256.toLowerCase()");
    expect(snapshots).toContain("snapshotKey: key");
    expect(snapshots).toContain("await pruneOldH2AdsSnapshots(input.instanceId, key).catch(() => undefined)");
    expect(snapshots).not.toContain("if (previousKey && previousKey !== key) await r2DeleteObjects([previousKey])");
  });

  it("mantém a fila de preparação em tabelas H2 Ads idempotentes e isoladas", () => {
    const statements = read("drizzle/0141_h2ads_browser_preparation.sql").split("--> statement-breakpoint").map(item => item.trim()).filter(Boolean);
    expect(statements).toHaveLength(2);
    statements.forEach(assertH2AdsSchemaStatementSafe);
    expect(statements.join("\n")).toContain("h2ads_instance_browser_runs");
    expect(statements.join("\n")).toContain("h2ads_worker_commands");
    expect(statements.join("\n")).not.toMatch(/\b(clients|orders|loans|expenses|cards)\b/i);
  });

  it("cria uma fila manual isolada e idempotente sem alterar a fila de preparação publicada", () => {
    const statements = read("drizzle/0142_h2ads_browser_manual_commands.sql").split("--> statement-breakpoint").map(item => item.trim()).filter(Boolean);
    expect(statements).toHaveLength(1);
    statements.forEach(assertH2AdsSchemaStatementSafe);
    expect(statements.join("\n")).toContain("h2ads_worker_browser_commands");
    expect(statements.join("\n")).not.toContain("ALTER TABLE");
    expect(statements.join("\n")).not.toContain("h2ads_worker_commands`");
  });
});