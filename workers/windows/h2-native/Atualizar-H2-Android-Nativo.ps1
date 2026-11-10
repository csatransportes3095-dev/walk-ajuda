# H2 Android Native - atualizacao pontual do motor do agente (Windows PowerShell 5.1).
# Sem Android Studio, SDK, ADB, reinstalacao de VM, rede ou alteracao do H2ADS.
[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$folder = Join-Path $env:LOCALAPPDATA "H2AndroidAgent"
$taskName = "H2 Android Agent"
$agentPath = Join-Path $folder "H2NativeAgent.ps1"
$files = @("H2NativeAgent.ps1","H2NativeControl.ps1","H2NativeCore.psm1","H2NativeScreen.ps1")
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
  if (!(Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Arquivo H2 ausente no pacote: $name. Nenhuma alteracao."
  }
  if ($name -ne "H2NativeScreen.ps1" -and !(Test-Path -LiteralPath $target -PathType Leaf)) {
    throw "Agente H2 existente incompleto: $name. Nenhuma alteracao."
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
    !$newControl.Contains('agentVersion = "0.3.4-native-screen"')) {
  throw "Pacote H2 invalido ou sem protecao contra instancias duplicadas. Nada foi modificado."
}
$backupDir = Join-Path $folder ("Backup-Atualizacao-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $backupDir -ErrorAction Stop | Out-Null
foreach ($name in $files) {
  $previous = Join-Path $folder $name
  if (Test-Path -LiteralPath $previous -PathType Leaf) {
    Copy-Item -LiteralPath $previous -Destination (Join-Path $backupDir $name) -ErrorAction Stop
  }
}
$updated = $false
try {
  # Parar somente a tarefa H2 Android e o processo de seu caminho especifico.
  Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop
  # Encerrar instancias antigas que ainda tenham o script anterior carregado.
  # A tarefa fica parada ate TODOS os workers H2 legados encerrarem.
  $remaining = @()
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    $remaining = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction Stop |
      Where-Object {
        $_.ProcessId -ne $PID -and $_.CommandLine -and
        $_.CommandLine.IndexOf($agentPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $_.CommandLine -match ' -Run(\s|$)'
      })
    if ($remaining.Count -eq 0) { break }
    foreach ($proc in $remaining) {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
  }
  $remaining = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction Stop |
    Where-Object {
      $_.ProcessId -ne $PID -and $_.CommandLine -and
      $_.CommandLine.IndexOf($agentPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
      $_.CommandLine -match ' -Run(\s|$)'
    })
  if ($remaining.Count -gt 0) {
    throw "Ainda ha agente H2 antigo ativo. Atualizacao interrompida sem alterar arquivos."
  }
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
  $active = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction Stop |
    Where-Object {
      $_.ProcessId -ne $PID -and $_.CommandLine -and
      $_.CommandLine.IndexOf($agentPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
      $_.CommandLine -match ' -Run(\s|$)'
    })
  if ($active.Count -ne 1) {
    throw ("Quantidade inesperada de agentes H2 ativos: " + $active.Count)
  }
  Write-Host "AGENTE H2 v0.3.4-native-screen ATUALIZADO. UMA INSTANCIA ATIVA." -ForegroundColor Green
  Write-Host "PAREAMENTO E ANDROID PRESERVADOS." -ForegroundColor Green
  Write-Host ("Backup do motor antigo: " + $backupDir)
} catch {
  $errorText = $_.Exception.Message
  # Restaurar os arquivos originais do agente H2 Android.
  foreach ($name in $files) {
    try {
      $original = Join-Path $backupDir $name
      $installed = Join-Path $folder $name
      if (Test-Path -LiteralPath $original -PathType Leaf) {
        Copy-Item -LiteralPath $original -Destination $installed -Force -ErrorAction Stop
      } elseif ($name -eq "H2NativeScreen.ps1" -and (Test-Path -LiteralPath $installed -PathType Leaf)) {
        Remove-Item -LiteralPath $installed -Force -ErrorAction Stop
      }
    } catch { Write-Warning ("Verifique manualmente o arquivo H2: " + $name) }
  }
  try { Start-ScheduledTask -TaskName $taskName -ErrorAction Stop }
  catch { Write-Warning "Tarefa H2 nao reiniciou. Verifique Agendador de Tarefas." }
  throw ("Atualizacao H2 revertida: " + $errorText)
}