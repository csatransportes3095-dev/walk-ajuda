import { createHash, randomUUID } from "node:crypto";
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
const required = ["H2ADS_PANEL_URL", "H2ADS_WORKER_KEY", "H2ADS_WORKER_TOKEN", "H2ADS_INSTANCE_ID", "H2ADS_COMMAND_ID", "H2ADS_PROXY_JSON", "H2ADS_PROFILE_DIRECTORY", "H2ADS_BROWSER_EXECUTABLE"];
if (required.some((key) => !process.env[key])) process.exit(2);

const panelUrl = process.env.H2ADS_PANEL_URL;
const workerKey = process.env.H2ADS_WORKER_KEY;
const workerToken = process.env.H2ADS_WORKER_TOKEN;
const instanceId = Number(process.env.H2ADS_INSTANCE_ID);
const commandId = Number(process.env.H2ADS_COMMAND_ID);
const profileDirectory = process.env.H2ADS_PROFILE_DIRECTORY;
const browserExecutable = process.env.H2ADS_BROWSER_EXECUTABLE;
let proxy = JSON.parse(process.env.H2ADS_PROXY_JSON);
const sessionPath = join(profileDirectory, "h2ads-browser-session.json");
const runnerLockPath = join(profileDirectory, "h2ads-session-runner.lock");
const snapshotQueueDirectory = join(profileDirectory, "..", "..", "snapshot-queue");
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
let rotationInProgress = false;
let lastReportedIp = null;
let ipCheckInProgress = false;
let killSwitchCheckInProgress = false;
let lastFirewallAuditAt = 0;
let networkSuspended = false;
let browserExitHandled = false;
let panelSyncTimer;
let proxySyncTimer;
let proxySyncInProgress = false;
let panelSyncInProgress = false;
let openingCommandConfirmed = false;
let panelRuntimeConfirmed = false;
let initialObservedIp = null;
let sessionLockedIp = null;
let sessionIpChanged = false;
let runnerLockOwned = false;
let browserProbeInProgress = false;
let stopMobileRemote = null;
const mobileRemoteRequested = process.env.H2ADS_REMOTE_DEBUG === "1";

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
      if (networkSuspended || !activeBackendPort) throw new Error("backend_relay_unavailable");
      return { upstreamProxyUrl: `http://127.0.0.1:${activeBackendPort}` };
    },
  });
}

function chromeExecutable() {
  if (!browserExecutable || !existsSync(browserExecutable)) return undefined;
  return browserExecutable;
}

async function verifyWindowsFirewallRules() {
  const executable = chromeExecutable();
  if (!executable) throw new Error("browser_not_found");
  const escapedPath = executable.replaceAll("'", "''");
  const firewallFamily = /chrome-for-testing/i.test(executable) ? "H2ADS Testing Chrome" : "H2ADS Dedicated Chrome";
  const script = [
    "$ErrorActionPreference='Stop'",
    "$expectedProgram='" + escapedPath + "'",
    "$checks=@(",
    "  @{Name='" + firewallFamily + " - Block Direct IPv4';Expected=@('0.0.0.0-126.255.255.255','128.0.0.0-255.255.255.255')},",
    "  @{Name='" + firewallFamily + " - Block Direct IPv6';Expected=@('Internet6')}",
    ")",
    "foreach($check in $checks){",
    "  $rule=Get-NetFirewallRule -DisplayName $check.Name -ErrorAction Stop | Where-Object {$_.Enabled -eq 'True' -and $_.Direction -eq 'Outbound' -and $_.Action -eq 'Block'} | Select-Object -First 1",
    "  if(-not $rule){throw 'firewall_rule_missing'}",
    "  $app=$rule | Get-NetFirewallApplicationFilter",
    "  if(-not $app){throw 'firewall_program_missing'}",
    "  if(-not ([System.IO.Path]::GetFullPath([string]$app.Program)).Equals([System.IO.Path]::GetFullPath($expectedProgram),[StringComparison]::OrdinalIgnoreCase)){throw 'firewall_program_mismatch'}",
    "  $addr=$rule | Get-NetFirewallAddressFilter",
    "  $actual=@($addr.RemoteAddress | ForEach-Object {([string]$_)-split ','} | ForEach-Object {$_.Trim()} | Where-Object {$_} | Sort-Object -Unique)",
    "  $expected=@($check.Expected | Sort-Object -Unique)",
    "  if($actual.Count -ne $expected.Count){throw 'firewall_range_mismatch'}",
    "  foreach($item in $expected){if($actual -notcontains $item){throw 'firewall_range_mismatch'}}",
    "}",
    "Write-Output 'OK'"
  ].join(";");
  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true, timeout: 12_000, maxBuffer: 32_000,
    });
    if (!String(stdout).includes("OK")) throw new Error("firewall_validation_failed");
    lastFirewallAuditAt = Date.now();
    writeSession({ firewallAudit: "passed", firewallAuditAt: new Date().toISOString() });
    return true;
  } catch (error) {
    writeSession({ firewallAudit: "failed", firewallAuditAt: new Date().toISOString() });
    throw new Error("firewall_validation_failed");
  }
}

function headers() {
  return { Authorization: `Bearer ${workerToken}`, "X-H2ADS-Worker-Key": workerKey, "Content-Type": "application/json" };
}

async function post(path, body) {
  const response = await fetch(`${panelUrl.replace(/\/$/, "")}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
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

function isPrivateOrLocalIp(value) {
  const ip = normalizeIp(value);
  if (!ip) return true;
  if (ip === "localhost" || ip === "::1" || ip === "0.0.0.0") return true;
  if (/^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip)) return true;
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]), b = Number(v4[2]);
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (ip.includes(":")) {
    return ip === "::" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb");
  }
  return true;
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
    const observedIp = data.ip.trim();
    if (isPrivateOrLocalIp(observedIp)) throw new Error("private_or_local_ip_detected");
    return observedIp;
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

async function verifyWebRtcNoLocalLeak(executable, localPort) {
  const probeProfile = mkdtempSync(join(tmpdir(), `h2ads-webrtc-probe-${instanceId}-`));
  const probePath = join(probeProfile, "probe.html");
  const html = `<!doctype html><html><body><pre id="out">pending</pre><script>
  (async()=>{try{
    const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
    pc.createDataChannel("x");
    const found=[];
    pc.onicecandidate=e=>{if(e.candidate){found.push(e.candidate.candidate||"");}else{
      document.getElementById("out").textContent=JSON.stringify(found); pc.close();
    }};
    await pc.setLocalDescription(await pc.createOffer());
    setTimeout(()=>{document.getElementById("out").textContent=JSON.stringify(found); try{pc.close()}catch{}},3500);
  }catch(e){document.getElementById("out").textContent="[]";}})();
  </script></body></html>`;
  writeFileSync(probePath, html, "utf8");
  try {
    const { stdout } = await execFileAsync(executable, [
      "--headless=new", "--disable-gpu", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--metrics-recording-only",
      `--user-data-dir=${probeProfile}`, `--proxy-server=http://127.0.0.1:${localPort}`, "--proxy-bypass-list=<-loopback>",
      "--disable-quic", "--dns-prefetch-disable", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--virtual-time-budget=5000", "--dump-dom", pathToFileURL(probePath).href,
    ], { windowsHide: true, timeout: 15_000, maxBuffer: 256_000 });
    const localPattern = /(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1\]?|\bfc[0-9a-f]{2}:|\bfd[0-9a-f]{2}:|\bfe[89ab][0-9a-f]:)/i;
    if (localPattern.test(stdout)) throw new Error("webrtc_local_ip_leak_detected");
    return true;
  } finally {
    try { rmSync(probeProfile, { recursive: true, force: true }); } catch {}
  }
}

async function privacyGuardPreflight() {
  // Fluxo comprovado: antes do spawn, exige apenas que o relay/proxy esteja vivo.
  // Firewall + Chrome + WebRTC ja foram validados no PREPARAR/TESTE VAZAMENTO.
  // Depois do spawn, o Chrome e revalidado de forma assincrona; se falhar,
  // suspendProxyTraffic() corta a rede sem impedir a janela de abrir.
  const observedIp = await checkIp();
  if (!observedIp) throw new Error("privacy_guard_proxy_unavailable");
  writeSession({
    privacyGuard: "protected",
    privacyGuardCheckedAt: new Date().toISOString(),
    observedIp,
    browserProxyVerified: false,
    browserProxyVerification: "pending",
    quicDisabled: true,
    dnsPrefetchDisabled: true,
    webrtcNonProxiedUdpDisabled: true,
    webrtcOperationalProbe: "prevalidated",
    killSwitch: "armed",
    directBrowserEgress: "blocked_by_windows_firewall",
  });
  return { observedIp };
}

async function verifyChromeProxyAfterLaunch(executable, expectedIp) {
  try {
    const browserObservedIp = await verifyChromeProxyPath(executable, relayPort, expectedIp);
    if (browserExitHandled || !browser || browser.exitCode !== null) return;
    writeSession({
      browserObservedIp, browserProxyVerified: true, browserProxyVerification: "verified",
      browserProxyVerifiedAt: new Date().toISOString(), privacyGuard: "protected", killSwitch: "armed",
    });
  } catch (error) {
    if (browserExitHandled || !browser || browser.exitCode !== null) return;
    try {
      writeSession({
        browserProxyVerified: false, browserProxyVerification: "failed",
        browserProxyFailureAt: new Date().toISOString(),
      });
    } catch { }
    await suspendProxyTraffic(error instanceof Error ? error.message : "browser_proxy_unverified");
  }
}

function stopSessionTimers() {
  if (rotationTimer) clearInterval(rotationTimer);
  if (ipTimer) clearInterval(ipTimer);
  if (killSwitchTimer) clearInterval(killSwitchTimer);
  if (panelSyncTimer) clearInterval(panelSyncTimer);
  if (proxySyncTimer) clearInterval(proxySyncTimer);
  if (stopMobileRemote) { stopMobileRemote(); stopMobileRemote = null; }
}

async function closeRelay(server) {
  if (!server) return;
  await server.close(true).catch(() => undefined);
}

function panelFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  const category = /^panel_http_\d{3}$/.test(message) ? message : "panel_unavailable";
  try { writeSession({ panelConnection: "offline", panelLastErrorCategory: category, panelLastFailureAt: new Date().toISOString() }); } catch { }
}

// The panel reports *observations*; failure to report is never permission to kill Chrome.
async function syncPanelOpening(observedIp = initialObservedIp) {
  if (panelSyncInProgress || browserExitHandled || !browser || browser.exitCode !== null) return;
  panelSyncInProgress = true;
  try {
    if (!openingCommandConfirmed) {
      await post("/api/h2ads/worker/commands/" + commandId + "/result", { command: "launch_browser", state: "browser_open" });
      openingCommandConfirmed = true;
    }
    if (!panelRuntimeConfirmed && observedIp) {
      await post("/api/h2ads/worker/runs/" + instanceId + "/state", { state: "browser_open", observedIp });
      panelRuntimeConfirmed = true;
    }
    writeSession({ panelConnection: "online", panelLastErrorCategory: null, panelLastSyncedAt: new Date().toISOString() });
  } catch (error) {
    panelFailure(error);
  } finally {
    panelSyncInProgress = false;
  }
}

// Close CONNECT tunnels, not the Chrome process. The front relay remains bound on
// the same localhost port, so Chrome keeps its tabs and can resume on verification.
async function suspendProxyTraffic(reason = "proxy_path_unverified") {
  if (browserExitHandled) return;
  const category = classifyNetworkError({ message: String(reason) }, "proxy_path_unverified");
  networkSuspended = true;
  activeBackendPort = undefined;
  // proxy-chain close(true) destroys existing CONNECT and HTTP sockets.
  // Keep Chrome open, and restore a local front relay bound to the same port.
  await closeRelay(frontRelay);
  frontRelay = undefined;
  await closeRelay(backendRelay);
  backendRelay = undefined;
  try {
    frontRelay = createFrontRelay(relayPort);
    await frontRelay.listen();
  } catch { }
  try {
    writeSession({
      networkState: "suspended", privacyGuard: "blocked", killSwitch: "armed",
      networkFailureCategory: category, networkSuspendedAt: new Date().toISOString(),
    });
  } catch { }
}

async function resumeProxyTraffic() {
  // A instância permanece aberta durante a queda. O novo caminho só é liberado
  // depois de validar o upstream e confirmar o mesmo IP pelo Chrome de prova.
  if (!networkSuspended || browserExitHandled) return;
  try {
    if (!backendRelay) {
      backendRelay = createBackendRelay();
      await backendRelay.listen();
    }
    // O front continua bloqueado enquanto o novo caminho é testado.
    const observedIp = await checkIpThroughPort(backendRelay.port);
    const executable = chromeExecutable();
    if (!executable) throw new Error("browser_not_found");
    const browserObservedIp = await verifyChromeProxyPath(executable, backendRelay.port, observedIp);

    if (!frontRelay) {
      frontRelay = createFrontRelay(relayPort);
      await frontRelay.listen();
    }

    // Se o provedor voltou com outro IP, adotar somente depois da validação dupla.
    const previousLockedIp = sessionLockedIp;
    sessionLockedIp = observedIp;
    sessionIpChanged = Boolean(previousLockedIp && normalizeIp(previousLockedIp) !== normalizeIp(observedIp));
    activeBackendPort = backendRelay.port;
    networkSuspended = false;

    const frontIp = await checkIp();
    if (normalizeIp(frontIp) !== normalizeIp(observedIp)) throw new Error("exit_ip_mismatch");

    writeSession({
      networkState: "online",
      privacyGuard: "protected",
      killSwitch: "armed",
      networkFailureCategory: null,
      networkRestoredAt: new Date().toISOString(),
      previousSessionLockedIp: previousLockedIp || null,
      sessionLockedIp,
      sessionIpChanged,
      sessionIpChangedAt: sessionIpChanged ? new Date().toISOString() : null,
      observedIp: frontIp,
      browserObservedIp,
      browserProxyVerified: true,
      browserProxyVerification: "verified",
    });
    lastReportedIp = frontIp;
    try {
      await post("/api/h2ads/worker/runs/" + instanceId + "/state", {
        state: "browser_open",
        observedIp: frontIp,
      });
      panelRuntimeConfirmed = true;
      writeSession({
        panelConnection: "online",
        panelLastErrorCategory: null,
        panelLastSyncedAt: new Date().toISOString(),
        hotSwapStateSyncedAt: new Date().toISOString(),
      });
    } catch (error) {
      panelFailure(error);
    }
    void syncPanelOpening(frontIp);
  } catch (error) {
    await suspendProxyTraffic(error instanceof Error ? error.message : "proxy_path_unverified");
  }
}

async function syncCurrentProxyCredential() {
  if (proxySyncInProgress || browserExitHandled || !browser || browser.exitCode !== null) return;
  proxySyncInProgress = true;
  try {
    const response = await fetch(`${panelUrl.replace(/\/$/, "")}/api/h2ads/worker/proxy/${instanceId}/current`, {
      headers: headers(),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`panel_http_${response.status}`);
    const data = await response.json();
    const next = data?.proxy;
    if (!next?.host || !next?.port || !next?.username || !next?.password) return;
    const currentFingerprint = JSON.stringify([proxy.protocol, proxy.host, proxy.port, proxy.username, proxy.password]);
    const nextFingerprint = JSON.stringify([next.protocol, next.host, next.port, next.username, next.password]);
    if (currentFingerprint === nextFingerprint) return;

    proxy = { ...proxy, ...next };
    writeSession({
      proxyHotSwapDetectedAt: new Date().toISOString(),
      networkState: "suspended",
      hotSwapState: "applying",
    });
    await suspendProxyTraffic("proxy_hot_swap");
    await resumeProxyTraffic();
    writeSession({
      hotSwapState: networkSuspended ? "waiting_proxy" : "online",
      hotSwapCompletedAt: networkSuspended ? null : new Date().toISOString(),
    });
  } catch (error) {
    panelFailure(error);
  } finally {
    proxySyncInProgress = false;
  }
}

async function reportObservedIp() {
  if (!browser || browser.exitCode !== null || !relayPort || rotationInProgress || ipCheckInProgress || networkSuspended || browserExitHandled) return;
  ipCheckInProgress = true;
  let observedIp;
  try {
    observedIp = await checkIp();
    writeSession({ observedIp, lastIpCheckedAt: new Date().toISOString(), killSwitch: "armed" });
  } catch (error) {
    await suspendProxyTraffic(error instanceof Error ? error.message : "proxy_path_unverified");
    ipCheckInProgress = false;
    return;
  }
  try {
    if (sessionLockedIp && normalizeIp(observedIp) !== normalizeIp(sessionLockedIp)) {
      sessionIpChanged = true;
      writeSession({
        sessionLockedIp,
        observedIp,
        sessionIpChangedAt: new Date().toISOString(),
        networkState: "blocked",
        killSwitch: "triggered",
        killSwitchReason: "session_ip_changed",
      });
      await suspendProxyTraffic("session_ip_changed");
      return;
    }
    if (observedIp !== lastReportedIp) {
      await post("/api/h2ads/worker/runs/" + instanceId + "/state", { state: "browser_open", observedIp });
      lastReportedIp = observedIp;
      writeSession({ observedIp, lastIpReportedAt: new Date().toISOString(), panelConnection: "online" });
    }
  } catch (error) {
    panelFailure(error);
  } finally {
    ipCheckInProgress = false;
  }
}

async function enforceKillSwitch() {
  if (!browser || browser.exitCode !== null || !relayPort || rotationInProgress || browserExitHandled || killSwitchCheckInProgress || ipCheckInProgress) return;
  killSwitchCheckInProgress = true;
  try {
    if (Date.now() - lastFirewallAuditAt > 60_000) {
      await verifyWindowsFirewallRules();
    }
    if (networkSuspended) {
      await resumeProxyTraffic();
    } else {
      const observedIp = await checkIp();
      if (sessionLockedIp && normalizeIp(observedIp) !== normalizeIp(sessionLockedIp)) {
        sessionIpChanged = true;
        writeSession({
          previousSessionLockedIp: sessionLockedIp,
          observedIp,
          sessionIpChangedAt: new Date().toISOString(),
          networkState: "suspended",
          killSwitch: "armed",
          killSwitchReason: "proxy_ip_changed_revalidating",
        });
        await suspendProxyTraffic("proxy_ip_changed_revalidating");
      } else {
        writeSession({ killSwitch: "armed", killSwitchLastVerifiedAt: new Date().toISOString(), sessionLockedIp });
      }
    }
  } catch (error) {
    await suspendProxyTraffic(error instanceof Error ? error.message : "proxy_path_unverified");
  } finally {
    killSwitchCheckInProgress = false;
  }
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function clearPreviousBrowserTabs() {
  const targets = [
    join(profileDirectory, "Default", "Sessions"),
    join(profileDirectory, "Default", "Current Session"),
    join(profileDirectory, "Default", "Current Tabs"),
    join(profileDirectory, "Default", "Last Session"),
    join(profileDirectory, "Default", "Last Tabs"),
  ];
  for (const target of targets) {
    try {
      if (!existsSync(target)) continue;
      const stat = statSync(target);
      if (stat.isDirectory()) rmSync(target, { recursive: true, force: true });
      else unlinkSync(target);
    } catch { }
  }
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
    manifest_version: 3, name: "H2ADS Privacy Guard", version: "1.2.0", description: "Oculta paginas de bloqueio que exibem informacoes de rede.",
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
  // Never change the upstream route while Chrome is open. The session keeps the same
  // verified exit path until the browser closes; any proxy failure suspends traffic.
  if (browser && browser.exitCode === null) return;
  if (!frontRelay || !backendRelay || !relayPort || !activeBackendPort || rotationInProgress || networkSuspended || browserExitHandled) return;
  rotationInProgress = true;
  const previousBackend = backendRelay;
  const previousBackendPort = activeBackendPort;
  let candidateBackend;
  let candidateActivated = false;
  try {
    candidateBackend = createBackendRelay();
    await candidateBackend.listen();
    const candidateIp = await checkIpThroughPort(candidateBackend.port);
    const executable = chromeExecutable();
    if (!executable) throw new Error("browser_not_found");
    // Check the candidate while the old verified relay is still active.
    const browserObservedIp = await verifyChromeProxyPath(executable, candidateBackend.port, candidateIp);
    backendRelay = candidateBackend;
    activeBackendPort = candidateBackend.port;
    candidateActivated = true;
    const observedIp = await checkIp();
    if (normalizeIp(observedIp) !== normalizeIp(candidateIp)) throw new Error("exit_ip_mismatch");
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
      await suspendProxyTraffic("proxy_rotation_rollback");
    }
    if (candidateBackend && candidateBackend !== previousBackend) await closeRelay(candidateBackend);
    if (!networkSuspended) {
      try {
        const fallbackIp = await checkIp();
        writeSession({ rotationState: "rolled_back", rotationFailure: classifyNetworkError({ message: reason }), rotationFailureAt: new Date().toISOString(), observedIp: fallbackIp, privacyGuard: "protected", killSwitch: "armed" });
      } catch (fallbackError) {
        await suspendProxyTraffic(fallbackError instanceof Error ? fallbackError.message : "proxy_rotation_unverified");
      }
    }
  } finally {
    rotationInProgress = false;
  }
  if (!networkSuspended) void reportObservedIp();
}

function isProcessRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function acquireRunnerLock() {
  const claim = () => {
    writeFileSync(runnerLockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { encoding: "utf8", mode: 0o600, flag: "wx" });
    runnerLockOwned = true;
    process.once("exit", releaseRunnerLock);
    return true;
  };
  try {
    return claim();
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    let existingPid = null;
    try { existingPid = Number(JSON.parse(readFileSync(runnerLockPath, "utf8")).pid); } catch { }
    if (isProcessRunning(existingPid)) return false;
    try { unlinkSync(runnerLockPath); } catch { return false; }
    try { return claim(); } catch (nextError) {
      if (nextError?.code === "EEXIST") return false;
      throw nextError;
    }
  }
}

function releaseRunnerLock() {
  if (!runnerLockOwned) return;
  try {
    if (Number(JSON.parse(readFileSync(runnerLockPath, "utf8")).pid) === process.pid) unlinkSync(runnerLockPath);
  } catch { }
  runnerLockOwned = false;
}

function queueProfileSnapshot() {
  if (!hasBrowserProfileData()) return null;
  mkdirSync(snapshotQueueDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 17);
  const pendingPath = join(snapshotQueueDirectory, stamp + "-instance-" + instanceId + "-" + randomUUID().replaceAll("-", "") + ".pending");
  writeFileSync(pendingPath, String(instanceId), { encoding: "ascii", mode: 0o600, flag: "wx" });
  return pendingPath;
}

async function finalizeBrowserExit(reason, code = null, signal = null) {
  if (browserExitHandled) return;
  browserExitHandled = true;
  stopSessionTimers();
  const closedAt = new Date().toISOString();
  try {
    writeSession({ lastClosedAt: closedAt, browserExitReason: reason, browserExitCode: code, browserExitSignal: signal, networkState: "closed" });
    const manifestPath = join(profileDirectory, "h2ads-profile.json");
    const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { instanceId, profileVersion: 1 };
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, lastClosedAt: closedAt }), "utf8");
  } catch { }
  // Queue the profile backup locally, but never keep the session lock while
  // compressing/uploading it. The independent Worker snapshot queue handles it.
  let pendingPath = null;
  try { pendingPath = queueProfileSnapshot(); } catch { }
  try {
    await closeRelay(frontRelay);
    await closeRelay(backendRelay);
    activeBackendPort = undefined;
  } finally {
    releaseRunnerLock();
  }
  try {
    if (pendingPath) {
      writeSession({ profileSnapshotPending: true, profileSnapshotQueuedAt: closedAt });
    }
  } catch { }
  try {
    await post("/api/h2ads/worker/runs/" + instanceId + "/state", { state: "closed" });
  } catch (error) {
    panelFailure(error);
  }
}

async function run() {
  if (!acquireRunnerLock()) return; // A delayed duplicate command cannot open the same profile twice.
  try {
    const executable = chromeExecutable();
    if (!executable) throw new Error("browser_not_found");
    backendRelay = createBackendRelay();
    await backendRelay.listen();
    activeBackendPort = backendRelay.port;
    frontRelay = createFrontRelay();
    await frontRelay.listen();
    relayPort = frontRelay.port;
    const initial = await privacyGuardPreflight();
    initialObservedIp = initial.observedIp;
    sessionLockedIp = initial.observedIp;
    lastReportedIp = initial.observedIp;
    // Auto-provision enabled Store extensions for the isolated H2ADS browser.
    // Downloads always go through this instance's verified proxy relay.
    let globalExtensionPaths = [];
    let extensionSyncStatus = "sync_started";
    try {
      const { syncH2AdsExtensions } = await import("./h2ads-extension-sync.mjs");
      globalExtensionPaths = await syncH2AdsExtensions({
        panelUrl, headers: headers(), proxyPort: relayPort,
        root: join(profileDirectory, "h2ads-global-extensions"),
      });
      extensionSyncStatus = globalExtensionPaths.length ? "packages_prepared" : "none_prepared";
    } catch (error) {
      extensionSyncStatus = "sync_failed";
      console.error("[H2ADS] falha ao sincronizar extensoes:", String(error?.message || error));
    }
    writeSession({ extensionSyncStatus, extensionPreparedCount: globalExtensionPaths.length, extensionSyncAt: new Date().toISOString() });
    let startupSites = [];
    try {
      const response = await fetch(panelUrl.replace(/\/$/, "") + "/api/h2ads/worker/startup-sites", { headers: headers(), signal: AbortSignal.timeout(2500) });
      if (response.ok) {
        const urls = await response.json();
        if (Array.isArray(urls)) startupSites = urls.filter(url => typeof url === "string" && url.startsWith("https://") && url.length <= 500).slice(0, 20);
      }
    } catch (error) {
      console.error("[H2ADS] sites iniciais indisponiveis:", String(error?.message || error));
    }
    clearPreviousBrowserTabs();
    const labelPageUrl = createInstanceLabelPage();
    browser = spawn(executable, [
      // Um pipe local entre Node e Chrome: nenhuma porta TCP de depuracao e aberta.
      ...(mobileRemoteRequested ? ["--remote-debugging-pipe"] : []),
      "--user-data-dir=" + profileDirectory, "--proxy-server=http://127.0.0.1:" + relayPort, "--proxy-bypass-list=<-loopback>",
      "--disable-quic", "--dns-prefetch-disable", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      ...(globalExtensionPaths.length ? ["--load-extension=" + globalExtensionPaths.join(",")] : []), "--no-first-run", "--no-default-browser-check", labelPageUrl, ...startupSites,
    ], { detached: false, stdio: mobileRemoteRequested ? ["ignore", "ignore", "ignore", "pipe", "pipe"] : "ignore", windowsHide: false });

    // Register before any network request to the panel: early exit is never lost.
    browser.once("error", (error) => { void finalizeBrowserExit("spawn_error", null, error?.code || null); });
    browser.once("exit", (code, signal) => { void finalizeBrowserExit("browser_exit", code, signal); });
    // Do not make the user wait for a second headless Chrome before seeing the real window.
    // Direct egress remains blocked by Windows Firewall; verification runs asynchronously.
    void verifyChromeProxyAfterLaunch(executable, initial.observedIp);
    ipTimer = setInterval(() => { void reportObservedIp(); }, IP_CHECK_INTERVAL_MS);
    ipTimer.unref?.();
    killSwitchTimer = setInterval(() => { void enforceKillSwitch(); }, KILL_SWITCH_CHECK_INTERVAL_MS);
    killSwitchTimer.unref?.();
    if (mobileRemoteRequested) {
      try {
        const { startH2AdsMobileRemote } = await import("./mobile-remote.mjs");
        stopMobileRemote = startH2AdsMobileRemote({
          browser, profileDirectory, panelUrl, workerKey, workerToken, instanceId,
        });
      } catch {
        // Uma falha no complemento mobile nao interrompe Chrome nem o proxy.
      }
    }
    panelSyncTimer = setInterval(() => { void syncPanelOpening(); }, 12_000);
    panelSyncTimer.unref?.();
    proxySyncTimer = setInterval(() => { void syncCurrentProxyCredential(); }, 5_000);
    proxySyncTimer.unref?.();
    // A queda do proxy não encerra o Chrome. O relay local permanece como barreira;
    // a conexão só volta depois que o upstream e o Chrome de prova validarem o mesmo IP.
    try {
      writeSession({
        startedAt: new Date().toISOString(), lastClosedAt: null, browserExitReason: null,
        instanceLabelState: "static_tab", observedIp: initial.observedIp,
        browserProxyVerified: false, browserProxyVerification: "pending",
        privacyGuard: "protected", googleSorryPrivacyGuard: "disabled",
        dnsPrefetchDisabled: true, webrtcOperationalProbe: "passed",
        killSwitch: "armed", networkState: "online", panelConnection: "pending",
        directBrowserEgress: "blocked_by_windows_firewall",
        proxyRotationPolicy: "provider_managed_between_sessions",
        configuredRotationMinutes: rotationMinutes,
        sessionLockedIp,
      });
    } catch { }
    // Communication failure never reaches the launch catch or terminates Chrome.
    await syncPanelOpening(initial.observedIp);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "browser_launch_failed";
    if (browser && browser.pid && !browserExitHandled) {
      await suspendProxyTraffic("browser_session_setup_failed");
      return;
    }
    try { writeSession({ privacyGuard: "blocked", killSwitch: "triggered", killSwitchReason: classifyNetworkError({ message: reason }), privacyGuardFailureAt: new Date().toISOString() }); } catch { }
    const category = reason === "browser_not_found" ? "browser_not_found"
      : reason === "exit_ip_mismatch" ? "exit_ip_mismatch"
        : reason === "browser_probe_invalid_response" || reason === "browser_proxy_probe_failed" ? "browser_proxy_unverified"
          : reason.startsWith("privacy_guard_") ? "privacy_guard_blocked"
            : reason.startsWith("proxy_") || reason === "local_relay_down" ? reason
              : "browser_launch_failed";
    await post("/api/h2ads/worker/commands/" + commandId + "/result", { command: "launch_browser", state: "blocked", errorCategory: category }).catch(() => undefined);
    await closeRelay(frontRelay);
    await closeRelay(backendRelay);
    activeBackendPort = undefined;
    releaseRunnerLock();
  }
}

run();
