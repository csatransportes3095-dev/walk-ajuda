from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


worker = "workers/windows/H2AdsWorker.ps1"
test = "server/h2adsWorkerFoundation.test.ts"
validate = ".github/workflows/h2ads-validate.yml"

replace_once(worker, '$AgentVersion = "1.3.8"', '$AgentVersion = "1.3.9"')

old_close = r'''function Close-BrowserSession([object]$Config, [object]$Payload) {
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

new_close = r'''function Get-H2AdsProfileLastSnapshotAt([string]$ProfileDirectory) {
  $manifestPath = Join-Path $ProfileDirectory "h2ads-profile.json"
  if (!(Test-Path $manifestPath)) { return $null }
  try {
    $manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
    return [string]$manifest.lastSnapshotAt
  } catch {
    return $null
  }
}

function Close-BrowserSession([object]$Config, [object]$Payload) {
  $instanceId = [int]$Payload.command.instanceId
  $profileDirectory = Join-Path $ProfilesDirectory "instance-$instanceId"
  $sessionPath = Join-Path $profileDirectory "h2ads-browser-session.json"
  $snapshotBefore = Get-H2AdsProfileLastSnapshotAt $profileDirectory
  $nodePid = $null
  $browserPid = $null

  if (Test-Path $sessionPath) {
    try {
      $session = Get-Content -Raw -Path $sessionPath | ConvertFrom-Json
      if ($session.nodePid) { $nodePid = [int]$session.nodePid }
      if ($session.browserPid) { $browserPid = [int]$session.browserPid }
    } catch { }
  }

  # Fecha primeiro o Chrome para permitir que ele grave cookies, preferencias e bancos locais.
  if ($browserPid) {
    $browserProcess = Get-Process -Id $browserPid -ErrorAction SilentlyContinue
    if ($browserProcess) {
      try { $null = $browserProcess.CloseMainWindow() } catch { }
      $browserDeadline = (Get-Date).AddSeconds(15)
      while ((Get-Date) -lt $browserDeadline -and (Get-Process -Id $browserPid -ErrorAction SilentlyContinue)) {
        Start-Sleep -Milliseconds 250
      }
      if (Get-Process -Id $browserPid -ErrorAction SilentlyContinue) {
        & taskkill.exe /PID $browserPid /T /F 1>$null 2>$null
      }
    }
  } elseif ($nodePid -and (Get-Process -Id $nodePid -ErrorAction SilentlyContinue)) {
    # Compatibilidade com sessoes antigas que nao registravam browserPid.
    & taskkill.exe /PID $nodePid /T /F 1>$null 2>$null
  }

  # O Node da sessao recebe o evento de saida do Chrome e tenta o snapshot antes de encerrar.
  if ($nodePid) {
    $nodeDeadline = (Get-Date).AddSeconds(25)
    while ((Get-Date) -lt $nodeDeadline -and (Get-Process -Id $nodePid -ErrorAction SilentlyContinue)) {
      Start-Sleep -Milliseconds 250
    }
  }

  $body = @{ command = "close_browser"; state = "closed" } | ConvertTo-Json -Compress
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/commands/$($Payload.command.id)/result" -Headers (Get-WorkerHeaders $Config) -ContentType "application/json" -Body $body | Out-Null

  $snapshotAfter = Get-H2AdsProfileLastSnapshotAt $profileDirectory
  if ([string]::IsNullOrWhiteSpace($snapshotAfter) -or $snapshotAfter -eq $snapshotBefore) {
    # Fallback independente: nunca apaga o perfil local e so remove o pending apos HTTP de sucesso.
    Queue-H2AdsProfileSnapshot $instanceId
  }
}
'''
replace_once(worker, old_close, new_close)

old_queue = r'''if ($SnapshotQueueWorker) {
  if (!(Test-Path $ConfigPath)) { exit 0 }
  $config = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
  New-Item -ItemType Directory -Force -Path $SnapshotQueueDirectory | Out-Null
  $safeWorkerKey = ([string]$config.workerKey) -replace '[^A-Za-z0-9_-]', '_'
  $createdNew = $false
  $snapshotMutex = New-Object System.Threading.Mutex($true, "Local\H2AdsSnapshotQueue-$safeWorkerKey", [ref]$createdNew)
  if (!$createdNew) {
    $snapshotMutex.Dispose()
    exit 0
  }
  try {
    while ($true) {
      $pending = Get-ChildItem -Path $SnapshotQueueDirectory -Filter "*.pending" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc | Select-Object -First 1
      if (!$pending) { break }
      if ($pending.Name -notmatch 'instance-(\d+)-') {
        Remove-Item -Force $pending.FullName -ErrorAction SilentlyContinue
        continue
      }
      $instanceId = [int]$Matches[1]
      $workingPath = "$($pending.FullName).working"
      Move-Item -Path $pending.FullName -Destination $workingPath -Force
      try {
        Start-Sleep -Milliseconds 750
        Send-H2AdsProfileSnapshot $config $instanceId | Out-Null
        Remove-Item -Force $workingPath -ErrorAction SilentlyContinue
      } catch {
        $retryPath = $workingPath -replace '\.working$', ''
        if (!(Test-Path $retryPath)) {
          Move-Item -Path $workingPath -Destination $retryPath -Force -ErrorAction SilentlyContinue
        }
        break
      }
    }
  } finally {
    try { $snapshotMutex.ReleaseMutex() } catch { }
    $snapshotMutex.Dispose()
  }
  exit 0
}
'''

new_queue = r'''if ($SnapshotQueueWorker) {
  if (!(Test-Path $ConfigPath)) { exit 0 }
  $config = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
  New-Item -ItemType Directory -Force -Path $SnapshotQueueDirectory | Out-Null
  $safeWorkerKey = ([string]$config.workerKey) -replace '[^A-Za-z0-9_-]', '_'
  $createdNew = $false
  $snapshotMutex = New-Object System.Threading.Mutex($true, "Local\H2AdsSnapshotQueue-$safeWorkerKey", [ref]$createdNew)
  if (!$createdNew) {
    $snapshotMutex.Dispose()
    exit 0
  }
  try {
    # Congela a lista desta rodada. Um item com erro nao pode bloquear snapshots de outras instancias.
    $pendingItems = @(Get-ChildItem -Path $SnapshotQueueDirectory -Filter "*.pending" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc)
    foreach ($pending in $pendingItems) {
      if ($pending.Name -notmatch 'instance-(\d+)-') {
        Remove-Item -Force $pending.FullName -ErrorAction SilentlyContinue
        continue
      }
      $instanceId = [int]$Matches[1]
      $workingPath = "$($pending.FullName).working"
      try {
        Move-Item -Path $pending.FullName -Destination $workingPath -Force
      } catch {
        continue
      }

      $saved = $false
      $lastError = $null
      foreach ($delaySeconds in @(1, 3, 8)) {
        try {
          Start-Sleep -Seconds $delaySeconds
          $saved = [bool](Send-H2AdsProfileSnapshot $config $instanceId)
          if ($saved) { break }
          $lastError = "profile_not_ready"
        } catch {
          $lastError = [string]$_.Exception.Message
        }
      }

      if ($saved) {
        Remove-Item -Force $workingPath -ErrorAction SilentlyContinue
        Remove-Item -Force (Join-Path $SnapshotQueueDirectory "instance-$instanceId.last-error.txt") -ErrorAction SilentlyContinue
        continue
      }

      $retryPath = $workingPath -replace '\.working$', ''
      if (Test-Path $workingPath) {
        Move-Item -Path $workingPath -Destination $retryPath -Force -ErrorAction SilentlyContinue
      }
      $safeError = if ([string]::IsNullOrWhiteSpace($lastError)) { "profile_snapshot_failed" } else { $lastError }
      if ($safeError.Length -gt 240) { $safeError = $safeError.Substring(0, 240) }
      $safeError | Set-Content -Path (Join-Path $SnapshotQueueDirectory "instance-$instanceId.last-error.txt") -Encoding UTF8 -NoNewline
      # Continua para a proxima instancia; nao usa break aqui.
    }
  } finally {
    try { $snapshotMutex.ReleaseMutex() } catch { }
    $snapshotMutex.Dispose()
  }
  exit 0
}
'''
replace_once(worker, old_queue, new_queue)

replace_once(test, '$AgentVersion = "1.3.8"', '$AgentVersion = "1.3.9"')
needle = '    expect(script).toContain("taskkill.exe /PID $nodePid /T /F 1>$null 2>$null");\n'
addition = needle + '    expect(script).toContain("CloseMainWindow()");\n    expect(script).toContain("$pendingItems = @(");\n    expect(script).toContain("$saved = [bool](Send-H2AdsProfileSnapshot $config $instanceId)");\n    expect(script).toContain("nao usa break aqui");\n'
replace_once(test, needle, addition)

replace_once(validate, 'AgentVersion = \\\"1.3.8\\\"', 'AgentVersion = \\\"1.3.9\\\"')
replace_once(validate, 'Packaged worker is not 1.3.8', 'Packaged worker is not 1.3.9')
replace_once(validate, 'Packaged worker 1.3.8 confirmed', 'Packaged worker 1.3.9 confirmed')
