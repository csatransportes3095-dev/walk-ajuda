import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("H2 Android native isolated architecture", () => {
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
    expect(agentCode).toContain("persist.sys.locale pt-BR");
    expect(agentCode).toContain("function Start-H2Gui");
    expect(agentCode).toContain("$I.CreateNoWindow = $true");
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
    expect(code).toContain('if ($Job.action -in @("create","delete")) { Set-H2AndroidJava }');
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
  it("uses canonical hostname for authenticated API calls and repairs existing agent without new code", () => {
    const agent = read("workers/windows/H2AndroidAgent.ps1");
    const installer = read("workers/windows/Install-H2Android.ps1");
    expect(agent).toContain('[string]$Server = "https://h2colombiano.com"');
    expect(agent).toContain('if ($Server -ieq "https://www.h2colombiano.com")');
    expect(agent).toContain("-MaximumRedirection 0");
    expect(agent).toContain("conexao autenticada, agente online");
    expect(installer).toContain('if ($HasPairedToken)');
    expect(installer).toContain("Pareamento existente preservado");
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
    expect(installer).toContain("Pareamento confirmado no servidor");
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
