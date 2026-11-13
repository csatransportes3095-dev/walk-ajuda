import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("H2 Android native isolated architecture", () => {
  it("uses a single proxy mode and validates HTTP/TCP from inside the Android guest", () => {
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    const installer = read("workers/windows/Install-H2Android.ps1");
    expect(agent).not.toContain("function Set-H2AndroidGlobalProxy");
    expect(agent).toContain("function Clear-H2AndroidGlobalProxy");
    expect(agent).toContain("function Assert-H2AndroidProxyOrStop");
    expect(agent).toContain("function Test-H2AndroidTcpIp");
    expect(agent).toContain("toybox nc -w 12");
    expect(agent).toContain('"settings","put","global","http_proxy",":0"');
    expect(agent).toContain('Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"emu","kill")');
    expect(agent.split("Assert-H2AndroidProxyOrStop -Adb $Adb -Serial $BootSerial -RelayPort $RelayPort").length - 1).toBe(2);
    expect(agent).toContain('1.3.0-live-socks-switch');
    expect(installer).toContain('1.3.0-live-socks-switch');
  });


  it("never labels a host-only SOCKS5 test as Android app traffic validation", () => {
    const admin = read("client/src/pages/AdminH2Android.tsx");
    expect(admin).toContain("Teste TCP/HTTP do Android; confira o IP no navegador");
    expect(admin).toContain("IP retornado no teste de rede:");
    expect(admin).toContain("confira também no navegador do Android.");
    expect(admin).toContain("Confira o IP público DENTRO do Android");
    expect(admin).not.toContain("IP externo verificado pelo agente");
    expect(admin).not.toContain('text-emerald-300">IP externo testado:');
  });


  it("accepts long emulator completion errors instead of leaving Android preparing", () => {
    const route = read("server/h2AndroidAgentRoute.ts");
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    expect(route).toContain('req.body.error.trim().slice(0, 500)');
    expect(route).toContain("finishAndroidJob(agentId, { jobId, success");
    expect(agent).toContain("$ErrorText.Substring(0,500)");
    expect(agent).toContain("JOB_COMPLETE_RETRY");
    expect(agent).toContain("$CompletionAttempt -le 3");
    expect(agent).toContain("Servidor nao confirmou a conclusao");
  });

  it("does not block Android boot on unread emulator diagnostics", () => {
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    expect(agent).toContain("-RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog");
    expect(agent).toContain("-FilePath $Emulator");
    expect(agent).toContain("Get-Content -LiteralPath $File -Tail 500");
    expect(agent).toContain("function Get-H2EmulatorDiagnostic");
    expect(agent).not.toContain("$Info.RedirectStandardOutput = $true");
    expect(agent).not.toContain("$Info.RedirectStandardError = $true");
    expect(agent).not.toContain("$Proc.StandardOutput.ReadToEnd()");
    expect(agent).not.toContain("$Proc.StandardError.ReadToEnd()");
  });

  it("lets ADM browse proxies without exposing credentials and delete only unused available records", () => {
    const routerCode = read("server/routers/h2Android.ts");
    const dashboard = read("client/src/pages/AdminH2Android.tsx");
    expect(routerCode).toContain("listProxies: adminProcedure");
    expect(routerCode).toContain("deleteProxies: adminProcedure");
    expect(routerCode).toContain('confirmed: z.literal(true)');
    expect(routerCode).toContain('mode: z.enum(["selected", "allAvailable"])');
    expect(routerCode).toContain("status='available' AND profileId IS NULL");
    expect(routerCode.match(/NOT EXISTS \(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(routerCode).toContain("h2_android_native_profiles p");
    expect(routerCode).toContain("Existe proxy ocupado, protegido ou já excluído.");
    expect(routerCode).toContain("ORDER BY x.id LIMIT 81");
    expect(routerCode).toContain("return { deleted: affected(result) }");
    expect(dashboard).toContain("trpc.h2Android.listProxies.useQuery");
    expect(dashboard).toContain("trpc.h2Android.deleteProxies.useMutation");
    expect(dashboard).toContain("Excluir selecionados");
    expect(dashboard).toContain("Limpar todos os disponíveis");
    expect(dashboard).toContain('proxyDeleteConfirmText!=="EXCLUIR"');
    expect(dashboard).toContain('disabled={p.status!=="available" || deleteProxies.isPending}');
  });

  it("skips legacy HTTP proxies during both creation and rotation", () => {
    const routerCode = read("server/routers/h2Android.ts");
    expect(routerCode).toContain("async function findAvailableSocks5Proxy");
    expect(routerCode).toContain("String(proxy.protocol).toLowerCase() === 'socks5'");
    expect(routerCode.match(/await findAvailableSocks5Proxy\(tx\)/g)?.length).toBe(2);
    expect(routerCode).toContain("Invalid legacy record: never allocate it.");
  });
  it("rotates SOCKS5 upstream without rebooting and can rollback to original proxy", () => {
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    const relay = read("workers/windows/H2AndroidSocksRelay.mjs");
    const router = read("server/routers/h2Android.ts");
    const admin = read("client/src/pages/AdminH2Android.tsx");
    expect(router).toContain("CREATE TABLE IF NOT EXISTS h2_android_proxy_rotations");
    expect(router).toContain('if (profileState === "running")');
    expect(router).toContain("status='rotating'");
    expect(router).toContain("'rotate','queued'");
    expect(router).toContain('if (job.action === "rotate")');
    expect(router).toContain("previousProxyId: rotation");
    expect(router).toContain('previousProxy: rotation');
    expect(agent).toContain('    "rotate" {');
    expect(agent).toContain("Switch-H2RelayUpstream");
    expect(agent).toContain("Job.previousProxyId");
    expect(agent).toContain("Job.previousProxy");
    expect(agent).toContain("proxy antigo restaurado no Android");
    expect(relay).toContain("const control = http.createServer");
    expect(relay).toContain("activeUpstream = next");
    expect(relay).toContain("control.listen(0, '127.0.0.1'");
    expect(relay).toContain("client.pipe(upstream)");
    expect(admin).toContain('["stopped", "error", "running"].includes(p.state)');
    expect(admin).toContain("Trocar proxy AGORA sem desligar o Android");
  });

  it("keeps separate SOCKS5 relays alive while Android is running and verifies installer rollback", () => {
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    const relay = read("workers/windows/H2AndroidSocksRelay.mjs");
    const installer = read("workers/windows/Install-H2Android.ps1");
    expect(agent).toContain("function Get-H2RelayReadyFile");
    expect(agent).toContain("function Test-H2RelayProcess");
    expect(agent).toContain("function Start-H2SocksRelay");
    expect(agent).toContain("function Stop-H2SocksRelay");
    expect(agent).toContain("H2_RELAY_PROXY_ID");
    expect(agent).toContain("--h2-instance");
    expect(agent).toContain("-ProxyId ([string]$Job.proxyId)");
    expect(agent).toContain("-HeartbeatJobId ([long]$Job.id)");
    expect(agent).not.toContain("$script:SocksRelayPort");
    expect(relay).toContain("socket.read(size)");
    expect(relay).toContain("H2_RELAY_READY_FILE");
    expect(relay).toContain("H2_RELAY_PROXY_ID");
    expect(relay).toContain("connectSocks");
    expect(relay).toContain("client.pipe(upstream)");
    expect(installer).toContain("H2AndroidSocksRelay.previous.mjs");
    expect(installer).toContain("--check $RelayTempPath");
  });

  it("renews boot-job leases and marks abandoned provisioning without releasing proxy or AVD", () => {
    const routerCode = read("server/routers/h2Android.ts");
    const routeCode = read("server/h2AndroidAgentRoute.ts");
    const admin = read("client/src/pages/AdminH2Android.tsx");
    expect(routerCode).toContain("SET claimedAt=NOW()");
    expect(routerCode).toContain("proxyId: String(proxyRow.proxyId)");
    expect(routerCode).toContain("INTERVAL 30 MINUTE");
    expect(routerCode).toContain("p.state IN ('provisioning','starting','queued')");
    expect(routerCode).toContain("proxyEndpoint:");
    expect(routeCode).toContain("heartbeatAndroidAgent(agentId, computerName, version, jobId)");
    expect(admin).toContain("p.proxyEndpoint");
  });
  it("keeps the H2-only language workflow bounded and avoids system-property hacks", () => {
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    expect(agent).toContain("for ($Step = 0; $Step -lt 24; $Step++)");
    expect(agent).toContain("com\\.android\\.settings");
    expect(agent).toContain("Set-H2LocaleFromSettings -Adb $Adb -Serial $Serial");
    expect(agent).toContain("Get-H2LanguageUi");
    expect(agent).not.toContain('"update-config"');
    expect(agent).not.toContain("setprop persist.sys.locale pt-BR");
    expect(agent.match(/^while \(\$true\) \{$/gm)?.length).toBe(1);
  });

  it("keeps an explicit error notice after rotating a failed Android proxy", () => {
    const router = read("server/routers/h2Android.ts");
    const admin = read("client/src/pages/AdminH2Android.tsx");
    expect(router).toContain("O Android continua em erro e ainda não foi testado com o novo proxy.");
    expect(router).toContain('profileState === "error"');
    expect(admin).toContain("Versão do agente:");
    expect(admin).toContain("É necessário iniciar o Android para validar.");
    expect(admin).toContain("O Android está em erro, mas o servidor não recebeu um diagnóstico.");
  });

  it("rotates a stopped or failed instance proxy atomically without reusing the previous proxy", () => {
    const routerCode = read("server/routers/h2Android.ts");
    const admin = read("client/src/pages/AdminH2Android.tsx");
    expect(routerCode).toContain("rotateProxy: adminProcedure");
    expect(routerCode).toContain("['stopped', 'error', 'running'].includes(profileState)");
    expect(routerCode).toContain("Aguarde a inicializacao ou encerramento do Android.");
    expect(routerCode).toContain("Aguarde o comando pendente terminar.");
    expect(routerCode).toContain("SET status='retired', profileId=NULL");
    expect(routerCode).toContain("SET status='assigned', profileId=");
    expect(routerCode).toContain("SET proxyId=");
    expect(routerCode).toContain("observedIp=NULL");
    expect(admin).toContain("trpc.h2Android.rotateProxy.useMutation");
    expect(admin).toContain("Trocar proxy automatico");
    expect(admin).toContain('["stopped", "error", "running"].includes(p.state)');
  });

  it("configures running H2 Android devices without changing proxy or running state", () => {
    const routerCode = read("server/routers/h2Android.ts");
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    const admin = read("client/src/pages/AdminH2Android.tsx");
    expect(routerCode).toContain('"configure"');
    expect(routerCode).toContain('if (action === "configure" && existing.state !== "running")');
    expect(routerCode).toContain('action === "configure" ? existing.state');
    expect(routerCode).toContain('if (job.action === "configure")');
    expect(agent).toContain('"configure" {');
    expect(agent).toContain("function Set-H2LocaleFromSettings");
    expect(agent).toContain("android.settings.LOCALE_SETTINGS");
    expect(agent).toContain("uiautomator");
    expect(agent).toContain("Test-H2ActiveLocale -Adb $Adb -Serial $Serial");
    expect(agent).toContain("Set as default");
    expect(agent).toContain("Portuguese");
    expect(agent).toContain("com.android.internal.systemui.navbar.threebutton");
    expect(agent).toContain("DwmSetWindowAttribute");
    expect(agent).toContain("function Set-H2DeviceSkin");
    expect(agent).toContain("showDeviceFrame");
    expect(agent).toContain("skin.dynamic");
    expect(agent).toContain("Set-H2Presentation -Adb $Adb -Name $Name -Serial $Serial -Sdk $Sdk -Strict $true");
    expect(admin).toContain('action:"configure"');
    expect(admin).toContain("Ajustar idioma e visual do celular");
    expect(agent.match(/^while \(\$true\) \{$/gm)?.length).toBe(1);
    expect(agent.match(/^function Run-Job\(/gm)?.length).toBe(1);
  });

  it("prevents duplicate agent loops and verifies silent installer startup before replacing it", () => {
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    const installer = read("workers/windows/Install-H2Android.ps1");
    expect(agent.match(/^\$Token = Read-Token$/gm)?.length).toBe(1);
    expect(agent.match(/^while \(\$true\) \{$/gm)?.length).toBe(1);
    expect(agent.match(/^function Run-Job\(/gm)?.length).toBe(1);
    expect(agent).toContain('Write-H2Status "ONLINE"');
    expect(installer).toContain("[System.Management.Automation.Language.Parser]::ParseFile");
    expect(installer).toContain("H2AndroidAgent.previous.ps1");
    expect(installer).toContain("Versao anterior restaurada");
    expect(installer).toContain("O agente nao confirmou conexao online em 15 segundos.");
    expect(installer).toContain("-WindowStyle Hidden");
  });

  it("uses pt-BR and physical keyboard in all new AVDs, with hidden command windows", () => {
    const agentCode = read("workers/windows/H2AndroidAgent.ps1");
    const installerCode = read("workers/windows/Install-H2Android.ps1");
    const launcherCode = read("workers/windows/Install-H2Android.cmd");
    expect(agentCode).toContain("function Set-H2Keyboard");
    expect(agentCode).toContain("hw.keyboard=yes");
    expect(agentCode).toContain("function Set-H2Locale");
    expect(agentCode).toContain("android.settings.LOCALE_SETTINGS");
    expect(agentCode).toContain("function Start-H2Emulator");
    expect(agentCode).toContain("$Info.CreateNoWindow = $true");
    expect(installerCode).toContain("-WindowStyle Hidden");
    expect(launcherCode).toContain("O agente executa em segundo plano.");
  });

  it("bootstraps isolated free JDK when Android Studio JBR is unavailable", () => {
    const code = read("workers/windows/H2AndroidAgent.ps1");
    expect(code).toContain("function Set-H2AndroidJava");
    expect(code).toContain("Android\\Android Studio\\jbr");
    expect(code).toContain("api.adoptium.net/v3/assets/latest/21/hotspot");
    expect(code).toContain("Get-FileHash -LiteralPath $ZipFile -Algorithm SHA256");
    expect(code).toContain('$env:JAVA_HOME = $Selected');
    expect(code).toContain('if ($Job.action -in @("create","rebuild","delete")) { Set-H2AndroidJava }');
    expect(code).not.toContain("setx JAVA_HOME");
  });

  it("shows underlying AVDManager failure and checks independent config.ini", () => {
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    expect(agent).toContain("function New-H2NativeAvd");
    expect(agent).toContain("AVDManager nao criou o Android");
    expect(agent).toContain('Join-Path $AvdPath "config.ini"');
    expect(agent).toContain('New-H2NativeAvd -AvdManager $AvdManager');
    expect(agent).not.toContain('throw "Falha ao criar Android virtual individual."');
    expect(agent).toContain('H2 Android ${Version}: verificando autenticacao');
  });
  it("boots an AVD only once using a Windows mutex and correct process command matching", () => {
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    expect(agent).toContain("function Get-H2EmulatorProcesses");
    expect(agent).toContain("function Test-H2EmulatorProcess");
    expect(agent).toContain("H2AndroidStart_");
    expect(agent).toContain("H2AndroidJob_");
    expect(agent).toContain("[System.Threading.Mutex]::new");
    expect(agent).toContain("$JobMutex.WaitOne(10000)");
    expect(agent).toContain("Get-H2EmulatorProcesses -Name $Name");
    expect(agent).toContain("$DataPathPattern");
    expect(agent).toContain("Android iniciou via processo filho");
    expect(agent).toContain("-RedirectStandardError $ErrLog");
    expect(agent).toContain("function Get-H2EmulatorDiagnostic");
    expect(agent).toContain('Select-Object -Last 3');
    expect(agent).toContain("FATAL|PANIC|ERROR");
    expect(agent.split("Start-Process -FilePath $Emulator").length - 1).toBe(1);
    expect(agent).not.toContain('$StartAttempt "-gpu software"');
    expect(agent).not.toContain('-no-accel -gpu swiftshader_indirect');
    expect(agent).not.toContain("-read-only");
    expect(agent).toContain("Log local:");
  });
  it("recovers only orphaned processes of the explicitly rebuilt test", () => {
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    expect(agent).toContain("function Stop-H2OwnedEmulatorForRebuild");
    expect(agent).toContain("Stop-H2OwnedEmulatorForRebuild -Adb $Adb -Name $Name -Serial $Serial");
    expect(agent).toContain("Get-H2EmulatorProcesses -Name $Name");
    expect(agent).toContain("Stop-Process -Id $ProcessId -Force");
    expect(agent).toContain("CreationDate -eq");
    expect(agent).toContain("Nao recriei nem apaguei dados");
    expect(agent).toContain("Stop-H2SocksRelay -Name $Name");
    expect(agent).toContain("Check-Proxy -Proxy $Job.proxy -Name $Name -ProxyId ([string]$Job.proxyId)");
    expect(agent).not.toContain("taskkill /F /IM emulator.exe");
  });

  it("requires explicit confirmation before recreating a failed test and preserves the SOCKS5 proxy", () => {
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    const router = read("server/routers/h2Android.ts");
    const admin = read("client/src/pages/AdminH2Android.tsx");
    expect(router).toContain('input.action === "retry" ? "rebuild"');
    expect(router).toContain('["create","rebuild","start","rotate"]');
    expect(router).toContain("('create','rebuild','start')");
    expect(agent).toContain('$Job.action -eq "rebuild"');
    expect(agent).toContain('switch ($EffectiveAction)');
    expect(agent).toContain('Test-H2EmulatorProcess -Name $Name');
    expect(agent).toContain('Join-Path $AvdHome "$Name.avd"');
    expect(admin).toContain("Recriar teste do zero");
    expect(admin).toContain("window.confirm");
    expect(admin).toContain("O proxy SOCKS5 vinculado será mantido");
  });

  it("does not mistake ADB port 5037 startup messages for a failed creation", () => {
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    expect(agent).toContain("function Invoke-H2Adb");
    expect(agent).toContain('Invoke-H2Adb -Executable $Adb -CommandArgs @("devices")');
    expect(agent).toContain("if ($ExitCode -ne 0)");
    expect(agent).toContain('$ErrorActionPreference = "SilentlyContinue"');
    expect(agent).not.toContain('$Lines = @(& $Adb devices 2>$null)');
    expect(agent).not.toContain("adb kill-server");
  });

  it("uses database time for agent online status, not browser/server timezone parsing", () => {
    const source = read("server/routers/h2Android.ts");
    expect(source).toContain("END AS onlineFromDb");
    expect(source).toContain("lastSeenAt >= DATE_SUB(NOW(), INTERVAL 75 SECOND)");
    expect(source).toContain("online: Number(a.onlineFromDb) === 1");
    expect(source).toContain("revoked: Number(a.revoked) === 1");
    expect(source).not.toContain("Date.now() - new Date(a.lastSeenAt).getTime()");
  });
  it("keeps the Windows agent online while a long Android job is running", () => {
    const source = read("server/routers/h2Android.ts");
    const transport = read("server/h2AndroidAgentRoute.ts");
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    expect(source).toContain("heartbeatAndroidAgent");
    expect(source).toContain("SET lastSeenAt=NOW()");
    expect(transport).toContain("/api/h2-android/agent/heartbeat");
    expect(agent).toContain("Start-H2JobHeartbeat");
    expect(agent).toContain("Stop-H2JobHeartbeat");
    expect(agent).toContain("/api/h2-android/agent/heartbeat");
  });
  it("uses canonical hostname for authenticated API calls and repairs existing agent without new code", () => {
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    const installer = read("workers/windows/Install-H2Android.ps1");
    expect(agent).toContain('[string]$Server = "https://h2colombiano.com"');
    expect(agent).toContain('if ($Server -ieq "https://www.h2colombiano.com")');
    expect(agent).toContain("-MaximumRedirection 0");
    expect(agent).toContain("conexao autenticada, agente online");
    expect(installer).toContain('if (!$HasToken)');
    expect(installer).toContain("H2AndroidAgent.previous.ps1");
    expect(installer).toContain("Get-CimInstance -ClassName Win32_Process");
  });
  it("isolates agent persistence from preexisting H2 Android legacy tables and logs no SQL parameters", () => {
    const routerCode = read("server/routers/h2Android.ts");
    const routeCode = read("server/h2AndroidAgentRoute.ts");
    expect(routerCode).toContain("CREATE TABLE IF NOT EXISTS h2_android_native_agents_v2");
    expect(routerCode).not.toMatch(/\bh2_android_agents\b/);
    expect(routerCode).toContain("INSERT INTO h2_android_native_agents_v2");
    expect(routeCode).toContain('console.error("[H2Android] agent error"');
    expect(routeCode).not.toContain("error.message : String(error)");
  });
  it("offers a Windows double-click installer, not a .ps1 Notepad association", () => {
    const launcher = read("workers/windows/Install-H2Android.cmd");
    const installer = read("workers/windows/Install-H2Android.ps1");
    const endpoint = read("server/h2AndroidAgentRoute.ts");
    const dashboard = read("client/src/pages/AdminH2Android.tsx");
    expect(launcher).toContain("powershell.exe -NoProfile -ExecutionPolicy Bypass -File");
    expect(launcher).toContain("/api/h2-android/install-windows.ps1");
    expect(installer).toContain("/api/h2-android/agent/claim");
    expect(installer).toContain("H2 Android: agente ONLINE e funcionando em segundo plano.");
    expect(endpoint).toContain("/api/h2-android/install-windows.cmd");
    expect(dashboard).toContain('href="/api/h2-android/install-windows.cmd"');
  });
  it("recognizes /ADIMIN/ANDROID before the public customer invalid-route redirect", () => {
    const guard = read("client/public/route-fallback-guard-v1.js");
    const indexHtml = read("client/index.html");
    const root = read("client/src/main.tsx");
    const boundary = read("client/src/components/SiteAccessSessionBoundary.tsx");
    const app = read("client/src/App.tsx");
    expect(guard).toContain("'/adimin/android'");
    expect(guard).toContain("window.location.replace('/ADIMIN/ANDROID'");
    expect(indexHtml).toContain("/route-fallback-guard-v1.js?v=20261112-adimin-android-canonical-v5");
    expect(root).toContain('pathname === "/adimin/android"');
    expect(boundary).toContain("path.toLowerCase()==='/adimin/android'");
    expect(app).toContain('<Route path={"/ADIMIN/ANDROID"}><AdminGuard><AdminH2Android /></AdminGuard></Route>');
  });
  const router = read("server/routers/h2Android.ts");
  const transport = read("server/h2AndroidAgentRoute.ts");
  const agent = read("workers/windows/H2AndroidAgent.ps1");
  const dashboard = read("client/src/pages/AdminH2Android.tsx");
  const root = read("server/routers.ts");
  const app = read("client/src/App.tsx");
  it("restricts dashboard endpoints to ADM and pairs only once", () => {
    for (const mutation of ["overview", "importProxies", "createPairing", "createProfile", "renameProfile", "command", "revokeAgent"]) {
      expect(router).toMatch(new RegExp(mutation + ": adminProcedure"));
    }
    expect(app).toContain('<Route path={"/ADIMIN/ANDROID"}><AdminGuard><AdminH2Android /></AdminGuard></Route>');
    expect(router).toContain("usedAt IS NULL AND expiresAt > NOW() FOR UPDATE");
    expect(transport).toContain("authenticateAndroidAgent");
  });
  it("prevents allocation duplication and permanently deletes proxies after local confirmation", () => {
    expect(router).toContain("LIMIT 1 FOR UPDATE");
    expect(router).toContain("profileId VARCHAR(36) NULL UNIQUE");
    expect(router).toContain("proxyId BIGINT UNSIGNED NOT NULL UNIQUE");
    expect(router).toContain("if (input.success && job.action === \"delete\")");
    expect(router).toContain("DELETE FROM h2_android_proxies WHERE profileId=");
    expect(router).toContain("await tx.execute(sql");
  });
  it("does not clone AVDs, expose emulator screen to web or mutate H2ADS resources", () => {
    expect(agent).toContain("create avd -n $Name -k $Image");
    expect(agent).toContain("-http-proxy");
    expect(agent).toContain("ANDROID_AVD_HOME");
    expect(agent).not.toContain("H2AdsWorker");
    expect(router).not.toContain("h2AdsProxyPool");
    expect(dashboard).not.toContain("mobileRemoteFrame");
    expect(root).toContain("h2Android: h2AndroidRouter");
  });
  it("keeps encrypted proxy credentials inside agent-only authenticated endpoint", () => {
    expect(router).toContain("encryptH2AdsProxy");
    expect(router).toContain("decryptH2AdsProxy");
    expect(router).not.toContain("proxyConfig: input");
    expect(transport).toContain("authorization");
    expect(transport).toContain("res.status(401)");
  });
});
