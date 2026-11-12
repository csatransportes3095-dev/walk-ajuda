# H2 Android native installer - per-user, no administrator privileges required.
# No H2ADS files, tasks, shortcuts or settings are modified.
param(
  [string]$Server = "https://www.h2colombiano.com",
  [string]$PairCode = ""
)
$ErrorActionPreference = "Stop"
$Server = $Server.TrimEnd("/")
if ($Server -notmatch '^https://[a-z0-9.-]+$') { throw "Servidor deve ser HTTPS." }
$Base = Join-Path $env:LOCALAPPDATA "H2AndroidNative"
New-Item -ItemType Directory -Path $Base -Force | Out-Null
$AgentPath = Join-Path $Base "H2AndroidAgent.ps1"
$Url = $Server + "/api/h2-android/windows-agent.ps1"
Invoke-WebRequest -Uri $Url -OutFile $AgentPath -TimeoutSec 40 -UseBasicParsing
if (!(Test-Path $AgentPath) -or (Get-Item $AgentPath).Length -lt 2000) {
  throw "Download do agente incompleto. Nada foi instalado."
}
$Powershell = Join-Path $PSHOME "powershell.exe"
if (!(Test-Path $Powershell)) { $Powershell = "powershell.exe" }
$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $Startup "H2 Android Nativo.lnk"
$Shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $Powershell
$Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File "' + $AgentPath + '" -Server "' + $Server + '"'
$Shortcut.WorkingDirectory = $Base
$Shortcut.Description = "Agente H2 Android Nativo: inicia com o Windows"
$Shortcut.Save()
if (!$PairCode) { $PairCode = Read-Host "Digite o código de pareamento do ADM H2 Android" }
Write-Host "Instalação em $Base concluída. Iniciando agente..."
Start-Process -FilePath $Powershell -ArgumentList @(
  "-NoProfile","-ExecutionPolicy","Bypass","-File",('"' + $AgentPath + '"'),
  "-Server",('"' + $Server + '"'),"-PairCode",$PairCode
) -WorkingDirectory $Base
Write-Host "Atalho H2 Android criado na pasta Inicializar do Windows."
Write-Host "Não alterou nenhuma instância ou serviço H2ADS."
