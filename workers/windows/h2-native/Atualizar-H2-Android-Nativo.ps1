# H2 Android Native - atualizacao pontual do motor do agente (Windows PowerShell 5.1).
# Sem Android Studio, SDK, ADB, reinstalacao de VM, rede ou alteracao do H2ADS.
[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$folder = Join-Path $env:LOCALAPPDATA "H2AndroidAgent"
$taskName = "H2 Android Agent"
$agentPath = Join-Path $folder "H2NativeAgent.ps1"
$files = @("H2NativeAgent.ps1","H2NativeControl.ps1","H2NativeCore.psm1")
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($id)
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Abra Atualizar-H2-Android-Nativo.cmd como administrador."
}
if (!(Test-Path -LiteralPath (Join-Path $folder "agent.json") -PathType Leaf) -or
    !(Test-Path -LiteralPath $agentPath -PathType Leaf)) {
  throw "Agente H2 Android existente nao encontrado. Nada foi modificado."
}
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
$validAction = @($task.Actions | Where-Object {
  $_.Execute -match 'powershell(\.exe)?$' -and
  $_.Arguments -like "*H2NativeAgent.ps1*" -and
  $_.Arguments -match ' -Run(\s|$)'
})
if ($validAction.Count -ne 1) { throw "Tarefa nao corresponde ao agente H2 nativo. Nenhuma alteracao." }
foreach ($name in $files) {
  $source = Join-Path $PSScriptRoot $name
  $target = Join-Path $folder $name
  if (!(Test-Path -LiteralPath $source -PathType Leaf) -or
      !(Test-Path -LiteralPath $target -PathType Leaf)) {
    throw "Arquivo H2 ausente: $name. Nenhuma alteracao."
  }
  $tokens = $null
  $syntaxErrors = $null
  [Management.Automation.Language.Parser]::ParseFile(
    $source, [ref]$tokens, [ref]$syntaxErrors) | Out-Null
  if ($syntaxErrors.Count -gt 0) { throw "Erro de sintaxe no pacote: $name." }
}
$newAgent = Get-Content -LiteralPath (Join-Path $PSScriptRoot "H2NativeAgent.ps1") -Raw
$newCore = Get-Content -LiteralPath (Join-Path $PSScriptRoot "H2NativeCore.psm1") -Raw
$newControl = Get-Content -LiteralPath (Join-Path $PSScriptRoot "H2NativeControl.ps1") -Raw
if (!$newAgent.Contains("H2AndroidNativeAgentSingleInstanceV1") -or
    !$newAgent.Contains("WaitOne(0)") -or
    !$newCore.Contains("function New-H2NativeClone {") -or
    !$newControl.Contains('agentVersion = "0.3.2-native-clone"')) {
  throw "Pacote H2 invalido ou sem protecao contra instancias duplicadas. Nada foi modificado."
}
$backupDir = Join-Path $folder ("Backup-Atualizacao-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $backupDir -ErrorAction Stop | Out-Null
foreach ($name in $files) {
  Copy-Item -LiteralPath (Join-Path $folder $name) -Destination (Join-Path $backupDir $name) -ErrorAction Stop
}
$updated = $false
try {
  # Parar somente a tarefa H2 Android e o processo de seu caminho especifico.
  Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop
  $running = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction Stop |
    Where-Object {
      $_.ProcessId -ne $PID -and $_.CommandLine -and
      $_.CommandLine.IndexOf($agentPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
      $_.CommandLine -match ' -Run(\s|$)'
    })
  foreach ($proc in $running) { Stop-Process -Id $proc.ProcessId -ErrorAction Stop }
  foreach ($name in $files) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $folder $name) -Force -ErrorAction Stop
    $sourceHash = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $name) -Algorithm SHA256).Hash
    $targetHash = (Get-FileHash -LiteralPath (Join-Path $folder $name) -Algorithm SHA256).Hash
    if ($sourceHash -ine $targetHash) { throw "Copia do motor H2 nao conferiu: $name" }
  }
  $updated = $true
  Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
  Start-Sleep -Seconds 3
  $status = (Get-ScheduledTask -TaskName $taskName -ErrorAction Stop).State
  if ([string]$status -ne "Running") { throw "A tarefa H2 nao permaneceu executando." }
  Write-Host "AGENTE H2 ATUALIZADO. PAREAMENTO E ANDROID PRESERVADOS." -ForegroundColor Green
  Write-Host ("Backup do motor antigo: " + $backupDir)
} catch {
  $errorText = $_.Exception.Message
  # Restaurar apenas os dois arquivos do motor do H2 Android.
  foreach ($name in $files) {
    try {
      Copy-Item -LiteralPath (Join-Path $backupDir $name) -Destination (Join-Path $folder $name) -Force -ErrorAction Stop
    } catch { Write-Warning ("Verifique manualmente o arquivo H2: " + $name) }
  }
  try { Start-ScheduledTask -TaskName $taskName -ErrorAction Stop }
  catch { Write-Warning "Tarefa H2 nao reiniciou. Verifique Agendador de Tarefas." }
  throw ("Atualizacao H2 revertida: " + $errorText)
}