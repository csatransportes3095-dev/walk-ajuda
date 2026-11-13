# H2 Android native installer - per-user, no administrator privileges required.
# This installer only affects %LOCALAPPDATA%\H2AndroidNative.
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
$Url = $Server + "/api/h2-android/windows-agent.ps1"
Invoke-WebRequest -Uri $Url -OutFile $AgentPath -TimeoutSec 40 -UseBasicParsing
if (!(Test-Path $AgentPath) -or (Get-Item $AgentPath).Length -lt 2000) {
  throw "Download do agente incompleto. Nenhum pareamento foi realizado."
}

$TokenFile = Join-Path $Base "agent.secure"
$HasPairedToken = $false
if (Test-Path $TokenFile) {
  try {
    $Stored = (Get-Content -Raw -Path $TokenFile).Trim() | ConvertTo-SecureString
    $SecretPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Stored)
    try { $PlainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($SecretPtr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($SecretPtr) }
    $HasPairedToken = ($PlainToken -match '^[a-f0-9]{64}$')
    $PlainToken = $null
  } catch { Write-Warning "Credencial antiga nao pode ser lida; sera preciso parear novamente." }
}
if ($HasPairedToken) {
  Write-Host "Pareamento existente preservado. Nao precisa gerar outro codigo."
} else {
  if (!$PairCode) { $PairCode = Read-Host "Digite o codigo temporario gerado no ADM H2 Android" }
  $PairCode = $PairCode.Trim()
  if ($PairCode -notmatch '^[A-Fa-f0-9]{24}$') { throw "Codigo invalido. Gere um novo codigo no ADM." }
  $Payload = @{ code=$PairCode; computerName=$env:COMPUTERNAME; version="1.0.1" } | ConvertTo-Json -Compress
  $Claim = Invoke-RestMethod -Uri ($Server + "/api/h2-android/agent/claim") -Method Post -ContentType "application/json" -Body $Payload -TimeoutSec 35 -MaximumRedirection 0
  if (!$Claim.token -or ([string]$Claim.token) -notmatch '^[a-f0-9]{64}$') { throw "O servidor nao confirmou o pareamento." }
  ConvertTo-SecureString -String ([string]$Claim.token) -AsPlainText -Force |
    ConvertFrom-SecureString | Set-Content -Path $TokenFile -Encoding UTF8
  Write-Host "Pareamento confirmado no servidor."
}

$Powershell = Join-Path $PSHOME "powershell.exe"
if (!(Test-Path $Powershell)) { $Powershell = "powershell.exe" }
$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $Startup "H2 Android Nativo.lnk"
$Shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $Powershell
$Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Server "' + $Server + '"'
$Shortcut.WorkingDirectory = $Base
$Shortcut.Description = "H2 Android nativo - conecta automaticamente ao Windows"
$Shortcut.Save()

# Stop only an older H2 Android agent process; no H2ADS processes touched.
try {
  $AgentPathPattern = [regex]::Escape($AgentPath)
  $Previous = @(Get-CimInstance -ClassName Win32_Process -Filter "Name='powershell.exe'" -ErrorAction Stop |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match $AgentPathPattern -and $_.CommandLine -match '(?i)-File' })
  foreach ($proc in $Previous) { Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop }
} catch { Write-Warning "Nao foi possivel fechar o agente H2 Android anterior." }
Write-Host "Agente atualizado. Iniciando nova conexao..."
Start-Process -FilePath $Powershell -ArgumentList @(
  "-NoProfile","-ExecutionPolicy","Bypass","-File",('"' + $AgentPath + '"'),
  "-Server",('"' + $Server + '"')
) -WorkingDirectory $Base -WindowStyle Hidden
Write-Host "Atalho H2 Android atualizado na pasta Inicializar do Windows."
Write-Host "H2ADS e outros agentes nao foram alterados."
