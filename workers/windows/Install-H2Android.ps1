# H2 Android native installer - per-user, no administrator privileges required.
# This installer only affects %LOCALAPPDATA%\H2AndroidNative.
param(
  [string]$Server = "https://www.h2colombiano.com",
  [string]$PairCode = ""
)
$ErrorActionPreference = "Stop"
$Server = $Server.TrimEnd("/")
if ($Server -notmatch '^https://[a-z0-9.-]+$') { throw "Servidor deve usar HTTPS." }
$Base = Join-Path $env:LOCALAPPDATA "H2AndroidNative"
New-Item -ItemType Directory -Path $Base -Force | Out-Null
$AgentPath = Join-Path $Base "H2AndroidAgent.ps1"
$Url = $Server + "/api/h2-android/windows-agent.ps1"
Invoke-WebRequest -Uri $Url -OutFile $AgentPath -TimeoutSec 40 -UseBasicParsing
if (!(Test-Path $AgentPath) -or (Get-Item $AgentPath).Length -lt 2000) {
  throw "Download do agente incompleto. Nenhum pareamento foi realizado."
}

if (!$PairCode) { $PairCode = Read-Host "Digite o codigo temporario gerado no ADM H2 Android" }
$PairCode = $PairCode.Trim()
if ($PairCode -notmatch '^[A-Fa-f0-9]{24}$') {
  throw "Codigo invalido. Gere um novo codigo de pareamento no ADM."
}

# Pair before creating any autostart shortcut. Invalid codes leave no startup task.
$Payload = @{ code=$PairCode; computerName=$env:COMPUTERNAME; version="1.0.0" } | ConvertTo-Json -Compress
$Claim = Invoke-RestMethod -Uri ($Server + "/api/h2-android/agent/claim") -Method Post -ContentType "application/json" -Body $Payload -TimeoutSec 35
if (!$Claim.token -or ([string]$Claim.token) -notmatch '^[a-f0-9]{64}$') {
  throw "O servidor nao confirmou o pareamento. Nenhum atalho foi criado."
}
$TokenFile = Join-Path $Base "agent.secure"
ConvertTo-SecureString -String ([string]$Claim.token) -AsPlainText -Force |
  ConvertFrom-SecureString | Set-Content -Path $TokenFile -Encoding UTF8
Write-Host "Pareamento confirmado no servidor."

$Powershell = Join-Path $PSHOME "powershell.exe"
if (!(Test-Path $Powershell)) { $Powershell = "powershell.exe" }
$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $Startup "H2 Android Nativo.lnk"
$Shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $Powershell
$Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File "' + $AgentPath + '" -Server "' + $Server + '"'
$Shortcut.WorkingDirectory = $Base
$Shortcut.Description = "H2 Android nativo - conecta automaticamente ao Windows"
$Shortcut.Save()

Write-Host "Instalacao concluida. Abrindo o agente na janela do PowerShell..."
Start-Process -FilePath $Powershell -ArgumentList @(
  "-NoProfile","-ExecutionPolicy","Bypass","-File",('"' + $AgentPath + '"'),
  "-Server",('"' + $Server + '"')
) -WorkingDirectory $Base -WindowStyle Normal
Write-Host "Atalho H2 Android criado na pasta Inicializar do Windows."
Write-Host "H2ADS e outros agentes nao foram alterados."
