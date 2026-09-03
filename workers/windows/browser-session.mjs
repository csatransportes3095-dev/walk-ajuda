import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Server } from "proxy-chain";
import WebSocket from "ws";

const execFileAsync = promisify(execFile);
const IP_CHECK_INTERVAL_MS = 10_000;
const KILL_SWITCH_CHECK_INTERVAL_MS = 2_000;
const NAVIGATION_GUARD_INTERVAL_MS = 1_000;
const FIREFOX_BIDI_CONNECT_TIMEOUT_MS = 1_200;
const FIREFOX_BIDI_STARTUP_TIMEOUT_MS = 12_000;
const FIREFOX_GUARD_FAILURE_LIMIT = 3;
const required = ["H2ADS_PANEL_URL", "H2ADS_WORKER_KEY", "H2ADS_WORKER_TOKEN", "H2ADS_INSTANCE_ID", "H2ADS_COMMAND_ID", "H2ADS_PROXY_JSON", "H2ADS_PROFILE_DIRECTORY", "H2ADS_BROWSER_EXECUTABLE"];
if (required.some((key) => !process.env[key])) process.exit(2);

const panelUrl = process.env.H2ADS_PANEL_URL;
const workerKey = process.env.H2ADS_WORKER_KEY;
const workerToken = process.env.H2ADS_WORKER_TOKEN;
const instanceId = Number(process.env.H2ADS_INSTANCE_ID);
const commandId = Number(process.env.H2ADS_COMMAND_ID);
const profileDirectory = process.env.H2ADS_PROFILE_DIRECTORY;
const browserExecutable = process.env.H2ADS_BROWSER_EXECUTABLE;
const browserEngine = process.env.H2ADS_BROWSER_ENGINE === "firefox" ? "firefox" : "chrome";
const proxy = JSON.parse(process.env.H2ADS_PROXY_JSON);
const sessionPath = join(profileDirectory, "h2ads-browser-session.json");
const labelPagePath = join(profileDirectory, "h2ads-instance-label.html");
const privacyExtensionDirectory = join(profileDirectory, "h2ads-privacy-extension");
const instanceName = String(proxy.instanceName || `Instancia ${instanceId}`).trim().slice(0, 128);
const instanceWindowTitle = `H2ADS | ${instanceName}`;
const parsedRotationMinutes = Number(proxy.rotationMinutes);
const rotationMinutes = Number.isInteger(parsedRotationMinutes) && parsedRotationMinutes >= 1 && parsedRotationMinutes <= 1_440 ? parsedRotationMinutes : null;

let relay;
let relayPort;
let browser;
let rotationTimer;
let ipTimer;
let killSwitchTimer;
let navigationGuardTimer;
let rotationInProgress = false;
let lastReportedIp = null;
let ipCheckInProgress = false;
let killSwitchCheckInProgress = false;
let killSwitchTriggered = false;
let firefoxRemotePort = null;
let firefoxBidiSocket = null;
let firefoxBidiReady = false;
let firefoxBidiConnecting = null;
let firefoxBidiRequestId = 0;
let firefoxNavigationGuardFailures = 0;
const firefoxBidiPending = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isGoogleSorryUrl(value) {
  return /^https?:\/\/(?:[^/]+\.)?google\.(?:com|com\.br)\/sorry(?:[/?#]|$)/i.test(typeof value === "string" ? value : "");
}

async function allocateLoopbackPort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (!Number.isInteger(port) || port < 1 || port > 65535) reject(new Error("firefox_remote_port_unavailable"));
        else resolve(port);
      });
    });
  });
}

function rejectFirefoxBidiPending(error) {
  for (const pending of firefoxBidiPending.values()) {
    clearTimeout(pending.timer);
    pending.reject(error);
  }
  firefoxBidiPending.clear();
}

function closeFirefoxBidi() {
  const socket = firefoxBidiSocket;
  firefoxBidiSocket = null;
  firefoxBidiReady = false;
  firefoxBidiConnecting = null;
  rejectFirefoxBidiPending(new Error("firefox_bidi_closed"));
  if (!socket) return;
  try {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.terminate();
  } catch { }
}

function handleFirefoxBidiMessage(data) {
  let message;
  try { message = JSON.parse(String(data)); } catch { return; }
  if (!Number.isInteger(message?.id)) return;
  const pending = firefoxBidiPending.get(message.id);
  if (!pending) return;
  firefoxBidiPending.delete(message.id);
  clearTimeout(pending.timer);
  if (message.type === "error" || message.error) pending.reject(new Error(String(message.message || message.error || "firefox_bidi_error")));
  else pending.resolve(message.result);
}

function sendFirefoxBidiCommand(method, params, timeoutMs = 1_000) {
  const socket = firefoxBidiSocket;
  if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("firefox_bidi_not_connected"));
  const id = ++firefoxBidiRequestId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      firefoxBidiPending.delete(id);
      reject(new Error("firefox_bidi_timeout"));
    }, timeoutMs);
    firefoxBidiPending.set(id, { resolve, reject, timer });
    try {
      socket.send(JSON.stringify({ id, method, params }));
    } catch (error) {
      clearTimeout(timer);
      firefoxBidiPending.delete(id);
      reject(error);
    }
  });
}

async function connectFirefoxBidi() {
  if (firefoxBidiReady && firefoxBidiSocket?.readyState === WebSocket.OPEN) return;
  if (firefoxBidiConnecting) return firefoxBidiConnecting;
  if (!Number.isInteger(firefoxRemotePort)) throw new Error("firefox_remote_port_unavailable");

  firefoxBidiConnecting = new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${firefoxRemotePort}/session`, { handshakeTimeout: FIREFOX_BIDI_CONNECT_TIMEOUT_MS });
    let opened = false;
    const failBeforeOpen = (error) => {
      if (opened) return;
      try { socket.terminate(); } catch { }
      reject(error instanceof Error ? error : new Error("firefox_bidi_connect_failed"));
    };
    socket.once("error", failBeforeOpen);
    socket.once("open", async () => {
      opened = true;
      firefoxBidiSocket = socket;
      socket.on("message", handleFirefoxBidiMessage);
      socket.on("close", () => {
        if (firefoxBidiSocket !== socket) return;
        firefoxBidiSocket = null;
        firefoxBidiReady = false;
        rejectFirefoxBidiPending(new Error("firefox_bidi_disconnected"));
      });
      socket.on("error", () => undefined);
      try {
        await sendFirefoxBidiCommand("session.new", { capabilities: { alwaysMatch: {} } }, FIREFOX_BIDI_CONNECT_TIMEOUT_MS);
        firefoxBidiReady = true;
        resolve();
      } catch (error) {
        if (firefoxBidiSocket === socket) firefoxBidiSocket = null;
        firefoxBidiReady = false;
        try { socket.terminate(); } catch { }
        reject(error);
      }
    });
  });

  try {
    await firefoxBidiConnecting;
  } finally {
    firefoxBidiConnecting = null;
  }
}

async function waitForFirefoxNavigationGuard() {
  const deadline = Date.now() + FIREFOX_BIDI_STARTUP_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    if (!browser || browser.exitCode !== null) throw new Error("firefox_browser_exited_before_guard");
    try {
      await connectFirefoxBidi();
      const tree = await sendFirefoxBidiCommand("browsingContext.getTree", {}, FIREFOX_BIDI_CONNECT_TIMEOUT_MS);
      if (Array.isArray(tree?.contexts)) return;
      lastError = new Error("firefox_bidi_contexts_unavailable");
    } catch (error) {
      lastError = error;
      closeFirefoxBidi();
    }
    await sleep(250);
  }
  throw new Error(lastError instanceof Error ? `firefox_navigation_guard_unavailable:${lastError.message}` : "firefox_navigation_guard_unavailable");
}

function firefoxContextContainsGoogleSorry(contexts) {
  if (!Array.isArray(contexts)) return false;
  for (const context of contexts) {
    if (isGoogleSorryUrl(context?.url)) return true;
    if (firefoxContextContainsGoogleSorry(context?.children)) return true;
  }
  return false;
}

function upstreamUrl() {
  const protocol = proxy.protocol === "socks5" ? "socks5" : proxy.protocol === "https" ? "https" : "http";
  return `${protocol}://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.host}:${proxy.port}`;
}

function createRelay(port = 0) {
  return new Server({ host: "127.0.0.1", port, verbose: false, prepareRequestFunction: () => ({ upstreamProxyUrl: upstreamUrl() }) });
}

function selectedBrowserExecutable() {
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

async function checkIp() {
  if (!relayPort) throw new Error("relay_unavailable");
  const { stdout } = await execFileAsync("curl.exe", ["--silent", "--show-error", "--fail", "--max-time", "20", "--proxy", `http://127.0.0.1:${relayPort}`, "https://api.ipify.org?format=json"], { windowsHide: true, timeout: 25_000, maxBuffer: 8_192 });
  const data = JSON.parse(stdout);
  if (typeof data.ip !== "string" || data.ip.length < 3 || data.ip.length > 64) throw new Error("invalid_ip_response");
  return data.ip.trim();
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
    ...extra,
  }), { encoding: "utf8", mode: 0o600 });
}

async function privacyGuardPreflight() {
  const observedIp = await checkIp();
  if (!observedIp) throw new Error("privacy_guard_proxy_unavailable");
  writeSession({
    privacyGuard: "protected",
    privacyGuardCheckedAt: new Date().toISOString(),
    observedIp,
    quicDisabled: true,
    dnsPrefetchDisabled: true,
    webrtcNonProxiedUdpDisabled: true,
    killSwitch: "armed",
    directBrowserEgress: "blocked_by_windows_firewall",
  });
  return observedIp;
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

async function triggerKillSwitch(reason = "proxy_path_unverified") {
  if (killSwitchTriggered) return;
  killSwitchTriggered = true;
  if (rotationTimer) clearInterval(rotationTimer);
  if (ipTimer) clearInterval(ipTimer);
  if (killSwitchTimer) clearInterval(killSwitchTimer);
  if (navigationGuardTimer) clearInterval(navigationGuardTimer);
  closeFirefoxBidi();
  writeSession({ privacyGuard: "blocked", killSwitch: "triggered", killSwitchReason: reason, killSwitchTriggeredAt: new Date().toISOString() });
  await post(`/api/h2ads/worker/runs/${instanceId}/state`, { state: "blocked", errorCategory: reason }).catch(() => undefined);
  if (relay) await relay.close(true).catch(() => undefined);
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
  } catch {
    await triggerKillSwitch("proxy_path_unverified");
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
  } catch {
    await triggerKillSwitch("proxy_path_unverified");
  } finally {
    killSwitchCheckInProgress = false;
  }
}

async function enforceNavigationGuard() {
  if (!browser || browser.exitCode !== null || killSwitchTriggered) return;
  try {
    if (browserEngine === "firefox") {
      await connectFirefoxBidi();
      const tree = await sendFirefoxBidiCommand("browsingContext.getTree", {}, 900);
      firefoxNavigationGuardFailures = 0;
      if (firefoxContextContainsGoogleSorry(tree?.contexts)) await triggerKillSwitch("google_sorry_detected");
      return;
    }

    const portFile = join(profileDirectory, "DevToolsActivePort");
    if (!existsSync(portFile)) return;
    const [portLine] = readFileSync(portFile, "utf8").split(/\r?\n/);
    const port = Number(portLine);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return;
    const response = await fetch("http://127.0.0.1:" + port + "/json/list", { signal: AbortSignal.timeout(800) });
    if (!response.ok) return;
    const targets = await response.json();
    const blocked = Array.isArray(targets) && targets.some((target) => isGoogleSorryUrl(target?.url));
    if (blocked) await triggerKillSwitch("google_sorry_detected");
  } catch {
    if (browserEngine !== "firefox" || killSwitchTriggered) return;
    firefoxNavigationGuardFailures += 1;
    if (firefoxNavigationGuardFailures >= FIREFOX_GUARD_FAILURE_LIMIT) {
      await triggerKillSwitch("firefox_navigation_guard_unavailable");
    }
  }
}

function configureFirefoxProfile() {
  const preferences = [
    'user_pref("network.proxy.type", 1);',
    'user_pref("network.proxy.http", "127.0.0.1");',
    'user_pref("network.proxy.http_port", ' + relayPort + ');',
    'user_pref("network.proxy.ssl", "127.0.0.1");',
    'user_pref("network.proxy.ssl_port", ' + relayPort + ');',
    'user_pref("network.proxy.no_proxies_on", "localhost, 127.0.0.1");',
    'user_pref("media.peerconnection.enabled", false);',
    'user_pref("network.dns.disablePrefetch", true);',
    'user_pref("network.predictor.enabled", false);',
    'user_pref("network.prefetch-next", false);',
    'user_pref("network.http.speculative-parallel-limit", 0);',
    'user_pref("network.proxy.socks_remote_dns", true);',
  ];
  writeFileSync(join(profileDirectory, "user.js"), preferences.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
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
  const manifest = {
    manifest_version: 3,
    name: "H2ADS Privacy Guard",
    version: "1.2.0",
    description: "Oculta paginas de bloqueio que exibem informacoes de rede.",
    permissions: ["declarativeNetRequest"],
    host_permissions: ["*://google.com/*", "*://*.google.com/*", "*://google.com.br/*", "*://*.google.com.br/*"],
    web_accessible_resources: [{ resources: ["blocked.html"], matches: ["*://google.com/*", "*://*.google.com/*", "*://google.com.br/*", "*://*.google.com.br/*"] }],
    declarative_net_request: { rule_resources: [{ id: "privacy_rules", enabled: true, path: "rules.json" }] },
  };
  const rules = [
    { id: 1, priority: 100, action: { type: "redirect", redirect: { extensionPath: "/blocked.html" } }, condition: { regexFilter: "^https?://([^/]+\\.)?google\\.com/sorry(?:[/?#].*)?$", resourceTypes: ["main_frame"] } },
    { id: 2, priority: 100, action: { type: "redirect", redirect: { extensionPath: "/blocked.html" } }, condition: { regexFilter: "^https?://([^/]+\\.)?google\\.com\\.br/sorry(?:[/?#].*)?$", resourceTypes: ["main_frame"] } },
  ];
  const blockedHtml = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>H2ADS · Conexao protegida</title><style>html,body{margin:0;min-height:100%;font-family:Arial,sans-serif;background:#0b1220;color:#e5eefc}main{min-height:100vh;display:grid;place-items:center;padding:32px;box-sizing:border-box}section{width:min(720px,100%);text-align:center;border:1px solid #23324d;border-radius:20px;padding:36px;background:#101b2e;box-sizing:border-box}small{color:#7dd3fc;font-weight:700;letter-spacing:.14em}h1{font-size:30px;margin:12px 0}p{color:#a9bad3;line-height:1.5;margin:0 auto;max-width:620px}.notice{margin-top:18px;border:1px solid #334155;background:#0b1526;border-radius:14px;padding:14px;text-align:left;color:#cbd5e1;font-size:14px;line-height:1.5}form{display:flex;gap:10px;margin-top:22px}input{min-width:0;flex:1;border:1px solid #334155;border-radius:12px;background:#07101d;color:#fff;padding:13px 14px;font-size:15px;outline:none}input:focus{border-color:#38bdf8}button{border:0;border-radius:12px;background:#f5b800;color:#171003;padding:0 20px;font-weight:800;cursor:pointer}a{display:inline-block;margin-top:16px;color:#7dd3fc;font-weight:700;text-decoration:none}@media(max-width:560px){form{flex-direction:column}button{padding:13px 18px}}</style></head><body><main><section><small>H2ADS · PRIVACY GUARD</small><h1>Google bloqueou esta conexao</h1><p>A pagina de verificacao foi ocultada para que os dados de rede da instancia nao fiquem expostos.</p><div class="notice">O H2ADS nao tenta contornar o reCAPTCHA. A rota atual foi mantida isolada. Voce pode continuar por outro mecanismo de pesquisa sem exibir dados da conexao.</div><form action="https://www.bing.com/search" method="get"><input name="q" type="search" autocomplete="off" placeholder="Digite sua pesquisa..." aria-label="Pesquisa alternativa"><button type="submit">Pesquisar</button></form><a href="https://www.bing.com/">Abrir mecanismo de pesquisa alternativo</a></section></main></body></html>`;
  writeFileSync(join(privacyExtensionDirectory, "manifest.json"), JSON.stringify(manifest, null, 2), { encoding: "utf8", mode: 0o600 });
  writeFileSync(join(privacyExtensionDirectory, "rules.json"), JSON.stringify(rules, null, 2), { encoding: "utf8", mode: 0o600 });
  writeFileSync(join(privacyExtensionDirectory, "blocked.html"), blockedHtml, { encoding: "utf8", mode: 0o600 });
  return privacyExtensionDirectory;
}

async function rotateRelay() {
  if (!relay || !relayPort || rotationInProgress || killSwitchTriggered) return;
  rotationInProgress = true;
  try {
    const previousRelay = relay;
    await previousRelay.close(true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const nextRelay = createRelay(relayPort);
    await nextRelay.listen();
    relay = nextRelay;
    const observedIp = await checkIp();
    writeSession({ lastRotationAt: new Date().toISOString(), observedIp, privacyGuard: "protected", killSwitch: "armed" });
  } catch {
    await triggerKillSwitch("proxy_rotation_unverified");
  } finally {
    rotationInProgress = false;
  }
  if (!killSwitchTriggered) void reportObservedIp();
}

async function run() {
  try {
    const executable = selectedBrowserExecutable();
    if (!executable) throw new Error("browser_not_found");
    relay = createRelay();
    await relay.listen();
    relayPort = relay.port;
    const initialIp = await privacyGuardPreflight();
    lastReportedIp = initialIp;
    const labelPageUrl = createInstanceLabelPage();
    if (browserEngine === "firefox") {
      configureFirefoxProfile();
      firefoxRemotePort = await allocateLoopbackPort();
      browser = spawn(executable, ["-profile", profileDirectory, "-new-instance", "--remote-debugging-port", String(firefoxRemotePort), labelPageUrl], { detached: false, stdio: "ignore", windowsHide: false });
      await waitForFirefoxNavigationGuard();
    } else {
      const privacyGuardExtension = createGoogleSorryPrivacyGuard();
      browser = spawn(executable, [
        "--user-data-dir=" + profileDirectory,
        "--proxy-server=http://127.0.0.1:" + relayPort,
        "--proxy-bypass-list=<-loopback>",
        "--disable-quic",
        "--dns-prefetch-disable",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        "--remote-debugging-address=127.0.0.1",
        "--remote-debugging-port=0",
        "--load-extension=" + privacyGuardExtension,
        "--no-first-run",
        "--no-default-browser-check",
        labelPageUrl,
      ], { detached: false, stdio: "ignore", windowsHide: false });
    }
    writeSession({ startedAt: new Date().toISOString(), browserEngine, instanceLabelState: "static_tab", observedIp: initialIp, privacyGuard: "protected", googleSorryPrivacyGuard: browserEngine === "chrome" ? "extension_plus_devtools_guard" : "webdriver_bidi_guard_plus_firewall_plus_route_guard", navigationGuard: "armed", firefoxRemotePort: browserEngine === "firefox" ? firefoxRemotePort : null, killSwitch: "armed", directBrowserEgress: "blocked_by_windows_firewall" });
    if (rotationMinutes) {
      rotationTimer = setInterval(() => { void rotateRelay(); }, rotationMinutes * 60_000);
      rotationTimer.unref?.();
    }
    await post(`/api/h2ads/worker/commands/${commandId}/result`, { command: "launch_browser", state: "browser_open" });
    await post(`/api/h2ads/worker/runs/${instanceId}/state`, { state: "browser_open", observedIp: initialIp });
    ipTimer = setInterval(() => { void reportObservedIp(); }, IP_CHECK_INTERVAL_MS);
    ipTimer.unref?.();
    killSwitchTimer = setInterval(() => { void enforceKillSwitch(); }, KILL_SWITCH_CHECK_INTERVAL_MS);
    killSwitchTimer.unref?.();
    navigationGuardTimer = setInterval(() => { void enforceNavigationGuard(); }, NAVIGATION_GUARD_INTERVAL_MS);
    navigationGuardTimer.unref?.();
    browser.once("exit", async () => {
      try {
        if (rotationTimer) clearInterval(rotationTimer);
        if (ipTimer) clearInterval(ipTimer);
        if (killSwitchTimer) clearInterval(killSwitchTimer);
        if (navigationGuardTimer) clearInterval(navigationGuardTimer);
        closeFirefoxBidi();
        const manifestPath = join(profileDirectory, "h2ads-profile.json");
        const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { instanceId, profileVersion: 1 };
        writeFileSync(manifestPath, JSON.stringify({ ...manifest, lastClosedAt: new Date().toISOString() }), "utf8");
        if (!killSwitchTriggered) await post(`/api/h2ads/worker/runs/${instanceId}/state`, { state: "closed" });
        if (browserEngine === "chrome") await uploadProfileSnapshot().catch(() => undefined);
      } finally {
        if (relay) await relay.close(true).catch(() => undefined);
      }
    });
  } catch (error) {
    if (rotationTimer) clearInterval(rotationTimer);
    if (ipTimer) clearInterval(ipTimer);
    if (killSwitchTimer) clearInterval(killSwitchTimer);
    if (navigationGuardTimer) clearInterval(navigationGuardTimer);
    closeFirefoxBidi();
    writeSession({ privacyGuard: "blocked", killSwitch: "triggered", privacyGuardFailureAt: new Date().toISOString(), privacyGuardFailure: error instanceof Error ? error.message.slice(0, 160) : "unknown" });
    const category = error instanceof Error && error.message === "browser_not_found" ? "browser_not_found" : error instanceof Error && error.message.startsWith("privacy_guard_") ? "privacy_guard_blocked" : error instanceof Error && error.message.startsWith("firefox_navigation_guard_") ? "firefox_navigation_guard_unavailable" : "browser_launch_failed";
    await post(`/api/h2ads/worker/commands/${commandId}/result`, { command: "launch_browser", state: "blocked", errorCategory: category }).catch(() => undefined);
    if (relay) await relay.close(true).catch(() => undefined);
    await terminateBrowserProcess();
  }
}

run();
