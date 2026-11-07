param(
  [switch]$Install,
  [switch]$Run,
  [switch]$Status,
  [string]$PairingCode,
  [string]$PanelUrl = "https://h2colombiano.com"
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$AgentVersion = "0.1.0"
$Folder = Join-Path $env:LOCALAPPDATA "H2AndroidAgent"
$ConfigPath = Join-Path $Folder "agent.json"
$AgentPath = Join-Path $Folder "H2AndroidAgent.ps1"
$TaskName = "H2 Android Agent"
$PanelUrl = $PanelUrl.TrimEnd("/")
if ($PanelUrl -ne "https://h2colombiano.com") { throw "Use o endereco oficial https://h2colombiano.com." }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Find-AndroidTool([string]$Tool) {
  $candidates = @()
  if ($env:ANDROID_HOME) { $candidates += $env:ANDROID_HOME }
  if ($env:ANDROID_SDK_ROOT) { $candidates += $env:ANDROID_SDK_ROOT }
  $candidates += (Join-Path $env:LOCALAPPDATA "Android\Sdk")
  foreach ($root in $candidates) {
    $relative = if ($Tool -eq "adb") { "platform-tools\adb.exe" } else { "emulator\emulator.exe" }
    $exe = Join-Path $root $relative
    if (Test-Path -LiteralPath $exe -PathType Leaf) { return $exe }
  }
  $cmd = Get-Command ($Tool + ".exe") -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Read-Secret([string]$Ciphertext) {
  $secure = ConvertTo-SecureString -String $Ciphertext
  $creds = New-Object System.Management.Automation.PSCredential("agent", $secure)
  return $creds.GetNetworkCredential().Password
}

function Read-Config {
  if (!(Test-Path -LiteralPath $ConfigPath)) { throw "Agente nao pareado. Execute com -Install." }
  $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
  if (!$config.tokenProtected) { throw "Configuracao sem token valido. Reinstale o agente." }
  return $config
}

function Inspect-Computer {
  $adb = Find-AndroidTool "adb"
  $emulator = Find-AndroidTool "emulator"
  $avds = @()
  if ($emulator) {
    try { $avds = @(& $emulator -list-avds 2>$null | Where-Object { $_ -and $_.Length -le 80 } | Select-Object -First 20) } catch {}
  }
  $devices = @()
  if ($adb) {
    try {
      $devices = @(& $adb devices 2>$null |
        Where-Object { $_ -match "^(emulator-[0-9]+)\s+device$" } |
        ForEach-Object { $matches[1] } | Select-Object -First 10)
    } catch {}
  }
  $ram = $null
  $threads = $null
  $virtualization = $null
  $windowsVersion = [Environment]::OSVersion.VersionString
  try {
    $computer = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
    $ram = [Math]::Round([double]$computer.TotalPhysicalMemory / 1GB, 1)
    $threads = [int]$computer.NumberOfLogicalProcessors
  } catch {}
  try {
    $cpu = Get-CimInstance Win32_Processor -ErrorAction Stop | Select-Object -First 1
    if ($null -ne $cpu.VirtualizationFirmwareEnabled) { $virtualization = [bool]$cpu.VirtualizationFirmwareEnabled }
  } catch {}
  return @{
    computerName = ([Environment]::MachineName.Substring(0,[Math]::Min(80,[Environment]::MachineName.Length)))
    windowsVersion = $windowsVersion.Substring(0,[Math]::Min(100,$windowsVersion.Length))
    agentVersion = $AgentVersion
    sdkDetected = [bool]($adb -or $emulator)
    adbDetected = [bool]$adb
    emulatorDetected = [bool]$emulator
    avdNames = @($avds)
    emulatorDevices = @($devices)
    ramGb = $ram
    logicalProcessors = $threads
    virtualizationEnabled = $virtualization
  }
}

function Pair-Agent {
  if (![string]::IsNullOrWhiteSpace($PairingCode)) {
    $code = $PairingCode
  } else {
    $secret = Read-Host "Cole o codigo temporario de 10 minutos gerado no ADM" -AsSecureString
    $creds = New-Object System.Management.Automation.PSCredential("pairing", $secret)
    $code = $creds.GetNetworkCredential().Password
  }
  $code = ($code -replace '[\s-]','').ToUpperInvariant()
  if ($code -notmatch '^[A-F0-9]{32}$') { throw "Codigo de pareamento invalido." }
  $body = @{ pairingCode=$code; computerName=[Environment]::MachineName } | ConvertTo-Json -Compress
  $response = Invoke-RestMethod -UseBasicParsing -Method Post -Uri "$PanelUrl/api/h2-android/agent/claim" -ContentType "application/json" -Body $body -TimeoutSec 20
  $protected = ConvertTo-SecureString -String $response.agentToken -AsPlainText -Force | ConvertFrom-SecureString
  New-Item -ItemType Directory -Path $Folder -Force | Out-Null
  $config = @{ baseUrl=$PanelUrl; agentId=$response.agentId; tokenProtected=$protected }
  $config | ConvertTo-Json -Compress | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
  Write-Host "H2 Android: computador pareado com sucesso."
}

function Register-Startup {
  New-Item -ItemType Directory -Path $Folder -Force | Out-Null
  Copy-Item -LiteralPath $PSCommandPath -Destination $AgentPath -Force
  $execute = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$AgentPath`" -Run"
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$AgentPath`" -Run"
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
  Write-Host "Inicializacao automatica configurada para este usuario."
}

function Run-Agent {
  $config = Read-Config
  $token = Read-Secret ([string]$config.tokenProtected)
  Write-Host "H2 Android: agente iniciado. Apenas diagnostico e status; nenhum emulador sera ligado."
  while ($true) {
    try {
      $report = Inspect-Computer | ConvertTo-Json -Compress -Depth 6
      Invoke-RestMethod -UseBasicParsing -Method Post -Uri "$PanelUrl/api/h2-android/agent/heartbeat" -Headers @{Authorization = "Bearer $token"} -ContentType "application/json" -Body $report -TimeoutSec 20 | Out-Null
    } catch {
      Write-Warning "Falha de conexao com H2 Android: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 30
  }
}

if ($Status) {
  $report = Inspect-Computer
  $report | ConvertTo-Json -Depth 6
  exit 0
}
if ($Install) {
  Pair-Agent
  Register-Startup
  Write-Host "Pareamento concluido. Execute -Run para iniciar agora; nas proximas entradas Windows iniciara automaticamente."
  exit 0
}
if ($Run) { Run-Agent; exit 0 }
Write-Host "H2 Android Agent $AgentVersion"
Write-Host "Use -Status para diagnostico, -Install para parear e -Run para conectar."
