import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Server } from "proxy-chain";

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
const devToolsActivePortPath = join(profileDirectory, "DevToolsActivePort");
const instanceName = String(proxy.instanceName || `Instancia ${instanceId}`).trim().slice(0, 128);
const instanceWindowTitle = `H2ADS | ${instanceName}`;
const parsedRotationMinutes = Number(proxy.rotationMinutes);
const rotationMinutes = Number.isInteger(parsedRotationMinutes) && parsedRotationMinutes >= 1 && parsedRotationMinutes <= 1_440 ? parsedRotationMinutes : null;

let relay;
let relayPort;
let browser;
let rotationTimer;
let titlePollTimer;
let rotationInProgress = false;
const titleSockets = new Map();

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
  await fetch(`${panelUrl.replace(/\/$/, "")}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
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

function titleInjectionSource() {
  const label = JSON.stringify(instanceWindowTitle);
  return `(() => {
    const label = ${label};
    const apply = () => {
      if (document.title !== label) document.title = label;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document, { subtree: true, childList: true, characterData: true });
    setInterval(apply, 750);
  })();`;
}

function attachTitleSocket(target) {
  if (!target?.id || !target?.webSocketDebuggerUrl || titleSockets.has(target.id)) return;
  try {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    titleSockets.set(target.id, socket);
    socket.addEventListener("open", () => {
      try {
        socket.send(JSON.stringify({ id: 1, method: "Page.addScriptToEvaluateOnNewDocument", params: { source: titleInjectionSource() } }));
        socket.send(JSON.stringify({ id: 2, method: "Runtime.evaluate", params: { expression: titleInjectionSource(), awaitPromise: false } }));
        writeSession({ instanceLabelState: "active", instanceLabelUpdatedAt: new Date().toISOString() });
      } catch { }
    });
    socket.addEventListener("close", () => {
      if (titleSockets.get(target.id) === socket) titleSockets.delete(target.id);
    });
    socket.addEventListener("error", () => {
      try { socket.close(); } catch { }
    });
  } catch { }
}

async function refreshInstanceTitles() {
  if (!browser || browser.exitCode !== null || !existsSync(devToolsActivePortPath)) return;
  try {
    const [portText] = readFileSync(devToolsActivePort, "utf8").split(/\r\n?\/n);
    const port = Number(portText);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) return;
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!response.ok) return;
    const targets = await response.json();
    if (!Array.isArray(targets)) return;
    const liveTargetIds = new Set();
    for (const target of targets) {
      if (target?.type !== "page" || !target.id) continue;
      liveTargetIds.add(target.id);
      attachTitleSocket(target);
    }
    for (const [targetId, socket] of titleSockets.entries()) {
      if (liveTargetIds.has(targetId)) continue;
      titleSockets.delete(targetId);
      try { socket.close(); } catch { }
    }
  } catch { }
}

function startInstanceTitleController() {
  void refreshInstanceTitles();
  titlePollTimer = setInterval(() => { void refreshInstanceTitles(); }, 1_000);
  titlePollTimer.unref?.();
}

function stopInstanceTitleController() {
  if (titlePollTimer) clearInterval(titlePollTimer);
  titlePollTimer = undefined;
  for (const socket of titleSockets.values()) {
    try { socket.close(); } catch { }
  }
  titleSockets.clear();
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
    writeSession({ lastRotationAt: new Date().toISOString() });
  } catch {
    try {
      const recoveryRelay = createRelay(relayPort);
      await recoveryRelay.listen();
      relay = recoveryRelay;
    } catch { }
  } finally {
    rotationInProgress = false;
  }
}

async function run() {
  try {
    const executable = chromeExecutable();
    if (!executable) throw new Error("browser_not_found");
    relay = createRelay();
    await relay.listen();
    relayPort = relay.port;
    if (existsSync(devToolsActivePortPath)) {
      try { unlinkSync(devToolsActivePortPath); } catch { }
    }
    browser = spawn(executable, [
      `--user-data-dir=${profileDirectory}`,
      `--proxy-server=http://127.0.0.1:${relayPort}`,
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ], { detached: false, stdio: "ignore", windowsHide: false });
    writeSession({ startedAt: new Date().toISOString(), instanceLabelState: "starting" });
    startInstanceTitleController();
    if (rotationMinutes) {
      rotationTimer = setInterval(() => { void rotateRelay(); }, rotationMinutes * 60_000);
      rotationTimer.unref?.();
    }
    await post(`/api/h2ads/worker/commands/${commandId}/result`, { command: "launch_browser", state: "browser_open" });
    browser.once("exit", async () => {
      try {
        if (rotationTimer) clearInterval(rotationTimer);
        stopInstanceTitleController();
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
    stopInstanceTitleController();
    const category = error instanceof Error && error.message === "browser_not_found" ? "browser_not_found" : "browser_launch_failed";
    await post(`/api/h2ads/worker/commands/${commandId}/result`, { command: "launch_browser", state: "blocked", errorCategory: category }).catch(() => undefined);
    if (relay) await relay.close(true).catch(() => undefined);
  }
}

run();
