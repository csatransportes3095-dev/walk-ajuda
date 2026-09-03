from pathlib import Path

browser_path = Path("workers/windows/browser-session.mjs")
ui_path = Path("client/src/pages/H2Ads.tsx")
text = browser_path.read_text(encoding="utf-8")
ui = ui_path.read_text(encoding="utf-8")


def replace_once(source: str, before: str, after: str, label: str) -> str:
    count = source.count(before)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 trecho, encontrado {count}")
    return source.replace(before, after, 1)

# A proteção deixa de maquiar Google Sorry. O objetivo passa a ser provar a rota real do browser.
text = replace_once(
    text,
    'const NAVIGATION_GUARD_INTERVAL_MS = 1_000;\n',
    'const BROWSER_ROUTE_CHECK_INTERVAL_MS = 30_000;\nconst BROWSER_ROUTE_PROBE_TIMEOUT_MS = 5_000;\nconst BROWSER_ROUTE_PROBE_FAILURE_LIMIT = 3;\n',
    "constantes de prova de rota",
)
text = replace_once(text, 'let navigationGuardTimer;\n', 'let browserRouteTimer;\n', "timer da rota")
text = replace_once(
    text,
    'let googleSorryBlockedCount = 0;\nconst firefoxBidiPending = new Map();\n',
    'let googleSorryBlockedCount = 0;\nlet browserRouteCheckInProgress = false;\nlet browserRouteProbeFailures = 0;\nconst firefoxBidiPending = new Map();\n',
    "estado da prova de rota",
)

route_helpers = r'''

const BROWSER_IP_PROBE_URL = "https://api.ipify.org?format=json";

function parseBrowserIpPayload(value) {
  if (typeof value !== "string" || value.length < 2 || value.length > 512) throw new Error("browser_route_probe_invalid_payload");
  const data = JSON.parse(value);
  if (typeof data?.ip !== "string" || data.ip.length < 3 || data.ip.length > 64) throw new Error("browser_route_probe_invalid_ip");
  return data.ip.trim();
}

function browserIpProbeExpression() {
  return `(async () => { const response = await fetch(${JSON.stringify(BROWSER_IP_PROBE_URL)}, { cache: "no-store" }); if (!response.ok) throw new Error("probe_http_" + response.status); return await response.text(); })()`;
}

async function sendChromeDevToolsCommand(target, method, params = {}, timeoutMs = BROWSER_ROUTE_PROBE_TIMEOUT_MS) {
  const debuggerUrl = typeof target?.webSocketDebuggerUrl === "string" ? target.webSocketDebuggerUrl : "";
  if (!debuggerUrl) throw new Error("browser_route_probe_chrome_debugger_unavailable");
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(debuggerUrl, { handshakeTimeout: Math.min(timeoutMs, 1_500) });
    const id = 77;
    const timer = setTimeout(() => {
      try { socket.terminate(); } catch { }
      reject(new Error("browser_route_probe_chrome_timeout"));
    }, timeoutMs);
    const fail = (error) => {
      clearTimeout(timer);
      try { socket.terminate(); } catch { }
      reject(error instanceof Error ? error : new Error("browser_route_probe_chrome_failed"));
    };
    socket.once("error", fail);
    socket.once("open", () => {
      try { socket.send(JSON.stringify({ id, method, params })); } catch (error) { fail(error); }
    });
    socket.on("message", (data) => {
      let message;
      try { message = JSON.parse(String(data)); } catch { return; }
      if (message?.id !== id) return;
      clearTimeout(timer);
      try { socket.terminate(); } catch { }
      if (message.error) reject(new Error(String(message.error.message || "browser_route_probe_chrome_failed")));
      else resolve(message.result);
    });
  });
}

async function getChromeLabelTarget() {
  const portFile = join(profileDirectory, "DevToolsActivePort");
  if (!existsSync(portFile)) throw new Error("browser_route_probe_chrome_port_unavailable");
  const [portLine] = readFileSync(portFile, "utf8").split(/\r?\n/);
  const port = Number(portLine);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("browser_route_probe_chrome_port_invalid");
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1_500) });
  if (!response.ok) throw new Error("browser_route_probe_chrome_targets_unavailable");
  const targets = await response.json();
  if (!Array.isArray(targets)) throw new Error("browser_route_probe_chrome_targets_invalid");
  const labelUrl = pathToFileURL(labelPagePath).href;
  const target = targets.find((item) => item?.type === "page" && item?.url === labelUrl)
    || targets.find((item) => item?.type === "page" && item?.title === instanceWindowTitle)
    || targets.find((item) => item?.type === "page");
  if (!target) throw new Error("browser_route_probe_chrome_target_unavailable");
  return target;
}

async function readChromeBrowserIp() {
  const target = await getChromeLabelTarget();
  const result = await sendChromeDevToolsCommand(target, "Runtime.evaluate", {
    expression: browserIpProbeExpression(),
    awaitPromise: true,
    returnByValue: true,
  });
  const exception = result?.exceptionDetails?.text || result?.exceptionDetails?.exception?.description;
  if (exception) throw new Error("browser_route_probe_chrome_eval_failed");
  return parseBrowserIpPayload(result?.result?.value);
}

function findFirefoxLabelContext(contexts) {
  if (!Array.isArray(contexts)) return null;
  const labelUrl = pathToFileURL(labelPagePath).href;
  for (const context of contexts) {
    if (context?.url === labelUrl || (typeof context?.url === "string" && context.url.includes("h2ads-instance-label.html"))) return context;
    const child = findFirefoxLabelContext(context?.children);
    if (child) return child;
  }
  for (const context of contexts) {
    if (typeof context?.context === "string") return context;
  }
  return null;
}

async function readFirefoxBrowserIp() {
  await connectFirefoxBidi();
  const tree = await sendFirefoxBidiCommand("browsingContext.getTree", {}, 1_500);
  const context = findFirefoxLabelContext(tree?.contexts);
  if (!context?.context) throw new Error("browser_route_probe_firefox_context_unavailable");
  const result = await sendFirefoxBidiCommand("script.evaluate", {
    expression: browserIpProbeExpression(),
    target: { context: context.context },
    awaitPromise: true,
    resultOwnership: "none",
  }, BROWSER_ROUTE_PROBE_TIMEOUT_MS);
  const remote = result?.result;
  if (!remote || remote.type !== "string") throw new Error("browser_route_probe_firefox_eval_failed");
  return parseBrowserIpPayload(remote.value);
}

async function readBrowserObservedIp() {
  return browserEngine === "firefox" ? await readFirefoxBrowserIp() : await readChromeBrowserIp();
}

async function checkDirectHostIp() {
  const { stdout } = await execFileAsync("curl.exe", ["--silent", "--show-error", "--fail", "--max-time", "15", BROWSER_IP_PROBE_URL], { windowsHide: true, timeout: 20_000, maxBuffer: 8_192 });
  return parseBrowserIpPayload(stdout);
}

async function verifyBrowserRouteProof(expectedRelayIp = null) {
  const relayIp = expectedRelayIp || await checkIp();
  const browserIp = await readBrowserObservedIp();
  let proof = "relay_ip_match";
  let matchedRelayIp = relayIp;

  if (browserIp !== relayIp) {
    const secondRelayIp = await checkIp();
    if (browserIp === secondRelayIp) {
      proof = "relay_ip_match_second_sample";
      matchedRelayIp = secondRelayIp;
    } else {
      const directHostIp = await checkDirectHostIp();
      if (browserIp === directHostIp) {
        writeSession({ browserRouteProof: "blocked", browserObservedIp: browserIp, browserRouteFailure: "direct_host_ip_detected", browserRouteCheckedAt: new Date().toISOString() });
        throw new Error("browser_direct_ip_exposure");
      }
      proof = "isolated_proxy_variant";
      matchedRelayIp = secondRelayIp;
    }
  }

  writeSession({
    browserRouteProof: proof,
    browserObservedIp: browserIp,
    relayObservedIp: matchedRelayIp,
    browserRouteCheckedAt: new Date().toISOString(),
    browserRouteProbeFailures: 0,
  });
  return { browserIp, relayIp: matchedRelayIp, proof };
}

async function waitForBrowserRouteProof(expectedRelayIp) {
  const deadline = Date.now() + 15_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (!browser || browser.exitCode !== null) throw new Error("browser_route_probe_browser_exited");
    try {
      return await verifyBrowserRouteProof(expectedRelayIp);
    } catch (error) {
      if (error instanceof Error && error.message === "browser_direct_ip_exposure") throw error;
      lastError = error;
      await sleep(300);
    }
  }
  throw new Error(lastError instanceof Error ? `browser_route_probe_unavailable:${lastError.message}` : "browser_route_probe_unavailable");
}

async function enforceBrowserRouteProof() {
  if (!browser || browser.exitCode !== null || killSwitchTriggered || rotationInProgress || browserRouteCheckInProgress) return;
  browserRouteCheckInProgress = true;
  try {
    await verifyBrowserRouteProof();
    browserRouteProbeFailures = 0;
  } catch (error) {
    if (error instanceof Error && error.message === "browser_direct_ip_exposure") {
      await triggerKillSwitch("browser_direct_ip_exposure");
      return;
    }
    browserRouteProbeFailures += 1;
    writeSession({ browserRouteProof: "degraded", browserRouteProbeFailures, browserRouteLastError: error instanceof Error ? error.message.slice(0, 160) : "unknown", browserRouteCheckedAt: new Date().toISOString() });
    if (browserRouteProbeFailures >= BROWSER_ROUTE_PROBE_FAILURE_LIMIT) {
      await triggerKillSwitch("browser_route_probe_unavailable");
    }
  } finally {
    browserRouteCheckInProgress = false;
  }
}
'''
marker = "\nfunction upstreamUrl() {"
if text.count(marker) != 1:
    raise RuntimeError("ponto de inserção dos helpers de prova de rota não encontrado")
text = text.replace(marker, route_helpers + marker, 1)

# Google Sorry deixa de ser interceptado/maquiado no Chrome.
text = replace_once(
    text,
'''      const privacyGuardExtension = createGoogleSorryPrivacyGuard();\n      browser = spawn(executable, [''',
'''      browser = spawn(executable, [''',
    "remoção da extensão cosmética",
)
text = replace_once(
    text,
'''        "--remote-debugging-port=0",\n        "--load-extension=" + privacyGuardExtension,\n        "--no-first-run",''',
'''        "--remote-debugging-port=0",\n        "--no-first-run",''',
    "remoção do load-extension",
)

# Abertura só é reportada depois de o próprio navegador provar a rota.
anchor = '''    writeSession({ startedAt: new Date().toISOString(), browserEngine, instanceLabelState: "static_tab", observedIp: initialIp, privacyGuard: "protected", googleSorryPrivacyGuard: browserEngine === "chrome" ? "extension_plus_devtools_tab_guard" : "webdriver_bidi_tab_guard_plus_firewall_plus_route_guard", navigationGuard: "armed", firefoxRemotePort: browserEngine === "firefox" ? firefoxRemotePort : null, killSwitch: "armed", directBrowserEgress: "blocked_by_windows_firewall" });'''
replacement = '''    await waitForBrowserRouteProof(initialIp);\n    writeSession({ startedAt: new Date().toISOString(), browserEngine, instanceLabelState: "static_tab", observedIp: initialIp, privacyGuard: "protected", googleSorryPrivacyGuard: "disabled_diagnostic_only", navigationGuard: "disabled", browserRouteGuard: "browser_native_ip_proof", firefoxRemotePort: browserEngine === "firefox" ? firefoxRemotePort : null, killSwitch: "armed", directBrowserEgress: "blocked_by_windows_firewall" });'''
text = replace_once(text, anchor, replacement, "prova de rota antes do browser_open")

# Timer de Google Sorry vira verificação real de rota no browser.
text = text.replace("navigationGuardTimer", "browserRouteTimer")
text = replace_once(
    text,
'''    browserRouteTimer = setInterval(() => { void enforceNavigationGuard(); }, NAVIGATION_GUARD_INTERVAL_MS);\n    browserRouteTimer.unref?.();''',
'''    browserRouteTimer = setInterval(() => { void enforceBrowserRouteProof(); }, BROWSER_ROUTE_CHECK_INTERVAL_MS);\n    browserRouteTimer.unref?.();''',
    "timer contínuo da prova de rota",
)

# Categorias claras quando a proteção real falhar na abertura.
old_category = '''    const category = error instanceof Error && error.message === "browser_not_found" ? "browser_not_found" : error instanceof Error && error.message.startsWith("privacy_guard_") ? "privacy_guard_blocked" : error instanceof Error && error.message.startsWith("firefox_navigation_guard_") ? "firefox_navigation_guard_unavailable" : "browser_launch_failed";'''
new_category = '''    const category = error instanceof Error && error.message === "browser_not_found" ? "browser_not_found" : error instanceof Error && error.message === "browser_direct_ip_exposure" ? "browser_direct_ip_exposure" : error instanceof Error && error.message.startsWith("browser_route_probe_unavailable") ? "browser_route_probe_unavailable" : error instanceof Error && error.message.startsWith("privacy_guard_") ? "privacy_guard_blocked" : error instanceof Error && error.message.startsWith("firefox_navigation_guard_") ? "firefox_navigation_guard_unavailable" : "browser_launch_failed";'''
text = replace_once(text, old_category, new_category, "categorias de falha da prova de rota")

# UI: deixa claro que browser_open significa prova de rota dentro do próprio navegador.
old_reason = '''  const blockedReason = browserRun?.lastErrorCategory === "google_sorry_detected" ? "Google recusou esta rota · sessão encerrada por segurança" : browserRun?.lastErrorCategory === "firefox_navigation_guard_unavailable" ? "Proteção do Firefox indisponível · sessão encerrada" : browserRun?.lastErrorCategory === "proxy_path_unverified" ? "Rota perdeu a validação · sessão encerrada" : browserRun?.lastErrorCategory === "proxy_rotation_unverified" ? "Rotação da rota não pôde ser validada · sessão encerrada" : "Operação bloqueada: proxy ou browser indisponível";\n  const browserState = browserRun?.state === "browser_open" ? "Browser aberto no perfil local" : browserRun?.state === "closed" ? "Browser encerrado · perfil local preservado" : browserRun?.state === "proxy_verified" ? "Perfil local pronto · proxy confirmado" : browserRun?.state === "queued" ? "Comando na fila do Worker" : browserRun?.state === "preparing" ? "Verificando a rota pelo Worker" : browserRun?.state === "blocked" ? blockedReason : "Browser ainda não preparado";'''
new_reason = '''  const blockedReason = browserRun?.lastErrorCategory === "browser_direct_ip_exposure" ? "PROTEÇÃO: IP direto detectado no navegador · sessão encerrada" : browserRun?.lastErrorCategory === "browser_route_probe_unavailable" ? "PROTEÇÃO: não foi possível comprovar a rota dentro do navegador · sessão encerrada" : browserRun?.lastErrorCategory === "google_sorry_detected" ? "Google recusou esta rota" : browserRun?.lastErrorCategory === "firefox_navigation_guard_unavailable" ? "Proteção do Firefox indisponível · sessão encerrada" : browserRun?.lastErrorCategory === "proxy_path_unverified" ? "Rota perdeu a validação · sessão encerrada" : browserRun?.lastErrorCategory === "proxy_rotation_unverified" ? "Rotação da rota não pôde ser validada · sessão encerrada" : "Operação bloqueada: proxy ou browser indisponível";\n  const browserState = browserRun?.state === "browser_open" ? "Browser aberto · rota comprovada dentro do navegador" : browserRun?.state === "closed" ? "Browser encerrado · perfil local preservado" : browserRun?.state === "proxy_verified" ? "Perfil local pronto · proxy confirmado" : browserRun?.state === "queued" ? "Comando na fila do Worker" : browserRun?.state === "preparing" ? "Verificando a rota pelo Worker" : browserRun?.state === "blocked" ? blockedReason : "Browser ainda não preparado";'''
ui = replace_once(ui, old_reason, new_reason, "mensagem visual da prova de rota")

# Guard rails: esta correção não pode tocar em backup/perfil.
if "--load-extension=" in text:
    raise RuntimeError("Chrome ainda carrega a extensão que maquiava Google Sorry")
if "await waitForBrowserRouteProof(initialIp);" not in text:
    raise RuntimeError("prova nativa não ficou obrigatória antes de browser_open")
if "browser_direct_ip_exposure" not in text or "browser_route_probe_unavailable" not in text:
    raise RuntimeError("categorias de proteção real não foram inseridas")

browser_path.write_text(text, encoding="utf-8")
ui_path.write_text(ui, encoding="utf-8")
print("H2ADS: prova nativa de IP no Chrome/Firefox aplicada sem tocar em backup/perfil.")
