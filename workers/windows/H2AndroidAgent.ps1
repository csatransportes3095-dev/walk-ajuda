param(
  [switch]$Install,
  [switch]$Run,
  [switch]$Status,
  [string]$PairingCode,
  [string]$PanelUrl = "https://h2colombiano.com"
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$AgentVersion = "0.2.0"
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
    runningAvds = @(Get-H2RunningAvds)
    ramGb = $ram
    logicalProcessors = $threads
    virtualizationEnabled = $virtualization
  }
}


# The worker runs with the current user's permissions. It never accepts a shell string.
# All AVD names and network parameters are validated before entering a process.
function Invoke-H2Process([string]$exe, [string]$arguments, [bool]$binary = $false, [int]$timeout = 30000, [string]$stdin = "") {
  $start = New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName = $exe
  $start.Arguments = $arguments
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.RedirectStandardInput = $true
  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $start
  try {
    if (!$proc.Start()) { throw "Processo nao iniciou." }
    if ($stdin) { $proc.StandardInput.WriteLine($stdin) }
    $proc.StandardInput.Close()
    if ($binary) {
      $memory = New-Object System.IO.MemoryStream
      try {
        $proc.StandardOutput.BaseStream.CopyTo($memory)
        $err = $proc.StandardError.ReadToEnd()
        if (!$proc.WaitForExit($timeout) -or $proc.ExitCode -ne 0) { throw ("Comando ADB falhou: " + $err) }
        return @{ exit = 0; data = $memory.ToArray(); text = "" }
      } finally { $memory.Dispose() }
    }
    $output = $proc.StandardOutput.ReadToEnd()
    $errorText = $proc.StandardError.ReadToEnd()
    if (!$proc.WaitForExit($timeout)) { try { $proc.Kill() } catch {}; throw "Comando excedeu o tempo limite." }
    return @{ exit = $proc.ExitCode; text = ($output + " " + $errorText).Trim() }
  } finally { $proc.Dispose() }
}
function Assert-H2Avd([string]$name) {
  if ($name -notmatch '^H2Android_[0-9]{2,3}
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
  if ([IO.Path]::GetFullPath($PSCommandPath) -ne [IO.Path]::GetFullPath($AgentPath)) {
    Copy-Item -LiteralPath $PSCommandPath -Destination $AgentPath -Force
  }
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Run'
  try {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
    Write-Host "Inicializacao automatica configurada no Agendador de Tarefas."
  } catch {
    # Alguns computadores bloqueiam a criacao de tarefas sem elevacao.
    # Alternativa no Startup do usuario, sem modificar o H2 ADS.
    Write-Warning "Agendador indisponivel. Usando Inicializar do Windows para este usuario."
    $startup = [Environment]::GetFolderPath("Startup")
    if (!(Test-Path -LiteralPath $startup)) { throw "A pasta Inicializar do Windows nao foi encontrada." }
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup "H2 Android Agent.lnk"))
    $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $Folder
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    Write-Host "Inicializacao automatica configurada via pasta Inicializar."
  }
}

function Run-Agent {
  $config = Read-Config
  $script:H2AgentToken = Read-Secret ([string]$config.tokenProtected)
  Write-Host "H2 Android v$AgentVersion: painel de controle habilitado."
  $heartbeat = [datetime]::MinValue
  $lastFrame = [datetime]::MinValue
  while ($true) {
    try {
      $headers = @{ Authorization = "Bearer $script:H2AgentToken" }
      if ((Get-Date) -ge $heartbeat) {
        $report = Inspect-Computer | ConvertTo-Json -Compress -Depth 6
        Invoke-RestMethod -UseBasicParsing -Method Post -Uri "$PanelUrl/api/h2-android/agent/heartbeat" -Headers $headers -ContentType "application/json" -Body $report -TimeoutSec 20 | Out-Null
        $heartbeat = (Get-Date).AddSeconds(25)
      }
      $poll = Invoke-RestMethod -UseBasicParsing -Method Post -Uri "$PanelUrl/api/h2-android/agent/pull" -Headers $headers -ContentType "application/json" -Body "{}" -TimeoutSec 20
      if ($poll.command) {
        $ok = $true
        $message = ""
        try { $message = Run-H2Control $poll.command }
        catch { $ok = $false; $message = $_.Exception.Message }
        $body = @{id=[string]$poll.command.id;ok=$ok;message=$message.Substring(0,[Math]::Min($message.Length,300))} | ConvertTo-Json -Compress
        Invoke-RestMethod -UseBasicParsing -Method Post -Uri "$PanelUrl/api/h2-android/agent/finish" -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 15 | Out-Null
        $heartbeat = [datetime]::MinValue
      }
      if ($poll.viewAvd -and (Get-Date) -ge $lastFrame.AddSeconds(3)) {
        Capture-H2Screen ([string]$poll.viewAvd)
        $lastFrame = Get-Date
      }
    } catch {
      Write-Warning ("Falha H2 Android: " + $_.Exception.Message)
    }
    Start-Sleep -Seconds 3
  }
}

if ($Status) {
  $report = Inspect-Computer
  $report | ConvertTo-Json -Depth 6
  exit 0
}
if ($Install) {
  if (Test-Path -LiteralPath $ConfigPath) {
    $null = Read-Config
    Write-Host "Pareamento preservado. Atualizando somente o agente H2 Android."
  } else { Pair-Agent }
  Register-Startup
  # Encerrar somente a versao anterior deste MESMO agente, nao H2 ADS.
  try {
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object {
      $_.ProcessId -ne $PID -and $_.CommandLine -like ("*" + $AgentPath + "*") -and $_.CommandLine -match " -Run( |$)"
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  } catch {}
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Run'
  Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -WindowStyle Hidden
  Write-Host "Instalado e iniciado. Confira o status ONLINE em https://h2colombiano.com/adm/android."
  exit 0
}
if ($Run) { Run-Agent; exit 0 }
Write-Host "H2 Android Agent $AgentVersion"
Write-Host "Use -Status para diagnostico, -Install para parear e -Run para conectar."
) { throw "Nome de Android nao permitido." }
}
function Get-H2RunningMap {
  $adb = Find-AndroidTool "adb"
  $map = @{}
  if (!$adb) { return $map }
  try {
    $list = Invoke-H2Process $adb "devices"
    foreach ($line in ($list.text -split "[\r\n]+")) {
      if ($line -notmatch '^(emulator-[0-9]+)\s+device') { continue }
      $serial = $matches[1]
      $avd = Invoke-H2Process $adb ("-s " + $serial + " emu avd name")
      $name = (($avd.text -split "[\r\n]+") | Where-Object { $_ -match '^H2Android_[0-9]{2,3}
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
  if ([IO.Path]::GetFullPath($PSCommandPath) -ne [IO.Path]::GetFullPath($AgentPath)) {
    Copy-Item -LiteralPath $PSCommandPath -Destination $AgentPath -Force
  }
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Run'
  try {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
    Write-Host "Inicializacao automatica configurada no Agendador de Tarefas."
  } catch {
    # Alguns computadores bloqueiam a criacao de tarefas sem elevacao.
    # Alternativa no Startup do usuario, sem modificar o H2 ADS.
    Write-Warning "Agendador indisponivel. Usando Inicializar do Windows para este usuario."
    $startup = [Environment]::GetFolderPath("Startup")
    if (!(Test-Path -LiteralPath $startup)) { throw "A pasta Inicializar do Windows nao foi encontrada." }
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup "H2 Android Agent.lnk"))
    $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $Folder
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    Write-Host "Inicializacao automatica configurada via pasta Inicializar."
  }
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
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Run'
  Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -WindowStyle Hidden
  Write-Host "Instalado e iniciado. Confira o status ONLINE em https://h2colombiano.com/adm/android."
  exit 0
}
if ($Run) { Run-Agent; exit 0 }
Write-Host "H2 Android Agent $AgentVersion"
Write-Host "Use -Status para diagnostico, -Install para parear e -Run para conectar."
 } | Select-Object -First 1)
      if ($name) { $map[$name] = $serial }
    }
  } catch { Write-Warning ("Nao foi possivel consultar ADB: " + $_.Exception.Message) }
  return $map
}
function Get-H2RunningAvds { return @( (Get-H2RunningMap).Keys | Select-Object -First 10 ) }
function Get-H2Avds {
  $emulator = Find-AndroidTool "emulator"
  if (!$emulator) { return @() }
  $r = Invoke-H2Process $emulator "-list-avds"
  if ($r.exit -ne 0) { throw "Nao foi possivel listar aparelhos." }
  return @(($r.text -split "[\r\n]+") | Where-Object { $_ -match '^H2Android_[0-9]{2,3}
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
  if ([IO.Path]::GetFullPath($PSCommandPath) -ne [IO.Path]::GetFullPath($AgentPath)) {
    Copy-Item -LiteralPath $PSCommandPath -Destination $AgentPath -Force
  }
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Run'
  try {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
    Write-Host "Inicializacao automatica configurada no Agendador de Tarefas."
  } catch {
    # Alguns computadores bloqueiam a criacao de tarefas sem elevacao.
    # Alternativa no Startup do usuario, sem modificar o H2 ADS.
    Write-Warning "Agendador indisponivel. Usando Inicializar do Windows para este usuario."
    $startup = [Environment]::GetFolderPath("Startup")
    if (!(Test-Path -LiteralPath $startup)) { throw "A pasta Inicializar do Windows nao foi encontrada." }
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup "H2 Android Agent.lnk"))
    $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $Folder
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    Write-Host "Inicializacao automatica configurada via pasta Inicializar."
  }
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
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Run'
  Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -WindowStyle Hidden
  Write-Host "Instalado e iniciado. Confira o status ONLINE em https://h2colombiano.com/adm/android."
  exit 0
}
if ($Run) { Run-Agent; exit 0 }
Write-Host "H2 Android Agent $AgentVersion"
Write-Host "Use -Status para diagnostico, -Install para parear e -Run para conectar."
 })
}
function Get-H2ProxyFile { return (Join-Path $Folder "proxies.json") }
function Get-H2Proxies {
  $file = Get-H2ProxyFile
  if (!(Test-Path -LiteralPath $file)) { return @{} }
  try {
    $map = @{}
    $obj = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
    foreach ($prop in $obj.PSObject.Properties) {
      if ($prop.Name -match '^H2Android_[0-9]{2,3}
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
  if ([IO.Path]::GetFullPath($PSCommandPath) -ne [IO.Path]::GetFullPath($AgentPath)) {
    Copy-Item -LiteralPath $PSCommandPath -Destination $AgentPath -Force
  }
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Run'
  try {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
    Write-Host "Inicializacao automatica configurada no Agendador de Tarefas."
  } catch {
    # Alguns computadores bloqueiam a criacao de tarefas sem elevacao.
    # Alternativa no Startup do usuario, sem modificar o H2 ADS.
    Write-Warning "Agendador indisponivel. Usando Inicializar do Windows para este usuario."
    $startup = [Environment]::GetFolderPath("Startup")
    if (!(Test-Path -LiteralPath $startup)) { throw "A pasta Inicializar do Windows nao foi encontrada." }
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup "H2 Android Agent.lnk"))
    $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $Folder
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    Write-Host "Inicializacao automatica configurada via pasta Inicializar."
  }
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
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Run'
  Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -WindowStyle Hidden
  Write-Host "Instalado e iniciado. Confira o status ONLINE em https://h2colombiano.com/adm/android."
  exit 0
}
if ($Run) { Run-Agent; exit 0 }
Write-Host "H2 Android Agent $AgentVersion"
Write-Host "Use -Status para diagnostico, -Install para parear e -Run para conectar."
 -and $prop.Value -match '^http://[a-zA-Z0-9.-]+:[0-9]{1,5}
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
  if ([IO.Path]::GetFullPath($PSCommandPath) -ne [IO.Path]::GetFullPath($AgentPath)) {
    Copy-Item -LiteralPath $PSCommandPath -Destination $AgentPath -Force
  }
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Run'
  try {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
    Write-Host "Inicializacao automatica configurada no Agendador de Tarefas."
  } catch {
    # Alguns computadores bloqueiam a criacao de tarefas sem elevacao.
    # Alternativa no Startup do usuario, sem modificar o H2 ADS.
    Write-Warning "Agendador indisponivel. Usando Inicializar do Windows para este usuario."
    $startup = [Environment]::GetFolderPath("Startup")
    if (!(Test-Path -LiteralPath $startup)) { throw "A pasta Inicializar do Windows nao foi encontrada." }
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup "H2 Android Agent.lnk"))
    $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $Folder
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    Write-Host "Inicializacao automatica configurada via pasta Inicializar."
  }
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
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Run'
  Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -WindowStyle Hidden
  Write-Host "Instalado e iniciado. Confira o status ONLINE em https://h2colombiano.com/adm/android."
  exit 0
}
if ($Run) { Run-Agent; exit 0 }
Write-Host "H2 Android Agent $AgentVersion"
Write-Host "Use -Status para diagnostico, -Install para parear e -Run para conectar."
) {
        $map[$prop.Name] = [string]$prop.Value
      }
    }
    return $map
  } catch { return @{} }
}
function Run-H2Control($command) {
  $name = [string]$command.avdName
  Assert-H2Avd $name
  $action = [string]$command.action
  if ($action -notin @("create","start","stop","tap","key","proxy")) { throw "Operacao nao permitida." }
  $adb = Find-AndroidTool "adb"
  $emu = Find-AndroidTool "emulator"
  if (!$adb -or !$emu) { throw "SDK Android nao disponivel." }
  $avds = @(Get-H2Avds)
  $exists = $avds -contains $name
  if ($action -eq "create") {
    if ($exists) { throw "Android ja cadastrado." }
    $root = Split-Path (Split-Path $emu -Parent) -Parent
    $manager = Join-Path $root "cmdline-tools\latest\bin\avdmanager.bat"
    $img = Join-Path $root "system-images\android-35\google_apis_playstore\x86_64\system.img"
    if (!(Test-Path -LiteralPath $manager) -or !(Test-Path -LiteralPath $img)) { throw "Imagem Android 15 e ferramentas SDK necessarias para criar aparelhos." }
    $argument = '/d /s /c ""' + $manager + '" create avd -n ' + $name + ' -k "system-images;android-35;google_apis_playstore;x86_64" -d pixel_8"'
    $r = Invoke-H2Process $env:ComSpec $argument $false 120000 "no"
    if ($r.exit -ne 0 -or !((Get-H2Avds) -contains $name)) { throw ("Criacao falhou: " + $r.text) }
    return "Android criado. Pronto para iniciar pelo site."
  }
  if (!$exists) { throw "Android nao encontrado." }
  $running = Get-H2RunningMap
  if ($action -eq "proxy") {
    $hostName = [string]$command.payload.host
    $port = [int]$command.payload.port
    if (($hostName -eq "") -ne ($port -eq 0)) { throw "Host/porta invalidos." }
    if ($hostName -and ($hostName -notmatch '^[a-zA-Z0-9.-]{1,253}
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
  if ([IO.Path]::GetFullPath($PSCommandPath) -ne [IO.Path]::GetFullPath($AgentPath)) {
    Copy-Item -LiteralPath $PSCommandPath -Destination $AgentPath -Force
  }
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Run'
  try {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
    Write-Host "Inicializacao automatica configurada no Agendador de Tarefas."
  } catch {
    # Alguns computadores bloqueiam a criacao de tarefas sem elevacao.
    # Alternativa no Startup do usuario, sem modificar o H2 ADS.
    Write-Warning "Agendador indisponivel. Usando Inicializar do Windows para este usuario."
    $startup = [Environment]::GetFolderPath("Startup")
    if (!(Test-Path -LiteralPath $startup)) { throw "A pasta Inicializar do Windows nao foi encontrada." }
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup "H2 Android Agent.lnk"))
    $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $Folder
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    Write-Host "Inicializacao automatica configurada via pasta Inicializar."
  }
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
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Run'
  Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -WindowStyle Hidden
  Write-Host "Instalado e iniciado. Confira o status ONLINE em https://h2colombiano.com/adm/android."
  exit 0
}
if ($Run) { Run-Agent; exit 0 }
Write-Host "H2 Android Agent $AgentVersion"
Write-Host "Use -Status para diagnostico, -Install para parear e -Run para conectar."
 -or $port -lt 1 -or $port -gt 65535)) { throw "Proxy invalido." }
    if ($running.ContainsKey($name)) { throw "Desligue o Android antes de alterar o proxy." }
    $proxies = Get-H2Proxies
    if ($hostName) { $proxies[$name] = "http://" + $hostName + ":" + $port } else { $proxies.Remove($name) }
    $proxies | ConvertTo-Json -Compress | Set-Content -LiteralPath (Get-H2ProxyFile) -Encoding UTF8
    return $(if ($hostName) { "Proxy HTTP configurado para a proxima inicializacao." } else { "Proxy HTTP removido." })
  }
  if ($action -eq "start") {
    if ($running.ContainsKey($name)) { return "Android ja esta ligado." }
    if ($running.Count -ge 5) { throw "Limite de cinco Androids ligados." }
    $args = @("-avd", $name, "-no-window", "-no-audio", "-no-snapshot-load")
    $proxy = Get-H2Proxies
    if ($proxy.ContainsKey($name)) { $args += @("-http-proxy", $proxy[$name]) }
    Start-Process -FilePath $emu -ArgumentList $args -WorkingDirectory (Split-Path $emu -Parent) -WindowStyle Hidden | Out-Null
    return "Inicializacao solicitada. Aguarde o aparelho ficar online."
  }
  if (!$running.ContainsKey($name)) { throw "Android desligado. Ligue pelo site." }
  $serial = $running[$name]
  if ($action -eq "stop") {
    $result = Invoke-H2Process $adb ("-s " + $serial + " emu kill") $false 20000
    if ($result.exit -ne 0) { throw ("Falha ao desligar: " + $result.text) }
    return "Desligamento solicitado."
  }
  if ($action -eq "tap") {
    $x = [int]$command.payload.x; $y = [int]$command.payload.y
    if ($x -lt 0 -or $x -gt 5000 -or $y -lt 0 -or $y -gt 10000) { throw "Coordenadas fora do limite." }
    $args = "-s " + $serial + " shell input tap " + $x + " " + $y
  } else {
    $key = [string]$command.payload.key
    if ($key -notin @("BACK","HOME","ENTER","POWER")) { throw "Tecla nao permitida." }
    $keyCode = @{BACK=4;HOME=3;ENTER=66;POWER=26}[$key]
    $args = "-s " + $serial + " shell input keyevent " + $keyCode
  }
  $result = Invoke-H2Process $adb $args
  if ($result.exit -ne 0) { throw ("ADB: " + $result.text) }
  return "Comando executado."
}
function Capture-H2Screen([string]$name) {
  Assert-H2Avd $name
  $map = Get-H2RunningMap
  if (!$map.ContainsKey($name)) { return }
  $adb = Find-AndroidTool "adb"
  $result = Invoke-H2Process $adb ("-s " + $map[$name] + " exec-out screencap -p") $true 20000
  if ($result.data.Length -lt 100 -or $result.data.Length -gt 3300000) { return }
  $body = @{ avdName=$name; pngBase64=[Convert]::ToBase64String($result.data) } | ConvertTo-Json -Compress
  $headers = @{Authorization = "Bearer $script:H2AgentToken"}
  Invoke-RestMethod -UseBasicParsing -Uri "$PanelUrl/api/h2-android/agent/frame" -Method Post -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 25 | Out-Null
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
  if ([IO.Path]::GetFullPath($PSCommandPath) -ne [IO.Path]::GetFullPath($AgentPath)) {
    Copy-Item -LiteralPath $PSCommandPath -Destination $AgentPath -Force
  }
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Run'
  try {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
    Write-Host "Inicializacao automatica configurada no Agendador de Tarefas."
  } catch {
    # Alguns computadores bloqueiam a criacao de tarefas sem elevacao.
    # Alternativa no Startup do usuario, sem modificar o H2 ADS.
    Write-Warning "Agendador indisponivel. Usando Inicializar do Windows para este usuario."
    $startup = [Environment]::GetFolderPath("Startup")
    if (!(Test-Path -LiteralPath $startup)) { throw "A pasta Inicializar do Windows nao foi encontrada." }
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup "H2 Android Agent.lnk"))
    $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $Folder
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    Write-Host "Inicializacao automatica configurada via pasta Inicializar."
  }
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
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $AgentPath + '" -Run'
  Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -WindowStyle Hidden
  Write-Host "Instalado e iniciado. Confira o status ONLINE em https://h2colombiano.com/adm/android."
  exit 0
}
if ($Run) { Run-Agent; exit 0 }
Write-Host "H2 Android Agent $AgentVersion"
Write-Host "Use -Status para diagnostico, -Install para parear e -Run para conectar."
