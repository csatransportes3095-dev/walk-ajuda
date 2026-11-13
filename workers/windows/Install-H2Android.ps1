# H2 Android native installer - user-only, resilient update with rollback.
# Changes only %LOCALAPPDATA%\H2AndroidNative and its own Startup shortcut.
param(
  [string]$Server = "https://h2colombiano.com",
  [string]$PairCode = ""
)
$ErrorActionPreference = "Stop"
$Server = $Server.TrimEnd("/")
if ($Server -ieq "https://www.h2colombiano.com") { $Server = "https://h2colombiano.com" }
if ($Server -ine "https://h2colombiano.com") { throw "Servidor oficial H2 Android invalido." }
$Base = Join-Path $env:LOCALAPPDATA "H2AndroidNative"
New-Item -ItemType Directory -Path $Base -Force | Out-Null
$AgentPath = Join-Path $Base "H2AndroidAgent.ps1"
$RelayPath = Join-Path $Base "H2AndroidSocksRelay.mjs"
$RelayBackupPath = Join-Path $Base "H2AndroidSocksRelay.previous.mjs"
$RelayTempPath = Join-Path $Base ("H2AndroidSocksRelay-" + [guid]::NewGuid().ToString("N") + ".mjs")
$BackupPath = Join-Path $Base "H2AndroidAgent.previous.ps1"
$TempPath = Join-Path $Base ("H2AndroidAgent-" + [guid]::NewGuid().ToString("N") + ".ps1")
$TokenFile = Join-Path $Base "agent.secure"
$LogPath = Join-Path $Base "agent-status.log"
$Powershell = Join-Path $PSHOME "powershell.exe"
if (!(Test-Path $Powershell)) { $Powershell = "powershell.exe" }

function Test-H2AgentSyntax([string]$File) {
  $Tokens = $null
  $Errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($File,[ref]$Tokens,[ref]$Errors)
  if ($Errors.Count -gt 0) {
    throw ("Agente novo contem erro PowerShell; versao anterior mantida: " + ($Errors[0].Message))
  }
  $Text = Get-Content -LiteralPath $File -Raw
  if (([regex]::Matches($Text, '(?m)^\$Token = Read-Token\s*$')).Count -ne 1 -or
      ([regex]::Matches($Text, '(?m)^function Run-Job\(')).Count -ne 1 -or
      ([regex]::Matches($Text, '(?m)^while \(\$true\) \{')).Count -ne 1 -or
      $Text -notmatch '/api/h2-android/agent/next') {
    throw "Estrutura de agente H2 Android invalida. Versao anterior preservada."
  }
}
function Find-H2AgentProcesses {
  $Expected = [regex]::Escape($AgentPath)
  @(Get-CimInstance -ClassName Win32_Process -Filter "Name='powershell.exe'" -ErrorAction Stop |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match $Expected -and $_.CommandLine -match '(?i)-File' })
}
function Start-H2Agent {
  $Args = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Server "' + $Server + '"'
  Start-Process -FilePath $Powershell -ArgumentList $Args -WorkingDirectory $Base -WindowStyle Hidden -PassThru
}

# Download to a separate file. Do not damage the working agent if the download fails.
try {
  Invoke-WebRequest -Uri ($Server + "/api/h2-android/windows-agent.ps1") -OutFile $TempPath -TimeoutSec 45 -UseBasicParsing
  Invoke-WebRequest -Uri ($Server + "/api/h2-android/windows-socks-relay.mjs") -OutFile $RelayTempPath -TimeoutSec 45 -UseBasicParsing
  if ((Get-Item -LiteralPath $TempPath).Length -lt 3000) { throw "Download incompleto." }
  if ((Get-Item -LiteralPath $RelayTempPath).Length -lt 1000) { throw "Relay SOCKS5 incompleto." }
  Test-H2AgentSyntax $TempPath
  $Node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (!$Node) { throw "Node.js ausente. A ponte SOCKS5 precisa do Node.js no Windows." }
  & $Node.Source --check $RelayTempPath 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Ponte SOCKS5 contem erro JavaScript. Agente anterior mantido." }
} catch {
  if (Test-Path -LiteralPath $TempPath) { Remove-Item -LiteralPath $TempPath -Force }
  if (Test-Path -LiteralPath $RelayTempPath) { Remove-Item -LiteralPath $RelayTempPath -Force }
  throw
}

# Preserve the existing DPAPI token. Pair only if this is the first installation.
$HasToken = $false
if (Test-Path -LiteralPath $TokenFile) {
  try {
    $Secure = (Get-Content -LiteralPath $TokenFile -Raw).Trim() | ConvertTo-SecureString
    $Ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { $Plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Ptr) }
    $HasToken = $Plain -match '^[a-f0-9]{64}$'
    $Plain = $null
  } catch { $HasToken = $false }
}
if (!$HasToken) {
  if (!$PairCode) { $PairCode = Read-Host "Digite o codigo de pareamento do ADM H2 Android" }
  $PairCode = $PairCode.Trim()
  if ($PairCode -notmatch '^[a-fA-F0-9]{24}$') { throw "Codigo de pareamento invalido." }
  $Body = @{ code=$PairCode;computerName=$env:COMPUTERNAME;version="1.2.1-android-proxy-guard" } | ConvertTo-Json -Compress
  $Claim = Invoke-RestMethod -Uri ($Server + "/api/h2-android/agent/claim") -Method Post -ContentType "application/json" -Body $Body -TimeoutSec 35 -MaximumRedirection 0
  if ([string]$Claim.token -notmatch '^[a-f0-9]{64}$') { throw "Pareamento nao confirmado no servidor." }
  ConvertTo-SecureString -String ([string]$Claim.token) -AsPlainText -Force |
    ConvertFrom-SecureString | Set-Content -LiteralPath $TokenFile -Encoding UTF8
}

$HadOldRelay = Test-Path -LiteralPath $RelayPath
if ($HadOldRelay) { Copy-Item -LiteralPath $RelayPath -Destination $RelayBackupPath -Force }
$HadOldAgent = Test-Path -LiteralPath $AgentPath
if ($HadOldAgent) { Copy-Item -LiteralPath $AgentPath -Destination $BackupPath -Force }
$OldProcesses = @(Find-H2AgentProcesses)
foreach ($Old in $OldProcesses) {
  Stop-Process -Id $Old.ProcessId -Force -ErrorAction Stop
}
Copy-Item -LiteralPath $TempPath -Destination $AgentPath -Force
Copy-Item -LiteralPath $RelayTempPath -Destination $RelayPath -Force
Remove-Item -LiteralPath $TempPath -Force
Remove-Item -LiteralPath $RelayTempPath -Force
if (Test-Path -LiteralPath $LogPath) { Remove-Item -LiteralPath $LogPath -Force }

Write-Host "H2 Android: verificando o agente atualizado (em segundo plano)..."
$NewProcess = $null
$Online = $false
try {
  $NewProcess = Start-H2Agent
  for ($i=0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    $NewProcess.Refresh()
    if ($NewProcess.HasExited) { throw "O agente encerrou apos iniciar (codigo $($NewProcess.ExitCode))." }
    if (Test-Path -LiteralPath $LogPath) {
      $Recent = Get-Content -LiteralPath $LogPath -Tail 8 -ErrorAction SilentlyContinue
      if ($Recent -match ' ONLINE$') { $Online = $true; break }
    }
  }
  if (!$Online) { throw "O agente nao confirmou conexao online em 15 segundos." }
} catch {
  $Why = $_.Exception.Message
  if ($NewProcess) {
    try { $NewProcess.Refresh(); if (!$NewProcess.HasExited) { Stop-Process -Id $NewProcess.Id -Force } } catch {}
  }
  if ($HadOldAgent -and (Test-Path -LiteralPath $BackupPath)) {
    Copy-Item -LiteralPath $BackupPath -Destination $AgentPath -Force
    if ($HadOldRelay -and (Test-Path -LiteralPath $RelayBackupPath)) { Copy-Item -LiteralPath $RelayBackupPath -Destination $RelayPath -Force }
    elseif (!$HadOldRelay) { Remove-Item -LiteralPath $RelayPath -Force -ErrorAction SilentlyContinue }
    try { [void](Start-H2Agent) } catch {}
    throw ("Falha na atualizacao: " + $Why + ". Versao anterior restaurada.")
  }
  if ($HadOldRelay -and (Test-Path -LiteralPath $RelayBackupPath)) { Copy-Item -LiteralPath $RelayBackupPath -Destination $RelayPath -Force }
  elseif (!$HadOldRelay) { Remove-Item -LiteralPath $RelayPath -Force -ErrorAction SilentlyContinue }
  throw ("Agente nao conectou: " + $Why)
} finally {
  if ($NewProcess) { $NewProcess.Dispose() }
}

# Only after a successful authenticated heartbeat, enable silent startup.
$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $Startup "H2 Android Nativo.lnk"
$Shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $Powershell
$Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Server "' + $Server + '"'
$Shortcut.WorkingDirectory = $Base
$Shortcut.Description = "H2 Android nativo - inicializa em segundo plano"
$Shortcut.Save()
Write-Host "H2 Android: agente ONLINE e funcionando em segundo plano."
Write-Host "Instalacao verificada. H2ADS nao foi modificado."
