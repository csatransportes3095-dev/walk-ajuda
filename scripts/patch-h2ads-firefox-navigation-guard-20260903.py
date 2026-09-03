from pathlib import Path


def replace_once(path: str, before: str, after: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f"{path}: esperado 1 trecho, encontrado {count}")
    file.write_text(text.replace(before, after, 1), encoding="utf-8")


browser = "workers/windows/browser-session.mjs"
worker = "workers/windows/H2AdsWorker.ps1"

replace_once(
    browser,
    'import { join } from "node:path";\nimport { pathToFileURL } from "node:url";\nimport { promisify } from "node:util";\nimport { Server } from "proxy-chain";',
    'import { join } from "node:path";\nimport { createServer } from "node:net";\nimport { pathToFileURL } from "node:url";\nimport { promisify } from "node:util";\nimport { Server } from "proxy-chain";\nimport WebSocket from "ws";'
)

replace_once(
    browser,
    'const NAVIGATION_GUARD_INTERVAL_MS = 1_000;\n',
    'const NAVIGATION_GUARD_INTERVAL_MS = 1_000;\nconst FIREFOX_BIDI_CONNECT_TIMEOUT_MS = 1_200;\nconst FIREFOX_BIDI_STARTUP_TIMEOUT_MS = 12_000;\nconst FIREFOX_GUARD_FAILURE_LIMIT = 3;\n'
)

replace_once(
    browser,
    'let killSwitchCheckInProgress = false;\nlet killSwitchTriggered = false;\n\nfunction upstreamUrl() {',
    '''let killSwitchCheckInProgress = false;\nlet killSwitchTriggered = false;\nlet firefoxRemotePort = null;\nlet firefoxBidiSocket = null;\nlet firefoxBidiReady = false;\nlet firefoxBidiConnecting = null;\nlet firefoxBidiRequestId = 0;\nlet firefoxNavigationGuardFailures = 0;\nconst firefoxBidiPending = new Map();\n\nconst sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));\n\nfunction isGoogleSorryUrl(value) {\n  return /^https?:\\/\\/(?:[^/]+\\.)?google\\.(?:com|com\\.br)\\/sorry(?:[/?#]|$)/i.test(typeof value === "string" ? value : "");\n}\n\nasync function allocateLoopbackPort() {\n  return await new Promise((resolve, reject) => {\n    const server = createServer();\n    server.unref();\n    server.once("error", reject);\n    server.listen(0, "127.0.0.1", () => {\n      const address = server.address();\n      const port = address && typeof address === "object" ? address.port : null;\n      server.close((error) => {\n        if (error) reject(error);\n        else if (!Number.isInteger(port) || port < 1 || port > 65535) reject(new Error("firefox_remote_port_unavailable"));\n        else resolve(port);\n      });\n    });\n  });\n}\n\nfunction rejectFirefoxBidiPending(error) {\n  for (const pending of firefoxBidiPending.values()) {\n    clearTimeout(pending.timer);\n    pending.reject(error);\n  }\n  firefoxBidiPending.clear();\n}\n\nfunction closeFirefoxBidi() {\n  const socket = firefoxBidiSocket;\n  firefoxBidiSocket = null;\n  firefoxBidiReady = false;\n  firefoxBidiConnecting = null;\n  rejectFirefoxBidiPending(new Error("firefox_bidi_closed"));\n  if (!socket) return;\n  try {\n    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.terminate();\n  } catch { }\n}\n\nfunction handleFirefoxBidiMessage(data) {\n  let message;\n  try { message = JSON.parse(String(data)); } catch { return; }\n  if (!Number.isInteger(message?.id)) return;\n  const pending = firefoxBidiPending.get(message.id);\n  if (!pending) return;\n  firefoxBidiPending.delete(message.id);\n  clearTimeout(pending.timer);\n  if (message.type === "error" || message.error) pending.reject(new Error(String(message.message || message.error || "firefox_bidi_error")));\n  else pending.resolve(message.result);\n}\n\nfunction sendFirefoxBidiCommand(method, params, timeoutMs = 1_000) {\n  const socket = firefoxBidiSocket;\n  if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("firefox_bidi_not_connected"));\n  const id = ++firefoxBidiRequestId;\n  return new Promise((resolve, reject) => {\n    const timer = setTimeout(() => {\n      firefoxBidiPending.delete(id);\n      reject(new Error("firefox_bidi_timeout"));\n    }, timeoutMs);\n    firefoxBidiPending.set(id, { resolve, reject, timer });\n    try {\n      socket.send(JSON.stringify({ id, method, params }));\n    } catch (error) {\n      clearTimeout(timer);\n      firefoxBidiPending.delete(id);\n      reject(error);\n    }\n  });\n}\n\nasync function connectFirefoxBidi() {\n  if (firefoxBidiReady && firefoxBidiSocket?.readyState === WebSocket.OPEN) return;\n  if (firefoxBidiConnecting) return firefoxBidiConnecting;\n  if (!Number.isInteger(firefoxRemotePort)) throw new Error("firefox_remote_port_unavailable");\n\n  firefoxBidiConnecting = new Promise((resolve, reject) => {\n    const socket = new WebSocket(`ws://127.0.0.1:${firefoxRemotePort}/session`, { handshakeTimeout: FIREFOX_BIDI_CONNECT_TIMEOUT_MS });\n    let opened = false;\n    const failBeforeOpen = (error) => {\n      if (opened) return;\n      try { socket.terminate(); } catch { }\n      reject(error instanceof Error ? error : new Error("firefox_bidi_connect_failed"));\n    };\n    socket.once("error", failBeforeOpen);\n    socket.once("open", async () => {\n      opened = true;\n      firefoxBidiSocket = socket;\n      socket.on("message", handleFirefoxBidiMessage);\n      socket.on("close", () => {\n        if (firefoxBidiSocket !== socket) return;\n        firefoxBidiSocket = null;\n        firefoxBidiReady = false;\n        rejectFirefoxBidiPending(new Error("firefox_bidi_disconnected"));\n      });\n      socket.on("error", () => undefined);\n      try {\n        await sendFirefoxBidiCommand("session.new", { capabilities: { alwaysMatch: {} } }, FIREFOX_BIDI_CONNECT_TIMEOUT_MS);\n        firefoxBidiReady = true;\n        resolve();\n      } catch (error) {\n        if (firefoxBidiSocket === socket) firefoxBidiSocket = null;\n        firefoxBidiReady = false;\n        try { socket.terminate(); } catch { }\n        reject(error);\n      }\n    });\n  });\n\n  try {\n    await firefoxBidiConnecting;\n  } finally {\n    firefoxBidiConnecting = null;\n  }\n}\n\nasync function waitForFirefoxNavigationGuard() {\n  const deadline = Date.now() + FIREFOX_BIDI_STARTUP_TIMEOUT_MS;\n  let lastError = null;\n  while (Date.now() < deadline) {\n    if (!browser || browser.exitCode !== null) throw new Error("firefox_browser_exited_before_guard");\n    try {\n      await connectFirefoxBidi();\n      const tree = await sendFirefoxBidiCommand("browsingContext.getTree", {}, FIREFOX_BIDI_CONNECT_TIMEOUT_MS);\n      if (Array.isArray(tree?.contexts)) return;\n      lastError = new Error("firefox_bidi_contexts_unavailable");\n    } catch (error) {\n      lastError = error;\n      closeFirefoxBidi();\n    }\n    await sleep(250);\n  }\n  throw new Error(lastError instanceof Error ? `firefox_navigation_guard_unavailable:${lastError.message}` : "firefox_navigation_guard_unavailable");\n}\n\nfunction firefoxContextContainsGoogleSorry(contexts) {\n  if (!Array.isArray(contexts)) return false;\n  for (const context of contexts) {\n    if (isGoogleSorryUrl(context?.url)) return true;\n    if (firefoxContextContainsGoogleSorry(context?.children)) return true;\n  }\n  return false;\n}\n\nfunction upstreamUrl() {'''
)

replace_once(
    browser,
    '  if (navigationGuardTimer) clearInterval(navigationGuardTimer);\n  writeSession({ privacyGuard: "blocked", killSwitch: "triggered", killSwitchReason: reason, killSwitchTriggeredAt: new Date().toISOString() });',
    '  if (navigationGuardTimer) clearInterval(navigationGuardTimer);\n  closeFirefoxBidi();\n  writeSession({ privacyGuard: "blocked", killSwitch: "triggered", killSwitchReason: reason, killSwitchTriggeredAt: new Date().toISOString() });'
)

old_guard = '''async function enforceNavigationGuard() {\n  if (browserEngine !== "chrome" || !browser || browser.exitCode !== null || killSwitchTriggered) return;\n  try {\n    const portFile = join(profileDirectory, "DevToolsActivePort");\n    if (!existsSync(portFile)) return;\n    const [portLine] = readFileSync(portFile, "utf8").split(/\\r?\\n/);\n    const port = Number(portLine);\n    if (!Number.isInteger(port) || port < 1 || port > 65535) return;\n    const response = await fetch("http://127.0.0.1:" + port + "/json/list", { signal: AbortSignal.timeout(800) });\n    if (!response.ok) return;\n    const targets = await response.json();\n    const blocked = Array.isArray(targets) && targets.some((target) => {\n      const url = typeof target?.url === "string" ? target.url : "";\n      return /^https?:\\/\\/(?:[^/]+\\.)?google\\.(?:com|com\\.br)\\/sorry(?:[/?#]|$)/i.test(url);\n    });\n    if (blocked) await triggerKillSwitch("google_sorry_detected");\n  } catch { }\n}\n'''
new_guard = '''async function enforceNavigationGuard() {\n  if (!browser || browser.exitCode !== null || killSwitchTriggered) return;\n  try {\n    if (browserEngine === "firefox") {\n      await connectFirefoxBidi();\n      const tree = await sendFirefoxBidiCommand("browsingContext.getTree", {}, 900);\n      firefoxNavigationGuardFailures = 0;\n      if (firefoxContextContainsGoogleSorry(tree?.contexts)) await triggerKillSwitch("google_sorry_detected");\n      return;\n    }\n\n    const portFile = join(profileDirectory, "DevToolsActivePort");\n    if (!existsSync(portFile)) return;\n    const [portLine] = readFileSync(portFile, "utf8").split(/\\r?\\n/);\n    const port = Number(portLine);\n    if (!Number.isInteger(port) || port < 1 || port > 65535) return;\n    const response = await fetch("http://127.0.0.1:" + port + "/json/list", { signal: AbortSignal.timeout(800) });\n    if (!response.ok) return;\n    const targets = await response.json();\n    const blocked = Array.isArray(targets) && targets.some((target) => isGoogleSorryUrl(target?.url));\n    if (blocked) await triggerKillSwitch("google_sorry_detected");\n  } catch {\n    if (browserEngine !== "firefox" || killSwitchTriggered) return;\n    firefoxNavigationGuardFailures += 1;\n    if (firefoxNavigationGuardFailures >= FIREFOX_GUARD_FAILURE_LIMIT) {\n      await triggerKillSwitch("firefox_navigation_guard_unavailable");\n    }\n  }\n}\n'''
replace_once(browser, old_guard, new_guard)

replace_once(
    browser,
    '      configureFirefoxProfile();\n      browser = spawn(executable, ["-profile", profileDirectory, "-new-instance", labelPageUrl], { detached: false, stdio: "ignore", windowsHide: false });',
    '      configureFirefoxProfile();\n      firefoxRemotePort = await allocateLoopbackPort();\n      browser = spawn(executable, ["-profile", profileDirectory, "-new-instance", "--remote-debugging-port", String(firefoxRemotePort), labelPageUrl], { detached: false, stdio: "ignore", windowsHide: false });\n      await waitForFirefoxNavigationGuard();'
)

replace_once(
    browser,
    '    writeSession({ startedAt: new Date().toISOString(), browserEngine, instanceLabelState: "static_tab", observedIp: initialIp, privacyGuard: "protected", googleSorryPrivacyGuard: browserEngine === "chrome" ? "extension_plus_devtools_guard" : "firewall_plus_route_guard", navigationGuard: browserEngine === "chrome" ? "armed" : "not_applicable", killSwitch: "armed", directBrowserEgress: "blocked_by_windows_firewall" });',
    '    writeSession({ startedAt: new Date().toISOString(), browserEngine, instanceLabelState: "static_tab", observedIp: initialIp, privacyGuard: "protected", googleSorryPrivacyGuard: browserEngine === "chrome" ? "extension_plus_devtools_guard" : "webdriver_bidi_guard_plus_firewall_plus_route_guard", navigationGuard: "armed", firefoxRemotePort: browserEngine === "firefox" ? firefoxRemotePort : null, killSwitch: "armed", directBrowserEgress: "blocked_by_windows_firewall" });'
)

replace_once(
    browser,
    '    if (browserEngine === "chrome") {\n      navigationGuardTimer = setInterval(() => { void enforceNavigationGuard(); }, NAVIGATION_GUARD_INTERVAL_MS);\n      navigationGuardTimer.unref?.();\n    }',
    '    navigationGuardTimer = setInterval(() => { void enforceNavigationGuard(); }, NAVIGATION_GUARD_INTERVAL_MS);\n    navigationGuardTimer.unref?.();'
)

replace_once(
    browser,
    '        if (navigationGuardTimer) clearInterval(navigationGuardTimer);\n        const manifestPath = join(profileDirectory, "h2ads-profile.json");',
    '        if (navigationGuardTimer) clearInterval(navigationGuardTimer);\n        closeFirefoxBidi();\n        const manifestPath = join(profileDirectory, "h2ads-profile.json");'
)

replace_once(
    browser,
    '    if (navigationGuardTimer) clearInterval(navigationGuardTimer);\n    writeSession({ privacyGuard: "blocked", killSwitch: "triggered", privacyGuardFailureAt: new Date().toISOString() });\n    const category = error instanceof Error && error.message === "browser_not_found" ? "browser_not_found" : error instanceof Error && error.message.startsWith("privacy_guard_") ? "privacy_guard_blocked" : "browser_launch_failed";',
    '    if (navigationGuardTimer) clearInterval(navigationGuardTimer);\n    closeFirefoxBidi();\n    writeSession({ privacyGuard: "blocked", killSwitch: "triggered", privacyGuardFailureAt: new Date().toISOString(), privacyGuardFailure: error instanceof Error ? error.message.slice(0, 160) : "unknown" });\n    const category = error instanceof Error && error.message === "browser_not_found" ? "browser_not_found" : error instanceof Error && error.message.startsWith("privacy_guard_") ? "privacy_guard_blocked" : error instanceof Error && error.message.startsWith("firefox_navigation_guard_") ? "firefox_navigation_guard_unavailable" : "browser_launch_failed";'
)

replace_once(worker, '$AgentVersion = "1.4.0"', '$AgentVersion = "1.4.1"')
replace_once(
    worker,
    '$ProxyChainPackagePath = Join-Path $WorkerDirectory "node_modules\\proxy-chain\\package.json"\n',
    '$ProxyChainPackagePath = Join-Path $WorkerDirectory "node_modules\\proxy-chain\\package.json"\n$WsPackagePath = Join-Path $WorkerDirectory "node_modules\\ws\\package.json"\n'
)
replace_once(
    worker,
    '@{ name = "h2ads-worker-local"; private = $true; type = "module"; dependencies = @{ "proxy-chain" = "3.0.0" } } | ConvertTo-Json -Compress | Set-Content -Path $PackagePath -Encoding UTF8 -NoNewline\n  if (!(Test-Path $ProxyChainPackagePath)) {',
    '@{ name = "h2ads-worker-local"; private = $true; type = "module"; dependencies = @{ "proxy-chain" = "3.0.0"; "ws" = "8.21.3" } } | ConvertTo-Json -Compress | Set-Content -Path $PackagePath -Encoding UTF8 -NoNewline\n  if (!(Test-Path $ProxyChainPackagePath) -or !(Test-Path $WsPackagePath)) {'
)
replace_once(
    worker,
    '    if ($LASTEXITCODE -ne 0) { throw "Não foi possível preparar o relay local deste Worker." }',
    '    if ($LASTEXITCODE -ne 0) { throw "Não foi possível preparar os componentes de proteção local deste Worker." }'
)

print("Firefox Google Sorry guard + Worker 1.4.1 aplicados.")
