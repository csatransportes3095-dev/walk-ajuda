import fs from 'node:fs';

function replaceOnce(file, before, after) {
  const source = fs.readFileSync(file, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${file}: esperado 1 trecho, encontrado ${count}`);
  fs.writeFileSync(file, source.replace(before, after));
}

// 1) Router ADM: permitir escolher Chrome ou Firefox no momento da abertura.
{
  const file = 'server/routers/h2ads.ts';
  replaceOnce(file,
    'import { assignH2AdsInstanceWorkerPortable } from "../h2adsProfilePortability";\n',
    'import { assignH2AdsInstanceWorkerPortable } from "../h2adsProfilePortability";\nimport { setH2AdsBrowserEngine } from "../h2adsBrowserEngine";\n'
  );
  replaceOnce(file,
    'export const h2AdsBrowserManualCommandSchema = z.object({\n  instanceId: z.number().int().positive(),\n}).strict();',
    'export const h2AdsBrowserManualCommandSchema = z.object({\n  instanceId: z.number().int().positive(),\n  engine: z.enum(["chrome", "firefox"]).optional(),\n}).strict();'
  );
  replaceOnce(file,
    '  launchBrowser: adminProcedure.input(h2AdsBrowserManualCommandSchema).mutation(async ({ input }) => {\n    await requireConfigurableInstance(input.instanceId);\n    try {\n      return { success: true, ...(await requestH2AdsBrowserLaunch(input.instanceId)) };',
    '  launchBrowser: adminProcedure.input(h2AdsBrowserManualCommandSchema).mutation(async ({ input }) => {\n    await requireConfigurableInstance(input.instanceId);\n    try {\n      await setH2AdsBrowserEngine(input.instanceId, input.engine ?? "chrome");\n      return { success: true, ...(await requestH2AdsBrowserLaunch(input.instanceId)) };'
  );
}

// 2) Worker route: enviar a preferência de navegador junto com a rota protegida.
{
  const file = 'server/h2adsWorkerRoute.ts';
  replaceOnce(file,
    'import { openH2AdsProfileSnapshot, recordH2AdsProfileRestoreResult, storeH2AdsProfileSnapshot } from "./h2adsProfileSnapshots";\n',
    'import { openH2AdsProfileSnapshot, recordH2AdsProfileRestoreResult, storeH2AdsProfileSnapshot } from "./h2adsProfileSnapshots";\nimport { getH2AdsBrowserEngine } from "./h2adsBrowserEngine";\n'
  );
  replaceOnce(file,
    '      const instance = await getH2AdsInstance(command.instanceId);\n      const instanceName = workerString(instance?.name) ?? `Instância ${command.instanceId}`;\n      res.status(200).json({\n        command: { id: command.id, instanceId: command.instanceId, command: command.command },\n        proxy: { ...proxy, instanceName },\n      });',
    '      const instance = await getH2AdsInstance(command.instanceId);\n      const instanceName = workerString(instance?.name) ?? `Instância ${command.instanceId}`;\n      const browserEngine = await getH2AdsBrowserEngine(command.instanceId);\n      res.status(200).json({\n        command: { id: command.id, instanceId: command.instanceId, command: command.command },\n        proxy: { ...proxy, instanceName, browserEngine },\n      });'
  );
}

// 3) Worker Windows: Firefox dedicado opcional, firewall próprio e perfis separados.
{
  const file = 'workers/windows/H2AdsWorker.ps1';
  replaceOnce(file, '$AgentVersion = "1.3.8"', '$AgentVersion = "1.4.0"');
  replaceOnce(file,
    '$DedicatedChromePath = Join-Path $DedicatedBrowserDirectory "chrome.exe"\n$FirewallRuleV4Name = "H2ADS Dedicated Chrome - Block Direct IPv4"\n$FirewallRuleV6Name = "H2ADS Dedicated Chrome - Block Direct IPv6"',
    '$DedicatedChromePath = Join-Path $DedicatedBrowserDirectory "chrome.exe"\n$DedicatedFirefoxDirectory = Join-Path $WorkerDirectory "browser\\firefox"\n$DedicatedFirefoxPath = Join-Path $DedicatedFirefoxDirectory "firefox.exe"\n$FirewallRuleV4Name = "H2ADS Dedicated Chrome - Block Direct IPv4"\n$FirewallRuleV6Name = "H2ADS Dedicated Chrome - Block Direct IPv6"\n$FirefoxFirewallRuleV4Name = "H2ADS Dedicated Firefox - Block Direct IPv4"\n$FirefoxFirewallRuleV6Name = "H2ADS Dedicated Firefox - Block Direct IPv6"'
  );
  replaceOnce(file,
    'function Assert-GoogleChromeSignature([string]$Path) {',
    `function Get-SystemFirefoxExecutable {
  $candidates = @(
    (Join-Path $env:ProgramFiles "Mozilla Firefox\\firefox.exe"),
    $(if (\${env:ProgramFiles(x86)}) { Join-Path \${env:ProgramFiles(x86)} "Mozilla Firefox\\firefox.exe" }),
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Mozilla Firefox\\firefox.exe" })
  ) | Where-Object { $_ -and (Test-Path $_) }
  return $candidates | Select-Object -First 1
}

function Assert-MozillaFirefoxSignature([string]$Path) {
  if (!(Test-Path $Path)) { throw "Firefox dedicado do H2ADS não está disponível." }
  $signature = Get-AuthenticodeSignature -FilePath $Path
  if ($signature.Status -ne "Valid" -or !$signature.SignerCertificate -or $signature.SignerCertificate.Subject -notmatch '(?i)Mozilla') {
    throw "A assinatura do Firefox usado pelo H2ADS não pôde ser validada."
  }
}

function Ensure-DedicatedFirefox {
  if (Test-Path $DedicatedFirefoxPath) {
    Assert-MozillaFirefoxSignature $DedicatedFirefoxPath
    return
  }
  $sourceFirefox = Get-SystemFirefoxExecutable
  if (!$sourceFirefox) { throw "Mozilla Firefox não está instalado neste Worker." }
  Assert-MozillaFirefoxSignature $sourceFirefox
  $sourceDirectory = Split-Path $sourceFirefox -Parent
  if (Test-Path $DedicatedFirefoxDirectory) { Remove-Item -Recurse -Force $DedicatedFirefoxDirectory }
  New-Item -ItemType Directory -Force -Path $DedicatedFirefoxDirectory | Out-Null
  Copy-Item -Path (Join-Path $sourceDirectory "*") -Destination $DedicatedFirefoxDirectory -Recurse -Force
  Assert-MozillaFirefoxSignature $DedicatedFirefoxPath
}

function Assert-GoogleChromeSignature([string]$Path) {`
  );
  replaceOnce(file,
    'function Read-PairingCode {',
    `function Test-H2AdsFirefoxFirewall {
  if (!(Get-Command Get-NetFirewallRule -ErrorAction SilentlyContinue)) { return $false }
  foreach ($ruleName in @($FirefoxFirewallRuleV4Name, $FirefoxFirewallRuleV6Name)) {
    $rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq "True" -and $_.Direction -eq "Outbound" -and $_.Action -eq "Block" } | Select-Object -First 1
    if (!$rule) { return $false }
    $application = $rule | Get-NetFirewallApplicationFilter
    if (!$application -or !([string]$application.Program).Equals($DedicatedFirefoxPath, [StringComparison]::OrdinalIgnoreCase)) { return $false }
  }
  return $true
}

function Ensure-H2AdsFirefoxFirewall {
  if (Test-H2AdsFirefoxFirewall) { return }
  if (!(Test-IsAdministrator)) { throw "Firewall Firefox H2ADS obrigatório ausente. Atualize o Worker como Administrador." }
  Get-NetFirewallRule -DisplayName $FirefoxFirewallRuleV4Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  Get-NetFirewallRule -DisplayName $FirefoxFirewallRuleV6Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $FirefoxFirewallRuleV4Name -Direction Outbound -Program $DedicatedFirefoxPath -Action Block -Protocol Any -RemoteAddress @("0.0.0.0-126.255.255.255", "128.0.0.0-255.255.255.255") -Profile Any -Enabled True | Out-Null
  New-NetFirewallRule -DisplayName $FirefoxFirewallRuleV6Name -Direction Outbound -Program $DedicatedFirefoxPath -Action Block -Protocol Any -RemoteAddress "Internet6" -Profile Any -Enabled True | Out-Null
  if (!(Test-H2AdsFirefoxFirewall)) { throw "O kill switch rígido do Firefox H2ADS não foi aplicado corretamente." }
}

function Read-PairingCode {`
  );
  replaceOnce(file,
    'function Invoke-BrowserSession([object]$Config, [object]$Payload) {\n  $profileDirectory = Join-Path $ProfilesDirectory "instance-$($Payload.command.instanceId)"\n  if (!(Test-Path (Join-Path $profileDirectory "h2ads-profile.json"))) { throw "Perfil local não preparado." }\n  Ensure-DedicatedBrowser\n  Ensure-H2AdsBrowserFirewall',
    `function Invoke-BrowserSession([object]$Config, [object]$Payload) {
  $engine = if ([string]$Payload.proxy.browserEngine -eq "firefox") { "firefox" } else { "chrome" }
  $profileDirectory = if ($engine -eq "firefox") { Join-Path $ProfilesDirectory "instance-$($Payload.command.instanceId)-firefox" } else { Join-Path $ProfilesDirectory "instance-$($Payload.command.instanceId)" }
  New-Item -ItemType Directory -Force -Path $profileDirectory | Out-Null
  $manifestPath = Join-Path $profileDirectory "h2ads-profile.json"
  if (!(Test-Path $manifestPath)) { @{ instanceId = [int]$Payload.command.instanceId; browserEngine = $engine; profileVersion = 1; createdAt = (Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json -Compress | Set-Content -Path $manifestPath -Encoding UTF8 -NoNewline }
  if ($engine -eq "firefox") {
    Ensure-DedicatedFirefox
    Ensure-H2AdsFirefoxFirewall
    $browserExecutable = $DedicatedFirefoxPath
  } else {
    Ensure-DedicatedBrowser
    Ensure-H2AdsBrowserFirewall
    $browserExecutable = $DedicatedChromePath
  }`
  );
  replaceOnce(file,
    '  $env:H2ADS_PROFILE_DIRECTORY = $profileDirectory\n  $env:H2ADS_BROWSER_EXECUTABLE = $DedicatedChromePath',
    '  $env:H2ADS_PROFILE_DIRECTORY = $profileDirectory\n  $env:H2ADS_BROWSER_EXECUTABLE = $browserExecutable\n  $env:H2ADS_BROWSER_ENGINE = $engine'
  );
  replaceOnce(file,
    '    Remove-Item Env:H2ADS_PANEL_URL, Env:H2ADS_WORKER_KEY, Env:H2ADS_WORKER_TOKEN, Env:H2ADS_INSTANCE_ID, Env:H2ADS_COMMAND_ID, Env:H2ADS_PROXY_JSON, Env:H2ADS_PROFILE_DIRECTORY, Env:H2ADS_BROWSER_EXECUTABLE -ErrorAction SilentlyContinue',
    '    Remove-Item Env:H2ADS_PANEL_URL, Env:H2ADS_WORKER_KEY, Env:H2ADS_WORKER_TOKEN, Env:H2ADS_INSTANCE_ID, Env:H2ADS_COMMAND_ID, Env:H2ADS_PROXY_JSON, Env:H2ADS_PROFILE_DIRECTORY, Env:H2ADS_BROWSER_EXECUTABLE, Env:H2ADS_BROWSER_ENGINE -ErrorAction SilentlyContinue'
  );
  replaceOnce(file,
    '  $profileDirectory = Join-Path $ProfilesDirectory "instance-$instanceId"\n  $sessionPath = Join-Path $profileDirectory "h2ads-browser-session.json"\n  if (Test-Path $sessionPath) {\n    $session = Get-Content -Raw -Path $sessionPath | ConvertFrom-Json\n    if ($session.nodePid) {\n      $nodePid = [int]$session.nodePid\n      if (Get-Process -Id $nodePid -ErrorAction SilentlyContinue) {\n        & taskkill.exe /PID $nodePid /T /F 1>$null 2>$null\n      }\n    }\n    Remove-Item -Force $sessionPath -ErrorAction SilentlyContinue\n  }',
    `  $chromeProfileDirectory = Join-Path $ProfilesDirectory "instance-$instanceId"
  $firefoxProfileDirectory = Join-Path $ProfilesDirectory "instance-$instanceId-firefox"
  foreach ($profileDirectory in @($chromeProfileDirectory, $firefoxProfileDirectory)) {
    $sessionPath = Join-Path $profileDirectory "h2ads-browser-session.json"
    if (Test-Path $sessionPath) {
      $session = Get-Content -Raw -Path $sessionPath | ConvertFrom-Json
      if ($session.nodePid) {
        $nodePid = [int]$session.nodePid
        if (Get-Process -Id $nodePid -ErrorAction SilentlyContinue) { & taskkill.exe /PID $nodePid /T /F 1>$null 2>$null }
      }
      Remove-Item -Force $sessionPath -ErrorAction SilentlyContinue
    }
  }`
  );
  replaceOnce(file,
    '  if ($message -like "*Chrome dedicado*" -or $message -like "*Google Chrome*") { return "dedicated_browser_unavailable" }',
    '  if ($message -like "*Firefox dedicado*" -or $message -like "*Mozilla Firefox*") { return "firefox_unavailable" }\n  if ($message -like "*Chrome dedicado*" -or $message -like "*Google Chrome*") { return "dedicated_browser_unavailable" }'
  );
  replaceOnce(file,
    '  Ensure-DedicatedBrowser\n  Ensure-H2AdsBrowserFirewall\n  Ensure-WorkerScheduledTask',
    '  Ensure-DedicatedBrowser\n  Ensure-H2AdsBrowserFirewall\n  if (Get-SystemFirefoxExecutable) { Ensure-DedicatedFirefox; Ensure-H2AdsFirefoxFirewall }\n  Ensure-WorkerScheduledTask'
  );
  replaceOnce(file,
    '  Ensure-DedicatedBrowser\n  Ensure-H2AdsBrowserFirewall\n  Start-InstalledWorker',
    '  Ensure-DedicatedBrowser\n  Ensure-H2AdsBrowserFirewall\n  if (Get-SystemFirefoxExecutable) { Ensure-DedicatedFirefox; Ensure-H2AdsFirefoxFirewall }\n  Start-InstalledWorker'
  );
}

// 4) Session runner: Firefox com user.js próprio e Chrome com monitor local de páginas de bloqueio.
{
  const file = 'workers/windows/browser-session.mjs';
  replaceOnce(file,
    'const IP_CHECK_INTERVAL_MS = 15_000;\nconst KILL_SWITCH_CHECK_INTERVAL_MS = 5_000;',
    'const IP_CHECK_INTERVAL_MS = 10_000;\nconst KILL_SWITCH_CHECK_INTERVAL_MS = 2_000;\nconst NAVIGATION_GUARD_INTERVAL_MS = 1_000;'
  );
  replaceOnce(file,
    'const browserExecutable = process.env.H2ADS_BROWSER_EXECUTABLE;\nconst proxy = JSON.parse(process.env.H2ADS_PROXY_JSON);',
    'const browserExecutable = process.env.H2ADS_BROWSER_EXECUTABLE;\nconst browserEngine = process.env.H2ADS_BROWSER_ENGINE === "firefox" ? "firefox" : "chrome";\nconst proxy = JSON.parse(process.env.H2ADS_PROXY_JSON);'
  );
  replaceOnce(file,
    'let killSwitchTimer;\nlet rotationInProgress = false;',
    'let killSwitchTimer;\nlet navigationGuardTimer;\nlet rotationInProgress = false;'
  );
  replaceOnce(file,
    'function chromeExecutable() {',
    'function selectedBrowserExecutable() {'
  );
  replaceOnce(file,
    '  if (killSwitchTimer) clearInterval(killSwitchTimer);\n  writeSession({ privacyGuard: "blocked"',
    '  if (killSwitchTimer) clearInterval(killSwitchTimer);\n  if (navigationGuardTimer) clearInterval(navigationGuardTimer);\n  writeSession({ privacyGuard: "blocked"'
  );
  replaceOnce(file,
    'function escapeHtml(value) {',
    `async function enforceNavigationGuard() {
  if (browserEngine !== "chrome" || !browser || browser.exitCode !== null || killSwitchTriggered) return;
  try {
    const portFile = join(profileDirectory, "DevToolsActivePort");
    if (!existsSync(portFile)) return;
    const [portLine] = readFileSync(portFile, "utf8").split(/\\r?\\n/);
    const port = Number(portLine);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return;
    const response = await fetch("http://127.0.0.1:" + port + "/json/list", { signal: AbortSignal.timeout(800) });
    if (!response.ok) return;
    const targets = await response.json();
    const blocked = Array.isArray(targets) && targets.some((target) => {
      const url = typeof target?.url === "string" ? target.url : "";
      return /^https?:\\/\\/(?:[^/]+\\.)?google\\.(?:com|com\\.br)\\/sorry(?:[/?#]|$)/i.test(url);
    });
    if (blocked) await triggerKillSwitch("google_sorry_detected");
  } catch { }
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
  writeFileSync(join(profileDirectory, "user.js"), preferences.join("\\n") + "\\n", { encoding: "utf8", mode: 0o600 });
}

function escapeHtml(value) {`
  );
  replaceOnce(file,
    '    const executable = chromeExecutable();',
    '    const executable = selectedBrowserExecutable();'
  );
  replaceOnce(file,
    '    const privacyGuardExtension = createGoogleSorryPrivacyGuard();\n    browser = spawn(executable, [\n      `--user-data-dir=${profileDirectory}`,\n      `--proxy-server=http://127.0.0.1:${relayPort}`,\n      "--proxy-bypass-list=<-loopback>",\n      "--disable-quic",\n      "--dns-prefetch-disable",\n      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",\n      `--load-extension=${privacyGuardExtension}`,\n      "--no-first-run",\n      "--no-default-browser-check",\n      labelPageUrl,\n    ], { detached: false, stdio: "ignore", windowsHide: false });\n    writeSession({ startedAt: new Date().toISOString(), instanceLabelState: "static_tab", observedIp: initialIp, privacyGuard: "protected", googleSorryPrivacyGuard: "enabled_v3", killSwitch: "armed", directBrowserEgress: "blocked_by_windows_firewall" });',
    `    if (browserEngine === "firefox") {
      configureFirefoxProfile();
      browser = spawn(executable, ["-profile", profileDirectory, "-new-instance", labelPageUrl], { detached: false, stdio: "ignore", windowsHide: false });
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
    writeSession({ startedAt: new Date().toISOString(), browserEngine, instanceLabelState: "static_tab", observedIp: initialIp, privacyGuard: "protected", googleSorryPrivacyGuard: browserEngine === "chrome" ? "extension_plus_devtools_guard" : "firewall_plus_route_guard", navigationGuard: browserEngine === "chrome" ? "armed" : "not_applicable", killSwitch: "armed", directBrowserEgress: "blocked_by_windows_firewall" });`
  );
  replaceOnce(file,
    '    killSwitchTimer = setInterval(() => { void enforceKillSwitch(); }, KILL_SWITCH_CHECK_INTERVAL_MS);\n    killSwitchTimer.unref?.();',
    '    killSwitchTimer = setInterval(() => { void enforceKillSwitch(); }, KILL_SWITCH_CHECK_INTERVAL_MS);\n    killSwitchTimer.unref?.();\n    if (browserEngine === "chrome") {\n      navigationGuardTimer = setInterval(() => { void enforceNavigationGuard(); }, NAVIGATION_GUARD_INTERVAL_MS);\n      navigationGuardTimer.unref?.();\n    }'
  );
  replaceOnce(file,
    '        if (killSwitchTimer) clearInterval(killSwitchTimer);\n        const manifestPath',
    '        if (killSwitchTimer) clearInterval(killSwitchTimer);\n        if (navigationGuardTimer) clearInterval(navigationGuardTimer);\n        const manifestPath'
  );
  replaceOnce(file,
    '        await uploadProfileSnapshot().catch(() => undefined);',
    '        if (browserEngine === "chrome") await uploadProfileSnapshot().catch(() => undefined);'
  );
  replaceOnce(file,
    '    if (killSwitchTimer) clearInterval(killSwitchTimer);\n    writeSession({ privacyGuard: "blocked"',
    '    if (killSwitchTimer) clearInterval(killSwitchTimer);\n    if (navigationGuardTimer) clearInterval(navigationGuardTimer);\n    writeSession({ privacyGuard: "blocked"'
  );
}

// 5) Painel: manter o Abrir Chrome e acrescentar Firefox protegido.
{
  const file = 'client/src/pages/H2Ads.tsx';
  replaceOnce(file,
    '  const requestBrowserLaunch = async (instanceId: number) => {\n    setAction(instanceId, "Abrindo browser no Windows...");\n    try {\n      await launchBrowser.mutateAsync({ instanceId });\n      toast.success("Comando de abertura enviado.");',
    '  const requestBrowserLaunch = async (instanceId: number, engine: "chrome" | "firefox" = "chrome") => {\n    setAction(instanceId, engine === "firefox" ? "Abrindo Firefox protegido..." : "Abrindo Chrome protegido...");\n    try {\n      await launchBrowser.mutateAsync({ instanceId, engine });\n      toast.success(engine === "firefox" ? "Abertura do Firefox protegido enviada." : "Abertura do Chrome protegido enviada.");'
  );
  replaceOnce(file,
    'onLaunchBrowser: (instanceId: number) => void;',
    'onLaunchBrowser: (instanceId: number, engine?: "chrome" | "firefox") => void;'
  );
  replaceOnce(file,
    'onLaunchBrowser: (instanceId: number) => void;',
    'onLaunchBrowser: (instanceId: number, engine?: "chrome" | "firefox") => void;'
  );
  replaceOnce(file,
    '<Play className="h-3 w-3" />Abrir</button><button type="button" disabled={instanceBusy || !canClose}',
    '<Play className="h-3 w-3" />Chrome</button><button type="button" disabled={instanceBusy || !canLaunch} onClick={() => onLaunchBrowser(instance.id, "firefox")} className="inline-flex items-center gap-1 rounded-lg border border-orange-400/30 bg-orange-400/10 px-2 py-1.5 text-[11px] font-black text-orange-100 disabled:cursor-not-allowed disabled:opacity-45"><ShieldCheck className="h-3 w-3" />Firefox</button><button type="button" disabled={instanceBusy || !canClose}'
  );
  replaceOnce(file,
    '<p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-200">Sessão local</p>',
    '<div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-200">Sessão local</p><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-100">Proteção máxima</span></div>'
  );
}

console.log('Patch H2ADS Firefox + Chrome Security aplicado com sucesso.');
