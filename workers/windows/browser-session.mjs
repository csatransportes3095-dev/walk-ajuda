import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Server } from "proxy-chain";

const execFileAsync = promisify(execFile);
const IP_CHECK_INTERVAL_MS = 15_000;
const required = ["H2ADS_PANEL_URL", "H2ADS_WORKER_KEY", "H2ADS_WORKER_TOKEN", "H2ADS_INSTANCE_ID", "H2ADS_COMMAND_ID", "H2ADS_PROXY_JSON", "H2ADS_PROFILE_DIRECTORY"];
if (required.some((key) => !process.env[key])) process.exit(2);

const panelUrl = process.env.H2ADS_PANEL_URL;
const workerKey = process.env.H2ADS_WORKER_KEY;
const workerToken = process.env.H2ADS_WORKER_TOKEN;
const instanceId = Number(process.env.H2ADS_INSTANCE_ID);
const commandId = Number(process.env.H2ADS_COMMAND_ID);
const profileDirectory = process.env.H2ADS_PROFILE_DIRECTORY;
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
let rotationInProgress = false;
let lastReportedIp = null;
let ipCheckInProgress = false;

function upstreamUrl() {
  const protocol = proxy.protocol === "socks5" ? "socks5" : proxy.protocol === "https" ? "https" : "http";
  return `${protocol}://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.host}:${proxy.port}`;
}

function createRelay(port = 0) {
  return new Server({ host: "127.0.0.1", port, verbose: false, prepareRequestFunction: () => ({ upstreamProxyUrl: upstreamUrl() }) });
}

function chromeExecutable() {
  const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
  const candidates = roots.map((root) => join(root, "Google", "Chrome", "Application", "chrome.exe"));
  return candidates.find(existsSync);
}

function headers() {
  return { Authorization: `Bearer ${workerToken}`, "X-H2ADS-Worker-Key": workerKey, "Content-Type": "application/json" };
}

async function post(path, body) {
  const response = await fetch(`${panelUrl.replace(/\/$/, "")}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`panel_http_${response.status}`);
}

async function checkIp() {
  if (!relayPort) throw new Error("relay_unavailable");
  const { stdout } = await execFileAsync("curl.exe", ["--silent", "--show-error", "--fail", "--max-time", "20", "--proxy", `http://127.0.0.1:${relayPort}`, "https://api.ipify.org?format=json"], { windowsHide: true, timeout: 25_000, maxBuffer: 8_192 });
  const data = JSON.parse(stdout);
  if (typeof data.ip !== "string" || data.ip.length < 3 || data.ip.length > 64) throw new Error("invalid_ip_response");
  return data.ip.trim();
}

async function privacyGuardPreflight() {
  const observedIp = await checkIp();
  if (!observedIp) throw new Error("privacy_guard_proxy_unavailable");
  writeSession({
    privacyGuard: "protected",
    privacyGuardCheckedAt: new Date().toISOString(),
    observedIp,
    quicDisabled: true,
    webrtcNonProxiedUdpDisabled: true,
  });
  return observedIp;
}

async function reportObservedIp() {
  if (!browser || browser.exitCode !== null || !relayPort || rotationInProgress || ipCheckInProgress) return;
  ipCheckInProgress = true;
  try {
    const observedIp = await checkIp();
    const checkedAt = new Date().toISOString();
    writeSession({ observedIp, lastIpCheckedAt: checkedAt });
    if (observedIp === lastReportedIp) return;
    await post(`/api/h2ads/worker/runs/${instanceId}/state`, { state: "browser_open", observedIp });
    lastReportedIp = observedIp;
    writeSession({ observedIp, lastIpReportedAt: checkedAt });
  } catch {
    // A medicao de IP e auxiliar e nunca deve derrubar a sessao ativa.
  } finally {
    ipCheckInProgress = false;
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
    ...extra,
  }), { encoding: "utf8", mode: 0o600 });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
    version: "1.0.0",
    description: "Oculta paginas de bloqueio que exibem informacoes de rede.",
    permissions: ["declarativeNetRequest"],
    host_permissions: [
      "*://*.google.com/*",
      "*://*.google.com.br/*",
    ],
    declarative_net_request: {
      rule_resources: [{ id: "privacy_rules", enabled: true, path: "rules.json" }],
    },
  };

  const rules = [
    {
      id: 1,
      priority: 100,
      action: { type: "redirect", redirect: { extensionPath: "/blocked.html" } },
      condition: {
        regexFilter: "^https?://([^/]+\\.)?google\\.com/sorry(?:[/?#].*)?$",
        resourceTypes: ["main_frame"],
      },
    },
    {
      id: 2,
      priority: 100,
      action: { type: "redirect", redirect: { extensionPath: "/blocked.html" } },
      condition: {
        regexFilter: "^https?://([^/]+\\.)?google\\.com\\.br/sorry(?:[/?#].*)?$",
        resourceTypes: ["main_frame"],
      },
    },
  ];

  const blockedHtml = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>H2ADS · Protecao de rede</title><style>html,body{margin:0;min-height:100%;font-family:Arial,sans-serif;background:#0b1220;color:#e5eefc}main{min-height:100vh;display:grid;place-items:center;padding:32px;box-sizing:border-box}section{max-width:700px;text-align:center;border:1px solid #23324d;border-radius:20px;padding:36px;background:#101b2e}small{color:#7dd3fc;font-weight:700;letter-spacing:.14em}h1{font-size:30px;margin:12px 0}p{color:#a9bad3;line-height:1.5;margin:0}</style></head><body><main><section><small>H2ADS · PRIVACY GUARD</small><h1>Conexao em verificacao</h1><p>Esta pagina foi ocultada para proteger os dados de rede da instancia. Nenhum endereco IP, usuario, senha, host ou porta do proxy e exibido aqui.</p></section></main></body></html>`;

  writeFileSync(join(privacyExtensionDirectory, "manifest.json"), JSON.stringify(manifest, null, 2), { encoding: "utf8", mode: 0o600 });
  writeFileSync(join(privacyExtensionDirectory, "rules.json"), JSON.stringify(rules, null, 2), { encoding: "utf8", mode: 0o600 });
  writeFileSync(join(privacyExtensionDirectory, "blocked.html"), blockedHtml, { encoding: "utf8", mode: 0o600 });
  return privacyExtensionDirectory;
}

async function rotateRelay() {
  if (!relay || !relayPort || rotationInProgress) return;
  rotationInProgress = true;
  try {
    const previousRelay = relay;
    await previousRelay.close(true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const nextRelay = createRelay(relayPort);
    await nextRelay.listen();
    relay = nextRelay;
    const observedIp = await checkIp();
    writeSession({ lastRotationAt: new Date().toISOString(), observedIp, privacyGuard: "protected" });
  } catch {
    writeSession({ privacyGuard: "blocked", privacyGuardFailureAt: new Date().toISOString() });
    try {
      const recoveryRelay = createRelay(relayPort);
      await recoveryRelay.listen();
      relay = recoveryRelay;
    } catch { }
  } finally {
    rotationInProgress = false;
  }
  void reportObservedIp();
}

async function run() {
  try {
    const executable = chromeExecutable();
    if (!executable) throw new Error("browser_not_found");
    relay = createRelay();
    await relay.listen();
    relayPort = relay.port;

    // Fail closed: o Chrome so nasce depois que a saida pelo relay/proxy foi comprovada.
    const initialIp = await privacyGuardPreflight();
    lastReportedIp = initialIp;
    const labelPageUrl = createInstanceLabelPage();
    const privacyGuardExtension = createGoogleSorryPrivacyGuard();
    browser = spawn(executable, [
      `--user-data-dir=${profileDirectory}`,
      `--proxy-server=http://127.0.0.1:${relayPort}`,
      "--proxy-bypass-list=<-loopback>",
      "--disable-quic",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      `--load-extension=${privacyGuardExtension}`,
      "--no-first-run",
      "--no-default-browser-check",
      labelPageUrl,
    ], { detached: false, stdio: "ignore", windowsHide: false });
    writeSession({ startedAt: new Date().toISOString(), instanceLabelState: "static_tab", observedIp: initialIp, privacyGuard: "protected", googleSorryPrivacyGuard: "enabled" });
    if (rotationMinutes) {
      rotationTimer = setInterval(() => { void rotateRelay(); }, rotationMinutes * 60_000);
      rotationTimer.unref?.();
    }
    await post(`/api/h2ads/worker/commands/${commandId}/result`, { command: "launch_browser", state: "browser_open" });
    await post(`/api/h2ads/worker/runs/${instanceId}/state`, { state: "browser_open", observedIp: initialIp });
    ipTimer = setInterval(() => { void reportObservedIp(); }, IP_CHECK_INTERVAL_MS);
    ipTimer.unref?.();
    browser.once("exit", async () => {
      try {
        if (rotationTimer) clearInterval(rotationTimer);
        if (ipTimer) clearInterval(ipTimer);
        const manifestPath = join(profileDirectory, "h2ads-profile.json");
        const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { instanceId, profileVersion: 1 };
        writeFileSync(manifestPath, JSON.stringify({ ...manifest, lastClosedAt: new Date().toISOString() }), "utf8");
        await post(`/api/h2ads/worker/runs/${instanceId}/state`, { state: "closed" });
      } finally {
        if (relay) await relay.close(true).catch(() => undefined);
      }
    });
  } catch (error) {
    if (rotationTimer) clearInterval(rotationTimer);
    if (ipTimer) clearInterval(ipTimer);
    writeSession({ privacyGuard: "blocked", privacyGuardFailureAt: new Date().toISOString() });
    const category = error instanceof Error && error.message === "browser_not_found" ? "browser_not_found" : error instanceof Error && error.message.startsWith("privacy_guard_") ? "privacy_guard_blocked" : "browser_launch_failed";
    await post(`/api/h2ads/worker/commands/${commandId}/result`, { command: "launch_browser", state: "blocked", errorCategory: category }).catch(() => undefined);
    if (relay) await relay.close(true).catch(() => undefined);
  }
}

run();
