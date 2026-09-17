import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Server } from "proxy-chain";

const execFileAsync = promisify(execFile);
const IP_CHECK_INTERVAL_MS = 15_000;
const KILL_SWITCH_CHECK_INTERVAL_MS = 5_000;
const ROTATION_DRAIN_MS = 500;
const CHROME_PROBE_TIMEOUT_MS = 35_000;
const GOOGLE_SORRY_GUARD_INTERVAL_MS = 750;
const required = ["H2ADS_PANEL_URL", "H2ADS_WORKER_KEY", "H2ADS_WORKER_TOKEN", "H2ADS_INSTANCE_ID", "H2ADS_COMMAND_ID", "H2ADS_PROXY_JSON", "H2ADS_PROFILE_DIRECTORY", "H2ADS_BROWSER_EXECUTABLE"];
if (required.some((key) => !process.env[key])) process.exit(2);

const panelUrl = process.env.H2ADS_PANEL_URL;
const workerKey = process.env.H2ADS_WORKER_KEY;
const workerToken = process.env.H2ADS_WORKER_TOKEN;
const instanceId = Number(process.env.H2ADS_INSTANCE_ID);
const commandId = Number(process.env.H2ADS_COMMAND_ID);
const profileDirectory = process.env.H2ADS_PROFILE_DIRECTORY;
const browserExecutable = process.env.H2ADS_BROWSER_EXECUTABLE;
const proxy = JSON.parse(process.env.H2ADS_PROXY_JSON);
const sessionPath = join(profileDirectory, "h2ads-browser-session.json");
const labelPagePath = join(profileDirectory, "h2ads-instance-label.html");
const privacyExtensionDirectory = join(profileDirectory, "h2ads-privacy-extension");
const instanceName = String(proxy.instanceName || `Instancia ${instanceId}`).trim().slice(0, 128);
const instanceWindowTitle = `H2ADS | ${instanceName}`;
const parsedRotationMinutes = Number(proxy.rotationMinutes);
const rotationMinutes = Number.isInteger(parsedRotationMinutes) && parsedRotationMinutes >= 1 && parsedRotationMinutes <= 1_440 ? parsedRotationMinutes : null;

let frontRelay;
let backendRelay;
let relayPort;
let activeBackendPort;
let browser;
let rotationTimer;
let ipTimer;
let killSwitchTimer;
let privacyGuardTimer;
let rotationInProgress = false;
let lastReportedIp = null;
let ipCheckInProgress = false;
let killSwitchCheckInProgress = false;
let killSwitchTriggered = false;
let browserProbeInProgress = false;
let privacyGuardCheckInProgress = false;

function upstreamUrl() {
  const protocol = proxy.protocol === "socks5" ? "socks5" : proxy.protocol === "https" ? "https" : "http";
  return `${protocol}://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.host}:${proxy.port}`;
}

function createBackendRelay(port = 0) {
  return new Server({ host: "127.0.0.1", port, verbose: false, prepareRequestFunction: () => ({ upstreamProxyUrl: upstreamUrl() }) });
}

function createFrontRelay(port = 0) {
  return new Server({
    host: "127.0.0.1",
    port,
    verbose: false,
    prepareRequestFunction: () => {
      if (!activeBackendPort) throw new Error("backend_relay_unavailable");
      return { upstreamProxyUrl: `http://127.0.0.1:${activeBackendPort}` };
    },
  });
}

function chromeExecutable() {
  if (!browserExecutable || !existsSync(browserExecutable)) return undefined;
  return browserExecutable;
}

function headers() {
  return { Authorization: `Bearer ${workerToken}`, "X-H2ADS-Worker-Key": workerKey, "Content-Type": "application/json" };
}

async function post(path, body) {
  const response = await fetch(`${panelUrl.replace(/\/$/, "")}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`panel_http_${response.status}`);
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function hasBrowserProfileData() {
  return ["Local State", join("Default", "Preferences"), join("Default", "Network", "Cookies"), join("Default", "Cookies")]
    .some((relativePath) => existsSync(join(profileDirectory, relativePath)));
}

async function uploadProfileSnapshot() {
  if (!hasBrowserProfileData()) return;
  const archivePath = join(tmpdir(), `h2ads-profile-${instanceId}-${Date.now()}-${process.pid}.tar.gz`);
  try {
    await execFileAsync("tar.exe", ["-czf", archivePath, "-C", profileDirectory, "."], { windowsHide: true, timeout: 180_000, maxBuffer: 16_384 });
    const size = statSync(archivePath).size;
    if (!Number.isSafeInteger(size) || size < 1) throw new Error("profile_snapshot_empty");
    const sha256 = await sha256File(archivePath);
    const response = await fetch(`${panelUrl.replace(/\/$/, "")}/api/h2ads/worker/profiles/${instanceId}/snapshot`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerToken}`,
        "X-H2ADS-Worker-Key": workerKey,
        "X-H2ADS-Snapshot-Size": String(size),
        "X-H2ADS-Snapshot-SHA256": sha256,
        "Content-Type": "application/octet-stream",
      },
      body: createReadStream(archivePath),
      duplex: "half",
    });
    if (!response.ok) throw new Error(`profile_snapshot_http_${response.status}`);
    const manifestPath = join(profileDirectory, "h2ads-profile.json");
    const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { instanceId, profileVersion: 1 };
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, lastSnapshotAt: new Date().toISOString() }), "utf8");
  } finally {
    try { if (existsSync(archivePath)) unlinkSync(archivePath); } catch { }
  }
}

function normalizeIp(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function classifyNetworkError(error, fallback = "proxy_path_unverified") {
  const message = `${error?.message || ""}\n${error?.stderr || ""}`.toLowerCase();
  if (message.includes("407") || message.includes("proxy authentication") || message.includes("authentication required")) return "proxy_auth_407";
  if (message.includes("could not resolve proxy") || message.includes("could not resolve host") || message.includes("name or service not known")) return "proxy_dns_failed";
  if (message.includes("connection refused") || message.includes("econnrefused")) return "proxy_connection_refused";
  if (message.includes("timed out") || message.includes("timeout") || message.includes("etimedout")) return "proxy_tcp_timeout";
  if (message.includes("tunnel connection failed") || message.includes("connect tunnel failed") || message.includes("proxy connect aborted")) return "proxy_connect_denied";
  if (message.includes("certificate") || message.includes("ssl") || message.includes("tls")) return "proxy_tls_failed";
  if (message.includes("127.0.0.1") || message.includes("local relay") || message.includes("backend_relay")) return "local_relay_down";
  return fallback;
}

async function checkIpThroughPort(localPort) {
  if (!localPort) throw new Error("relay_unavailable");
  try {
    const { stdout } = await execFileAsync("curl.exe", [
      "--silent", "--show-error", "--fail", "--connect-timeout", "10", "--max-time", "20",
      "--proxy", `http://127.0.0.1:${localPort}`, "https://api.ipify.org?format=json",
    ], { windowsHide: true, timeout: 25_000, maxBuffer: 8_192 });
    const data = JSON.parse(stdout);
    if (typeof data.ip !== "string" || data.ip.length < 3 || data.ip.length > 64) throw new Error("invalid_ip_response");
    return data.ip.trim();
  } catch (error) {
    const category = classifyNetworkError(error);
    const wrapped = new Error(category);
    wrapped.cause = error;
    throw wrapped;
  }
}

async function checkIp() {
  if (!relayPort) throw new Error("local_relay_down");
  return checkIpThroughPort(relayPort);
}

async function verifyChromeProxyPath(executable, localPort, expectedIp) {
  if (browserProbeInProgress) throw new Error("browser_probe_busy");
  browserProbeInProgress = true;
  const probeProfile = mkdtempSync(join(tmpdir(), `h2ads-chrome-probe-${instanceId}-`));
  try {
    const { stdout } = await execFileAsync(executable, [
      "--headless=new", "--disable-gpu", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--metrics-recording-only",
      `--user-data-dir=${probeProfile}`, `--proxy-server=http://127.0.0.1:${localPort}`, "--proxy-bypass-list=<-loopback>",
      "--disable-quic", "--dns-prefetch-disable", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp", "--no-first-run", "--no-default-browser-check",
      "--dump-dom", "https://api.ipify.org?format=json",
    ], { windowsHide: true, timeout: CHROME_PROBE_TIMEOUT_MS, maxBuffer: 128_000 });
    const match = stdout.match(/"ip"\s*:\s*"([^"<>]+)"/i);
    if (!match) throw new Error("browser_probe_invalid_response");
    const browserIp = match[1].trim();
    if (expectedIp && normalizeIp(browserIp) !== normalizeIp(expectedIp)) throw new Error("exit_ip_mismatch");
    return browserIp;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "exit_ip_mismatch" || message === "browser_probe_invalid_response") throw error;
    const category = classifyNetworkError(error, "browser_proxy_probe_failed");
    const wrapped = new Error(category);
    wrapped.cause = error;
    throw wrapped;
  } finally {
    browserProbeInProgress = false;
    try { rmSync(probeProfile, { recursive: true, force: true }); } catch { }
  }
}

function writeSession(extra = {}) {
  let current = {};
  if (existsSync(sessionPath)) {
    try { current = JSON.parse(readFileSync(sessionPath, "utf8")); } catch { current = {}; }
  }
  writeFileSync(sessionPath, JSON.stringify({
    ...current,
    instanceId,
    instanceName,
    instanceWindowTitle,
    nodePid: process.pid,
    browserPid: browser?.pid ?? current.browserPid,
    rotationMinutes,
    relayArchitecture: "stable_front_dual_backend_v2",
    ...extra,
  }), { encoding: "utf8", mode: 0o600 });
}

async function privacyGuardPreflight(executable) {
  const observedIp = await checkIp();
  if (!observedIp) throw new Error("privacy_guard_proxy_unavailable");
  const browserObservedIp = await verifyChromeProxyPath(executable, relayPort, observedIp);
  writeSession({
    privacyGuard: "protected", privacyGuardCheckedAt: new Date().toISOString(), observedIp, browserObservedIp, browserProxyVerified: true,
    quicDisabled: true, dnsPrefetchDisabled: true, webrtcNonProxiedUdpDisabled: true, killSwitch: "armed", directBrowserEgress: "blocked_by_windows_firewall",
  });
  return { observedIp, browserObservedIp };
}

async function terminateBrowserProcess() {
  const pid = browser?.pid;
  if (!pid || browser?.exitCode !== null) return;
  try {
    await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: 10_000, maxBuffer: 8_192 });
  } catch {
    try { browser.kill("SIGKILL"); } catch { }
  }
}

async function closeRelay(server) {
  if (!server) return;
  await server.close(true).catch(() => undefined);
}

async function triggerKillSwitch(reason = "proxy_path_unverified") {
  if (killSwitchTriggered) return;
  killSwitchTriggered = true;
  if (rotationTimer) clearInterval(rotationTimer);
  if (ipTimer) clearInterval(ipTimer);
  if (killSwitchTimer) clearInterval(killSwitchTimer);
  if (privacyGuardTimer) clearInterval(privacyGuardTimer);
  writeSession({ privacyGuard: "blocked", killSwitch: "triggered", killSwitchReason: reason, killSwitchTriggeredAt: new Date().toISOString() });
  await closeRelay(frontRelay);
  await closeRelay(backendRelay);
  activeBackendPort = undefined;
  await terminateBrowserProcess();
}

async function reportObservedIp() {
  if (!browser || browser.exitCode !== null || !relayPort || rotationInProgress || ipCheckInProgress || killSwitchTriggered) return;
  ipCheckInProgress = true;
  try {
    const observedIp = await checkIp();
    const checkedAt = new Date().toISOString();
    writeSession({ observedIp, lastIpCheckedAt: checkedAt, killSwitch: "armed" });
    if (observedIp === lastReportedIp) return;
    await post(`/api/h2ads/worker/runs/${instanceId}/state`, { state: "browser_open", observedIp });
    lastReportedIp = observedIp;
    writeSession({ observedIp, lastIpReportedAt: checkedAt });
  } catch (error) {
    await triggerKillSwitch(error instanceof Error ? error.message : "proxy_path_unverified");
  } finally {
    ipCheckInProgress = false;
  }
}

async function enforceKillSwitch() {
  if (!browser || browser.exitCode !== null || !relayPort || rotationInProgress || killSwitchTriggered || killSwitchCheckInProgress || ipCheckInProgress) return;
  killSwitchCheckInProgress = true;
  try {
    await checkIp();
    writeSession({ killSwitch: "armed", killSwitchLastVerifiedAt: new Date().toISOString() });
  } catch (error) {
    await triggerKillSwitch(error instanceof Error ? error.message : "proxy_path_unverified");
  } finally {
    killSwitchCheckInProgress = false;
  }
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function createInstanceLabelPage() {
  const safeTitle = escapeHtml(instanceWindowTitle);
  const safeName = escapeHtml(instanceName);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>html,body{margin:0;min-height:100%;font-family:Arial,sans-serif;background:#0b1220;color:#e5eefc}main{min-height:100vh;display:grid;place-items:center;padding:32px;box-sizing:border-box}section{max-width:720px;text-align:center;border:1px solid #23324d;border-radius:20px;padding:32px;background:#101b2e}small{color:#7dd3fc;font-weight:700;letter-spacing:.14em}h1{font-size:32px;margin:12px 0}p{color:#a9bad3;margin:0}</style></head><body><main><section><small>H2 ADS · INSTANCIA LOCAL</small><h1>${safeName}</h1><p>Privacy Guard ativo. Esta aba serve somente para identificar esta janela.</p></section></main></body></html>`;
  writeFileSync(labelPagePath, html, { encoding: "utf8", mode: 0o600 });
  return pathToFileURL(labelPagePath).href;
}

function createGoogleSorryPrivacyGuard() {
  mkdirSync(privacyExtensionDirectory, { recursive: true });
  const blockedHtml = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>H2ADS · Conexao protegida</title><style>html,body{margin:0;min-height:100%;font-family:Arial,sans-serif;background:#0b1220;color:#e5eefc}main{min-height:100vh;display:grid;place-items:center;padding:32px;box-sizing:border-box}section{width:min(720px,100%);text-align:center;border:1px solid #23324d;border-radius:20px;padding:36px;background:#101b2e;box-sizing:border-box}small{color:#7dd3fc;font-weight:700;letter-spacing:.14em}h1{font-size:30px;margin:12px 0}p{color:#a9bad3;line-height:1.5;margin:0 auto;max-width:620px}.notice{margin-top:18px;border:1px solid #334155;background:#0b1526;border-radius:14px;padding:14px;text-align:left;color:#cbd5e1;font-size:14px;line-height:1.5}form{display:flex;gap:10px;margin-top:22px}input{min-width:0;flex:1;border:1px solid #334155;border-radius:12px;background:#07101d;color:#fff;padding:13px 14px;font-size:15px;outline:none}input:focus{border-color:#38bdf8}button{border:0;border-radius:12px;background:#f5b800;color:#171003;padding:0 20px;font-weight:800;cursor:pointer}a{display:inline-block;margin-top:16px;color:#7dd3fc;font-weight:700;text-decoration:none}@media(max-width:560px){form{flex-direction:column}button{padding:13px 18px}}</style></head><body><main><section><small>H2ADS · PRIVACY GUARD</small><h1>Google bloqueou esta conexao</h1><p>A pagina de verificacao foi ocultada para que os dados de rede da instancia nao fiquem expostos.</p><div class="notice">O H2ADS nao tenta contornar o reCAPTCHA. A rota atual foi mantida isolada. Voce pode continuar por outro mecanismo de pesquisa sem exibir dados da conexao.</div><form action="https://www.bing.com/search" method="get"><input name="q" type="search" autocomplete="off" placeholder="Digite sua pesquisa..." aria-label="Pesquisa alternativa"><button type="submit">Pesquisar</button></form><a href="https://www.bing.com/">Abrir mecanismo de pesquisa alternativo</a></section></main></body></html>`;
  const blockedPath = join(privacyExtensionDirectory, "blocked.html");
  writeFileSync(blockedPath, blockedHtml, { encoding: "utf8", mode: 0o600 });
  return pathToFileURL(blockedPath).href;
}

function isGoogleSorryUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    const googleHost = host === "google.com"
      || host.endsWith(".google.com")
      || host === "google.com.br"
      || host.endsWith(".google.com.br");
    return googleHost && (url.pathname === "/sorry" || url.pathname.startsWith("/sorry/"));
  } catch {
    return false;
  }
}

function readDevToolsPort() {
  const activePortPath = join(profileDirectory, "DevToolsActivePort");
  if (!existsSync(activePortPath)) return null;
  try {
    const [portLine] = readFileSync(activePortPath, "utf8").split(/\r?\n/);
    const port = Number(portLine);
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
  } catch {
    return null;
  }
}

async function navigateDevToolsTarget(webSocketDebuggerUrl, url) {
  if (!webSocketDebuggerUrl || typeof WebSocket !== "function") return false;
  return await new Promise((resolve) => {
    let settled = false;
    let socket;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try { socket?.close(); } catch { }
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), 2_500);
    timer.unref?.();
    try {
      socket = new WebSocket(webSocketDebuggerUrl);
      socket.addEventListener("open", () => {
        try {
          socket.send(JSON.stringify({ id: 1, method: "Page.navigate", params: { url } }));
        } catch {
          finish(false);
        }
      }, { once: true });
      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(String(event.data || ""));
          if (payload?.id === 1) {
            clearTimeout(timer);
            finish(!payload.error);
          }
        } catch { }
      });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        finish(false);
      }, { once: true });
    } catch {
      clearTimeout(timer);
      finish(false);
    }
  });
}

async function enforceGoogleSorryPrivacyGuard(blockedPageUrl) {
  if (privacyGuardCheckInProgress || !browser || browser.exitCode !== null) return;
  privacyGuardCheckInProgress = true;
  try {
    const port = readDevToolsPort();
    if (!port) return;
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) return;
    const targets = await response.json();
    if (!Array.isArray(targets)) return;
    for (const target of targets) {
      if (target?.type !== "page" || !isGoogleSorryUrl(target?.url)) continue;
      const blocked = await navigateDevToolsTarget(target.webSocketDebuggerUrl, blockedPageUrl);
      if (blocked) {
        writeSession({
          privacyGuard: "protected",
          googleSorryPrivacyGuard: "cdp_local_redirect_v1",
          googleSorryBlockedAt: new Date().toISOString(),
        });
      }
    }
  } catch {
    // Esta camada protege apenas a exibicao da pagina /sorry.
    // Proxy, firewall e validacao de rota continuam independentes.
  } finally {
    privacyGuardCheckInProgress = false;
  }
}

async function rotateRelay() {
  if (!frontRelay || !backendRelay || !relayPort || !activeBackendPort || rotationInProgress || killSwitchTriggered) return;
  rotationInProgress = true;
  const previousBackend = backendRelay;
  const previousBackendPort = activeBackendPort;
  let candidateBackend;
  let candidateActivated = false;
  try {
    candidateBackend = createBackendRelay();
    await candidateBackend.listen();
    const candidateIp = await checkIpThroughPort(candidateBackend.port);
    backendRelay = candidateBackend;
    activeBackendPort = candidateBackend.port;
    candidateActivated = true;
    const observedIp = await checkIp();
    if (normalizeIp(observedIp) !== normalizeIp(candidateIp)) throw new Error("exit_ip_mismatch");
    const executable = chromeExecutable();
    if (!executable) throw new Error("browser_not_found");
    const browserObservedIp = await verifyChromeProxyPath(executable, relayPort, observedIp);
    writeSession({
      lastRotationAt: new Date().toISOString(), observedIp, browserObservedIp,
      rotationChangedExitIp: lastReportedIp ? normalizeIp(observedIp) !== normalizeIp(lastReportedIp) : null,
      privacyGuard: "protected", killSwitch: "armed", rotationState: "verified",
    });
    await new Promise((resolve) => setTimeout(resolve, ROTATION_DRAIN_MS));
    await closeRelay(previousBackend);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "proxy_rotation_unverified";
    if (candidateActivated) {
      backendRelay = previousBackend;
      activeBackendPort = previousBackendPort;
    }
    if (candidateBackend && candidateBackend !== previousBackend) await closeRelay(candidateBackend);
    try {
      const fallbackIp = await checkIp();
      writeSession({ rotationState: "rolled_back", rotationFailure: reason, rotationFailureAt: new Date().toISOString(), observedIp: fallbackIp, privacyGuard: "protected", killSwitch: "armed" });
    } catch (fallbackError) {
      await triggerKillSwitch(fallbackError instanceof Error ? fallbackError.message : "proxy_rotation_unverified");
    }
  } finally {
    rotationInProgress = false;
  }
  if (!killSwitchTriggered) void reportObservedIp();
}

async function run() {
  try {
    const executable = chromeExecutable();
    if (!executable) throw new Error("browser_not_found");
    backendRelay = createBackendRelay();
    await backendRelay.listen();
    activeBackendPort = backendRelay.port;
    frontRelay = createFrontRelay();
    await frontRelay.listen();
    relayPort = frontRelay.port;
    const initial = await privacyGuardPreflight(executable);
    lastReportedIp = initial.observedIp;
    const labelPageUrl = createInstanceLabelPage();
    const privacyGuardPageUrl = createGoogleSorryPrivacyGuard();
    browser = spawn(executable, [
      `--user-data-dir=${profileDirectory}`, `--proxy-server=http://127.0.0.1:${relayPort}`, "--proxy-bypass-list=<-loopback>",
      "--disable-quic", "--dns-prefetch-disable", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check", labelPageUrl,
    ], { detached: false, stdio: "ignore", windowsHide: false });
    privacyGuardTimer = setInterval(() => { void enforceGoogleSorryPrivacyGuard(privacyGuardPageUrl); }, GOOGLE_SORRY_GUARD_INTERVAL_MS);
    privacyGuardTimer.unref?.();
    writeSession({
      startedAt: new Date().toISOString(), instanceLabelState: "static_tab", observedIp: initial.observedIp, browserObservedIp: initial.browserObservedIp,
      browserProxyVerified: true, privacyGuard: "protected", googleSorryPrivacyGuard: "cdp_local_redirect_v1", killSwitch: "armed", directBrowserEgress: "blocked_by_windows_firewall",
    });
    if (rotationMinutes) {
      rotationTimer = setInterval(() => { void rotateRelay(); }, rotationMinutes * 60_000);
      rotationTimer.unref?.();
    }
    await post(`/api/h2ads/worker/commands/${commandId}/result`, { command: "launch_browser", state: "browser_open" });
    await post(`/api/h2ads/worker/runs/${instanceId}/state`, { state: "browser_open", observedIp: initial.observedIp });
    ipTimer = setInterval(() => { void reportObservedIp(); }, IP_CHECK_INTERVAL_MS);
    ipTimer.unref?.();
    killSwitchTimer = setInterval(() => { void enforceKillSwitch(); }, KILL_SWITCH_CHECK_INTERVAL_MS);
    killSwitchTimer.unref?.();
    browser.once("exit", async () => {
      try {
        if (rotationTimer) clearInterval(rotationTimer);
        if (ipTimer) clearInterval(ipTimer);
        if (killSwitchTimer) clearInterval(killSwitchTimer);
        if (privacyGuardTimer) clearInterval(privacyGuardTimer);
        const manifestPath = join(profileDirectory, "h2ads-profile.json");
        const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { instanceId, profileVersion: 1 };
        writeFileSync(manifestPath, JSON.stringify({ ...manifest, lastClosedAt: new Date().toISOString() }), "utf8");
        await post(`/api/h2ads/worker/runs/${instanceId}/state`, { state: "closed" });
        await uploadProfileSnapshot().catch(() => undefined);
      } finally {
        await closeRelay(frontRelay);
        await closeRelay(backendRelay);
        activeBackendPort = undefined;
      }
    });
  } catch (error) {
    if (rotationTimer) clearInterval(rotationTimer);
    if (ipTimer) clearInterval(ipTimer);
    if (killSwitchTimer) clearInterval(killSwitchTimer);
    if (privacyGuardTimer) clearInterval(privacyGuardTimer);
    const reason = error instanceof Error ? error.message : "browser_launch_failed";
    writeSession({ privacyGuard: "blocked", killSwitch: "triggered", killSwitchReason: reason, privacyGuardFailureAt: new Date().toISOString() });
    const category = reason === "browser_not_found" ? "browser_not_found"
      : reason === "exit_ip_mismatch" ? "exit_ip_mismatch"
        : reason === "browser_probe_invalid_response" || reason === "browser_proxy_probe_failed" ? "browser_proxy_unverified"
          : reason.startsWith("privacy_guard_") ? "privacy_guard_blocked"
            : reason.startsWith("proxy_") || reason === "local_relay_down" ? reason
              : "browser_launch_failed";
    await post(`/api/h2ads/worker/commands/${commandId}/result`, { command: "launch_browser", state: "blocked", errorCategory: category }).catch(() => undefined);
    await closeRelay(frontRelay);
    await closeRelay(backendRelay);
    activeBackendPort = undefined;
    await terminateBrowserProcess();
  }
}

run();
