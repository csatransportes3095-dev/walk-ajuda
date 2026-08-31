from pathlib import Path

worker_path = Path('workers/windows/H2AdsWorker.ps1')
test_path = Path('server/h2adsWorkerFoundation.test.ts')
worker = worker_path.read_text(encoding='utf-8')
test = test_path.read_text(encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 trecho, encontrado {count}')
    return text.replace(old, new, 1)


worker = replace_once(worker, '$AgentVersion = "1.3.4"', '$AgentVersion = "1.3.5"', 'versao do agente')
worker = replace_once(
    worker,
    '$ShortcutName = "Iniciar H2Ads Worker.lnk"\n',
    '$ShortcutName = "Iniciar H2Ads Worker.lnk"\n$LauncherPath = Join-Path $WorkerDirectory "StartH2AdsWorker.vbs"\n',
    'caminho launcher invisivel',
)

worker = replace_once(
    worker,
    '    if ($session.nodePid) { & taskkill.exe /PID $session.nodePid /T /F | Out-Null }',
    '''    if ($session.nodePid) {
      $nodePid = [int]$session.nodePid
      if (Get-Process -Id $nodePid -ErrorAction SilentlyContinue) {
        & taskkill.exe /PID $nodePid /T /F 1>$null 2>$null
      }
    }''',
    'fechamento idempotente de PID',
)

stop_marker = '''function Stop-ExistingWorkerProcesses {
  try {
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" | Where-Object {
      $_.ProcessId -ne $PID -and
      $_.CommandLine -like "*$InstalledScriptPath*" -and
      $_.CommandLine -match '(?i)(?:^|\\s)-Run(?:\\s|$)'
    }
    foreach ($process in $processes) {
      Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
  } catch { }
}

function Start-InstalledWorker {
  Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstalledScriptPath`" -Run" -WindowStyle Hidden
}
'''

new_stop_block = '''function Stop-ExistingWorkerProcesses {
  try {
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" | Where-Object {
      $_.ProcessId -ne $PID -and
      $_.CommandLine -like "*$InstalledScriptPath*" -and
      $_.CommandLine -match '(?i)(?:^|\\s)-Run(?:\\s|$)'
    }
    foreach ($process in $processes) {
      Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
  } catch { }
}

function Ensure-WorkerScheduledTask {
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstalledScriptPath`" -Run"
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\\$env:USERNAME"
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Presença autenticada e controle local do H2 Ads Browser Worker" -Force | Out-Null
}

function Ensure-BackgroundLauncher {
  $taskNameEscaped = $TaskName.Replace('"', '""')
  $launcherContent = @"
Set shell = CreateObject("WScript.Shell")
shell.Run "schtasks.exe /Run /TN ""$taskNameEscaped""", 0, False
Set shell = Nothing
"@
  $launcherContent | Set-Content -Path $LauncherPath -Encoding ASCII -NoNewline
}

function Start-InstalledWorker {
  try {
    Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    return
  } catch { }
  Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstalledScriptPath`" -Run" -WindowStyle Hidden
}
'''
worker = replace_once(worker, stop_marker, new_stop_block, 'watchdog e launcher')

shortcut_old = '''function Ensure-DesktopShortcut {
  $desktop = [Environment]::GetFolderPath("Desktop")
  if ([string]::IsNullOrWhiteSpace($desktop)) { return }
  $shortcutPath = Join-Path $desktop $ShortcutName
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = "powershell.exe"
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstalledScriptPath`" -Run"
  $shortcut.WorkingDirectory = $WorkerDirectory
  $shortcut.Description = "Iniciar H2 Ads Browser Worker"
  $shortcut.IconLocation = "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe,0"
  $shortcut.Save()
}
'''
shortcut_new = '''function Ensure-DesktopShortcut {
  $desktop = [Environment]::GetFolderPath("Desktop")
  if ([string]::IsNullOrWhiteSpace($desktop)) { return }
  Ensure-BackgroundLauncher
  $shortcutPath = Join-Path $desktop $ShortcutName
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = "$env:SystemRoot\\System32\\wscript.exe"
  $shortcut.Arguments = "`"$LauncherPath`""
  $shortcut.WorkingDirectory = $WorkerDirectory
  $shortcut.Description = "Iniciar H2 Ads Browser Worker em segundo plano"
  $shortcut.IconLocation = "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe,0"
  $shortcut.Save()
}
'''
worker = replace_once(worker, shortcut_old, shortcut_new, 'atalho invisivel')

install_old = '''  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstalledScriptPath`" -Run"
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\\$env:USERNAME"
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Description "Presença autenticada e controle local do H2 Ads Browser Worker" -Force | Out-Null
  Stop-ExistingWorkerProcesses
  Start-InstalledWorker
'''
install_new = '''  Ensure-WorkerScheduledTask
  Ensure-BackgroundLauncher
  Ensure-DesktopShortcut
  Stop-ExistingWorkerProcesses
  Start-InstalledWorker
'''
worker = replace_once(worker, install_old, install_new, 'instalacao via tarefa invisivel')

run_old = '''  $config = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
  try { Ensure-DesktopShortcut } catch { }
  $workerMutex = Acquire-WorkerMutex $config
  if ($null -eq $workerMutex) { exit 0 }
  Stop-ExistingWorkerProcesses
$nextHeartbeatAt = Get-Date
'''
run_new = '''  $config = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
  try { Ensure-WorkerScheduledTask } catch { }
  try { Ensure-BackgroundLauncher } catch { }
  try { Ensure-DesktopShortcut } catch { }
  Stop-ExistingWorkerProcesses
  Start-Sleep -Milliseconds 250
  $workerMutex = Acquire-WorkerMutex $config
  if ($null -eq $workerMutex) { exit 0 }
$nextHeartbeatAt = Get-Date
'''
worker = replace_once(worker, run_old, run_new, 'run assume worker invisivel')

required_worker = [
    '$AgentVersion = "1.3.5"',
    'New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999',
    '-RestartInterval (New-TimeSpan -Minutes 1)',
    '-MultipleInstances IgnoreNew',
    'Start-ScheduledTask -TaskName $TaskName',
    'StartH2AdsWorker.vbs',
    'schtasks.exe /Run /TN',
    '$shortcut.TargetPath = "$env:SystemRoot\\System32\\wscript.exe"',
    'Get-Process -Id $nodePid -ErrorAction SilentlyContinue',
    'taskkill.exe /PID $nodePid /T /F 1>$null 2>$null',
    '-NonInteractive',
]
for marker in required_worker:
    if marker not in worker:
        raise SystemExit(f'worker: marcador obrigatório ausente: {marker}')

# Atualiza a regressão existente e exige os novos invariantes do modo headless.
test = replace_once(test, 'expect(script).toContain(\'$AgentVersion = "1.3.4"\');', 'expect(script).toContain(\'$AgentVersion = "1.3.5"\');', 'teste de versao')
insert_after = '    expect(script).toContain("Register-ScheduledTask");\n'
headless_assertions = insert_after + '''    expect(script).toContain("New-ScheduledTaskSettingsSet");
    expect(script).toContain("RestartCount 999");
    expect(script).toContain("RestartInterval (New-TimeSpan -Minutes 1)");
    expect(script).toContain("MultipleInstances IgnoreNew");
    expect(script).toContain("Start-ScheduledTask");
    expect(script).toContain("StartH2AdsWorker.vbs");
    expect(script).toContain("schtasks.exe /Run /TN");
    expect(script).toContain("wscript.exe");
    expect(script).toContain("Get-Process -Id $nodePid -ErrorAction SilentlyContinue");
    expect(script).toContain("taskkill.exe /PID $nodePid /T /F 1>$null 2>$null");
'''
test = replace_once(test, insert_after, headless_assertions, 'regressoes headless')

worker_path.write_text(worker, encoding='utf-8')
test_path.write_text(test, encoding='utf-8')
print('H2ADS_WORKER_HEADLESS_WATCHDOG_PATCH_OK')
