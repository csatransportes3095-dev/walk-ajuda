from pathlib import Path

p = Path('workers/windows/browser-session.mjs')
s = p.read_text(encoding='utf-8')


def once(old: str, new: str, label: str) -> None:
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    s = s.replace(old, new, 1)


once(
    'let killSwitchTriggered = false;\nlet browserProbeInProgress = false;',
    'let killSwitchTriggered = false;\nlet browserProbeInProgress = false;\nlet privacyGuardTimer;\nlet privacyGuardCheckInProgress = false;',
    'privacy guard state',
)

start = s.index('function createGoogleSorryPrivacyGuard() {')
end = s.index('\nasync function rotateRelay()', start)
replacement = r'''function createGoogleSorryPrivacyGuard() {
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
    const googleHost = host === "google.com" || host.endsWith(".google.com") || host === "google.com.br" || host.endsWith(".google.com.br");
    return googleHost && (url.pathname === "/sorry" || url.pathname.startsWith("/sorry/"));
  } catch { return false; }
}

function readDevToolsPort() {
  const activePortPath = join(profileDirectory, "DevToolsActivePort");
  if (!existsSync(activePortPath)) return null;
  try {
    const port = Number(readFileSync(activePortPath, "utf8").split(/\r?\n/)[0]);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
  } catch { return null; }
}

async function navigateDevToolsTarget(webSocketDebuggerUrl, url) {
  if (!webSocketDebuggerUrl) return false;
  return await new Promise((resolve) => {
    let done = false;
    let ws;
    const finish = (value) => {
      if (done) return;
      done = true;
      try { ws?.close(); } catch { }
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), 2500);
    timer.unref?.();
    try {
      ws = new WebSocket(webSocketDebuggerUrl);
      ws.addEventListener("open", () => {
        try { ws.send(JSON.stringify({ id: 1, method: "Page.navigate", params: { url } })); }
        catch { finish(false); }
      }, { once: true });
      ws.addEventListener("message", (event) => {
        try {
          const msg = JSON.parse(String(event.data || ""));
          if (msg?.id === 1) { clearTimeout(timer); finish(!msg.error); }
        } catch { }
      });
      ws.addEventListener("error", () => { clearTimeout(timer); finish(false); }, { once: true });
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
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return;
    const targets = await response.json();
    if (!Array.isArray(targets)) return;
    for (const target of targets) {
      if (target?.type !== "page" || !isGoogleSorryUrl(target?.url)) continue;
      if (await navigateDevToolsTarget(target.webSocketDebuggerUrl, blockedPageUrl)) {
        writeSession({ privacyGuard: "protected", googleSorryPrivacyGuard: "cdp_local_redirect_v1", googleSorryBlockedAt: new Date().toISOString() });
      }
    }
  } catch {
    // Best effort only. Proxy and firewall enforcement remain independent.
  } finally {
    privacyGuardCheckInProgress = false;
  }
}
'''
s = s[:start] + replacement + s[end:]

old_launch = '''    const privacyGuardExtension = createGoogleSorryPrivacyGuard();
    browser = spawn(executable, [
      `--user-data-dir=${profileDirectory}`, `--proxy-server=http://127.0.0.1:${relayPort}`, "--proxy-bypass-list=<-loopback>",
      "--disable-quic", "--dns-prefetch-disable", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      `--load-extension=${privacyGuardExtension}`, "--no-first-run", "--no-default-browser-check", labelPageUrl,
    ], { detached: false, stdio: "ignore", windowsHide: false });'''
new_launch = '''    const privacyGuardPageUrl = createGoogleSorryPrivacyGuard();
    browser = spawn(executable, [
      `--user-data-dir=${profileDirectory}`, `--proxy-server=http://127.0.0.1:${relayPort}`, "--proxy-bypass-list=<-loopback>",
      "--disable-quic", "--dns-prefetch-disable", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check", labelPageUrl,
    ], { detached: false, stdio: "ignore", windowsHide: false });
    privacyGuardTimer = setInterval(() => { void enforceGoogleSorryPrivacyGuard(privacyGuardPageUrl); }, 750);
    privacyGuardTimer.unref?.();'''
once(old_launch, new_launch, 'browser launch')

once(
    '        if (killSwitchTimer) clearInterval(killSwitchTimer);\n        const manifestPath = join(profileDirectory, "h2ads-profile.json");',
    '        if (killSwitchTimer) clearInterval(killSwitchTimer);\n        if (privacyGuardTimer) clearInterval(privacyGuardTimer);\n        const manifestPath = join(profileDirectory, "h2ads-profile.json");',
    'browser exit cleanup',
)

once(
    '    if (killSwitchTimer) clearInterval(killSwitchTimer);\n    const reason = error instanceof Error ? error.message : "browser_launch_failed";',
    '    if (killSwitchTimer) clearInterval(killSwitchTimer);\n    if (privacyGuardTimer) clearInterval(privacyGuardTimer);\n    const reason = error instanceof Error ? error.message : "browser_launch_failed";',
    'launch failure cleanup',
)

if '--load-extension=' in s:
    raise SystemExit('legacy --load-extension flag still present')
for marker in [
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    'googleSorryPrivacyGuard: "cdp_local_redirect_v1"',
    'isGoogleSorryUrl',
    'Page.navigate',
]:
    if marker not in s:
        raise SystemExit(f'missing marker: {marker}')

p.write_text(s, encoding='utf-8')
print('OK: Privacy Guard local/CDP aplicado sem contornar reCAPTCHA.')
