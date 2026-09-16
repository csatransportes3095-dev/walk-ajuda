from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


worker = "workers/windows/H2AdsWorker.ps1"
session = "workers/windows/browser-session.mjs"
route = "server/h2adsWorkerRoute.ts"
test = "server/h2adsWorkerFoundation.test.ts"
validate = ".github/workflows/h2ads-validate.yml"

# Nova versão do agente porque o fluxo de fechamento/snapshot do PowerShell muda.
replace_once(worker, '$AgentVersion = "1.3.8"', '$AgentVersion = "1.3.9"')

# Registra localmente somente depois de confirmação HTTP 201 do servidor.
replace_once(
    worker,
    '''    Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/profiles/$InstanceId/snapshot" -Headers $headers -ContentType "application/octet-stream" -InFile $archivePath | Out-Null
    return $true
''',
    '''    Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/profiles/$InstanceId/snapshot" -Headers $headers -ContentType "application/octet-stream" -InFile $archivePath | Out-Null
    $manifestPath = Join-Path $profileDirectory "h2ads-profile.json"
    $manifest = if (Test-Path $manifestPath) { Get-Content -Raw -Path $manifestPath | ConvertFrom-Json } else { [pscustomobject]@{ instanceId = $InstanceId; profileVersion = 1 } }
    $manifest | Add-Member -NotePropertyName lastSnapshotAt -NotePropertyValue ((Get-Date).ToUniversalTime().ToString("o")) -Force
    $manifest | ConvertTo-Json -Compress | Set-Content -Path $manifestPath -Encoding UTF8 -NoNewline
    Remove-Item -Force (Join-Path $SnapshotQueueDirectory "instance-$InstanceId.last-error.txt") -ErrorAction SilentlyContinue
    return $true
''',
)

old_close = '''function Close-BrowserSession([object]$Config, [object]$Payload) {
  $instanceId = [int]$Payload.command.instanceId
  $profileDirectory = Join-Path $ProfilesDirectory "instance-$instanceId"
  $sessionPath = Join-Path $profileDirectory "h2ads-browser-session.json"
  if (Test-Path $sessionPath) {
    $session = Get-Content -Raw -Path $sessionPath | ConvertFrom-Json
    if ($session.nodePid) {
      $nodePid = [int]$session.nodePid
      if (Get-Process -Id $nodePid -ErrorAction SilentlyContinue) {
        & taskkill.exe /PID $nodePid /T /F 1>$null 2>$null
      }
    }
    Remove-Item -Force $sessionPath -ErrorAction SilentlyContinue
  }
  $body = @{ command = "close_browser"; state = "closed" } | ConvertTo-Json -Compress
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/commands/$($Payload.command.id)/result" -Headers (Get-WorkerHeaders $Config) -ContentType "application/json" -Body $body | Out-Null
  Queue-H2AdsProfileSnapshot $instanceId
}
'''

new_close = '''function Close-BrowserSession([object]$Config, [object]$Payload) {
  $instanceId = [int]$Payload.command.instanceId
  $profileDirectory = Join-Path $ProfilesDirectory "instance-$instanceId"
  $sessionPath = Join-Path $profileDirectory "h2ads-browser-session.json"
  $nodePid = $null
  $browserPid = $null

  if (Test-Path $sessionPath) {
    try {
      $session = Get-Content -Raw -Path $sessionPath | ConvertFrom-Json
      if ($session.nodePid) { $nodePid = [int]$session.nodePid }
      if ($session.browserPid) { $browserPid = [int]$session.browserPid }
    } catch { }
  }

  # Fecha primeiro o Chrome, dando tempo para gravar o perfil e para o Node executar o handler de saída.
  if ($browserPid) {
    $browserProcess = Get-Process -Id $browserPid -ErrorAction SilentlyContinue
    if ($browserProcess) {
      try { $null = $browserProcess.CloseMainWindow() } catch { }
      $graceDeadline = (Get-Date).AddSeconds(15)
      while ((Get-Date) -lt $graceDeadline -and (Get-Process -Id $browserPid -ErrorAction SilentlyContinue)) {
        Start-Sleep -Milliseconds 250
      }
      if (Get-Process -Id $browserPid -ErrorAction SilentlyContinue) {
        & taskkill.exe /PID $browserPid /T /F 1>$null 2>$null
      }
    }
  } elseif ($nodePid -and (Get-Process -Id $nodePid -ErrorAction SilentlyContinue)) {
    # Compatibilidade com sessões antigas sem browserPid. O perfil local nunca é apagado.
    & taskkill.exe /PID $nodePid /T /F 1>$null 2>$null
  }

  # O servidor precisa estar em closed antes de aceitar snapshot.
  $body = @{ command = "close_browser"; state = "closed" } | ConvertTo-Json -Compress
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/commands/$($Payload.command.id)/result" -Headers (Get-WorkerHeaders $Config) -ContentType "application/json" -Body $body | Out-Null

  $snapshotSaved = $false
  if ($nodePid) {
    $snapshotDeadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $snapshotDeadline) {
      if (Test-Path $sessionPath) {
        try {
          $latestSession = Get-Content -Raw -Path $sessionPath | ConvertFrom-Json
          if ($latestSession.snapshotState -eq "saved") {
            $snapshotSaved = $true
            break
          }
          if ($latestSession.snapshotState -eq "failed") { break }
        } catch { }
      }
      if (!(Get-Process -Id $nodePid -ErrorAction SilentlyContinue)) { break }
      Start-Sleep -Milliseconds 500
    }
  }

  # Segunda camada independente: preserva o .pending até um HTTP 201 confirmado.
  if (!$snapshotSaved) { Queue-H2AdsProfileSnapshot $instanceId }
}
'''
replace_once(worker, old_close, new_close)

old_queue = '''      try {
        Start-Sleep -Milliseconds 750
        Send-H2AdsProfileSnapshot $config $instanceId | Out-Null
        Remove-Item -Force $workingPath -ErrorAction SilentlyContinue
      } catch {
        $retryPath = $workingPath -replace '\\.working$', ''
        if (!(Test-Path $retryPath)) {
          Move-Item -Path $workingPath -Destination $retryPath -Force -ErrorAction SilentlyContinue
        }
        break
      }
'''
new_queue = '''      $saved = $false
      $lastError = $null
      $delays = @(1, 3, 8)
      for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
          Start-Sleep -Seconds $delays[$attempt - 1]
          $saved = [bool](Send-H2AdsProfileSnapshot $config $instanceId)
          if ($saved) { break }
          throw "O perfil local ainda não possui dados de navegador para snapshot H2ADS."
        } catch {
          $lastError = [string]$_.Exception.Message
        }
      }
      if ($saved) {
        Remove-Item -Force $workingPath -ErrorAction SilentlyContinue
        continue
      }
      $retryPath = $workingPath -replace '\\.working$', ''
      if (!(Test-Path $retryPath)) {
        Move-Item -Path $workingPath -Destination $retryPath -Force -ErrorAction SilentlyContinue
      }
      $safeError = if ([string]::IsNullOrWhiteSpace($lastError)) { "profile_snapshot_failed" } else { $lastError }
      if ($safeError.Length -gt 300) { $safeError = $safeError.Substring(0, 300) }
      $safeError | Set-Content -Path (Join-Path $SnapshotQueueDirectory "instance-$instanceId.last-error.txt") -Encoding UTF8 -NoNewline
      break
'''
replace_once(worker, old_queue, new_queue)
replace_once(worker, '$nextSnapshotQueueCheckAt = $now.AddMinutes(2)', '$nextSnapshotQueueCheckAt = $now.AddSeconds(30)')

# Sessão registra estado do snapshot e faz retry sem remover o perfil local.
replace_once(
    session,
    '''    if (!response.ok) throw new Error(`profile_snapshot_http_${response.status}`);
    const manifestPath = join(profileDirectory, "h2ads-profile.json");
    const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { instanceId, profileVersion: 1 };
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, lastSnapshotAt: new Date().toISOString() }), "utf8");
  } finally {
''',
    '''    if (!response.ok) throw new Error(`profile_snapshot_http_${response.status}`);
    const manifestPath = join(profileDirectory, "h2ads-profile.json");
    const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { instanceId, profileVersion: 1 };
    const savedAt = new Date().toISOString();
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, lastSnapshotAt: savedAt }), "utf8");
    writeSession({ snapshotState: "saved", snapshotSavedAt: savedAt, snapshotLastError: null });
    return true;
  } finally {
''',
)

session_path = Path(session)
text = session_path.read_text(encoding="utf-8")
marker = "function normalizeIp(value) {"
if text.count(marker) != 1:
    raise SystemExit("browser-session: normalizeIp marker missing")
retry_helper = '''function safeSnapshotError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/^profile_snapshot_http_\\d+$/.test(message)) return message;
  if (message.startsWith("profile_snapshot_")) return message.slice(0, 96);
  return "profile_snapshot_failed";
}

async function uploadProfileSnapshotWithRetry() {
  const delays = [0, 2_000, 5_000];
  let lastError;
  for (let index = 0; index < delays.length; index += 1) {
    if (delays[index]) await new Promise((resolve) => setTimeout(resolve, delays[index]));
    writeSession({ snapshotState: index === 0 ? "saving" : "retrying", snapshotAttempt: index + 1 });
    try {
      return await uploadProfileSnapshot();
    } catch (error) {
      lastError = error;
      writeSession({ snapshotState: "retrying", snapshotAttempt: index + 1, snapshotLastError: safeSnapshotError(error), snapshotFailureAt: new Date().toISOString() });
    }
  }
  writeSession({ snapshotState: "failed", snapshotLastError: safeSnapshotError(lastError), snapshotFailureAt: new Date().toISOString() });
  throw lastError instanceof Error ? lastError : new Error("profile_snapshot_failed");
}

'''
session_path.write_text(text.replace(marker, retry_helper + marker, 1), encoding="utf-8")
replace_once(session, '        await uploadProfileSnapshot().catch(() => undefined);', '        try { await uploadProfileSnapshotWithRetry(); } catch { }')

# Diagnóstico sanitizado no servidor: identifica o motivo do 409 sem imprimir token/proxy/dados do perfil.
route_path = Path(route)
route_text = route_path.read_text(encoding="utf-8")
route_marker = '''function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store, private");
}
'''
if route_text.count(route_marker) != 1:
    raise SystemExit("worker route: noStore marker missing")
route_helper = '''function h2AdsSnapshotErrorCategory(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("browser está aberto")) return "browser_open";
  if (message.includes("não atribuída")) return "assignment_missing";
  if (message.includes("BACKUP_ENCRYPTION_KEY")) return "encryption_key_invalid";
  if (message.includes("Integridade")) return "integrity_failed";
  if (message.includes("Banco indisponível")) return "database_unavailable";
  return "storage_or_server_failed";
}

'''
route_text = route_text.replace(route_marker, route_marker + "\n" + route_helper, 1)
old_catch = '''    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : "Não foi possível salvar o snapshot H2ADS." });
    }
  });

  app.get("/api/h2ads/worker/profiles/:instanceId/snapshot"'''
new_catch = '''    } catch (error) {
      const category = h2AdsSnapshotErrorCategory(error);
      console.warn(`[h2ads-profile-snapshot] instance=${instanceId} worker=${worker.id} category=${category}`);
      res.status(409).json({ error: error instanceof Error ? error.message : "Não foi possível salvar o snapshot H2ADS." });
    }
  });

  app.get("/api/h2ads/worker/profiles/:instanceId/snapshot"'''
if route_text.count(old_catch) != 1:
    raise SystemExit("worker route: snapshot catch marker missing")
route_path.write_text(route_text.replace(old_catch, new_catch, 1), encoding="utf-8")

# Ajusta testes somente no escopo H2ADS.
replace_once(test, '$AgentVersion = "1.3.8"', '$AgentVersion = "1.3.9"')
replace_once(
    test,
    '    expect(script).toContain("taskkill.exe /PID $nodePid /T /F 1>$null 2>$null");',
    '    expect(script).toContain("CloseMainWindow()");\n    expect(script).toContain("taskkill.exe /PID $browserPid /T /F 1>$null 2>$null");\n    expect(script).toContain("snapshotState -eq \\\"saved\\\"");\n    expect(script).toContain("Queue-H2AdsProfileSnapshot $instanceId");\n    expect(session).toContain("uploadProfileSnapshotWithRetry");\n    expect(session).toContain(\'snapshotState: "saved"\');',
)

replace_once(validate, 'AgentVersion = \\\"1.3.8\\\"', 'AgentVersion = \\\"1.3.9\\\"')
replace_once(validate, 'Packaged worker is not 1.3.8', 'Packaged worker is not 1.3.9')
replace_once(validate, 'Packaged worker 1.3.8 confirmed', 'Packaged worker 1.3.9 confirmed')
