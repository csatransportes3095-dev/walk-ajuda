# H2 Android Windows Agent - runs native Google Android Emulator windows only.
# Requires Google SDK command-line tools + Android Emulator + a Play Store x86_64 image.
# Scope: %LOCALAPPDATA%\H2AndroidNative. Does not touch H2ADS/other AVDs.
param(
  [string]$Server = "https://h2colombiano.com",
  [string]$PairCode = ""
)
$ErrorActionPreference = "Stop"
$Version = "1.3.0-live-socks-switch"
$Base = Join-Path $env:LOCALAPPDATA "H2AndroidNative"
$AvdHome = Join-Path $Base "avd"
$TokenFile = Join-Path $Base "agent.secure"
New-Item -ItemType Directory -Force -Path $Base,$AvdHome | Out-Null
$env:ANDROID_AVD_HOME = $AvdHome
$Server = $Server.TrimEnd("/")
# The www host redirects to the apex; PowerShell drops Authorization across it.
if ($Server -ieq "https://www.h2colombiano.com") { $Server = "https://h2colombiano.com" }
if ($Server -ine "https://h2colombiano.com") { throw "Servidor H2 Android nao autorizado." }

function Api([string]$Endpoint, [object]$Body, [string]$Token = "") {
  $Headers = @{}
  if ($Token) { $Headers.Authorization = "Bearer $Token" }
  return Invoke-RestMethod -Uri ($Server + $Endpoint) -Method Post -ContentType "application/json" -Headers $Headers -Body (ConvertTo-Json -InputObject $Body -Depth 8 -Compress) -TimeoutSec 45 -MaximumRedirection 0
}
function Read-Token {
  if (!(Test-Path $TokenFile)) { return "" }
  $Secure = (Get-Content -Raw -Path $TokenFile).Trim() | ConvertTo-SecureString
  $Bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr) }
}
function Save-Token([string]$Token) {
  ConvertTo-SecureString -String $Token -AsPlainText -Force |
    ConvertFrom-SecureString | Set-Content -Path $TokenFile -Encoding UTF8
}
function Android-Sdk {
  $Candidates = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA "Android\Sdk")) | Where-Object { $_ }
  foreach ($item in $Candidates) {
    if ((Test-Path (Join-Path $item "emulator\emulator.exe")) -and
        (Test-Path (Join-Path $item "platform-tools\adb.exe")) -and
        (Test-Path (Join-Path $item "cmdline-tools\latest\bin\avdmanager.bat"))) { return $item }
  }
  throw "Android SDK incompleto. Instale Emulator, Platform Tools e Command-line Tools no Android Studio."
}
# Java auto-discovery / one-time free JDK bootstrap for H2 Android only.
# JAVA_HOME and PATH modifications stay local to this PowerShell agent.
function Set-H2AndroidJava {
  $Dirs = New-Object "System.Collections.Generic.List[string]"
  foreach ($root in @($env:ProgramFiles, [Environment]::GetFolderPath("ProgramFilesX86"))) {
    if ($root) {
      $Dirs.Add((Join-Path $root "Android\Android Studio\jbr"))
      $Dirs.Add((Join-Path $root "Android\Android Studio\jre"))
    }
  }
  if ($env:LOCALAPPDATA) {
    $Dirs.Add((Join-Path $env:LOCALAPPDATA "Programs\Android Studio\jbr"))
  }
  $Dirs.Add((Join-Path $Base "jdk21"))
  foreach ($root in @($env:STUDIO_JDK, $env:JAVA_HOME, $env:JDK_HOME)) {
    if ($root) { $Dirs.Add($root) }
  }
  $Selected = $null
  foreach ($d in $Dirs) {
    if ((Test-Path -LiteralPath (Join-Path $d "bin\java.exe")) -and
        (Test-Path -LiteralPath (Join-Path $d "bin\javac.exe"))) {
      $Selected = $d
      break
    }
  }
  if (!$Selected) {
    $Cmd = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($Cmd -and $Cmd.Source) {
      $Candidate = Split-Path -Parent (Split-Path -Parent $Cmd.Source)
      if (Test-Path -LiteralPath (Join-Path $Candidate "bin\javac.exe")) {
        $Selected = $Candidate
      }
    }
  }
  if (!$Selected) {
    if (![Environment]::Is64BitOperatingSystem) {
      throw "Java e Android Emulator exigem Windows de 64 bits."
    }
    $JdkDir = Join-Path $Base "jdk21"
    if (Test-Path -LiteralPath $JdkDir) {
      throw "Java H2 Android incompleto em pasta propria. Nenhum arquivo antigo foi apagado."
    }
    Write-Host "H2 Android: preparando Java 21 gratuito (Temurin), sem administrador..."
    $ApiUrl = "https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse"
    $Assets = @(Invoke-RestMethod -Uri $ApiUrl -TimeoutSec 45)
    $JdkAsset = $Assets | Where-Object {
      $_.binary.package.link -match '^https://github[.]com/adoptium/temurin21-binaries/releases/download/' -and
      $_.binary.package.name -match '[.]zip$' -and
      $_.binary.package.checksum -match '^[0-9a-fA-F]{64}$'
    } | Select-Object -First 1
    if (!$JdkAsset) { throw "Nao foi possivel obter um pacote Java confiavel no Adoptium." }
    $ZipFile = Join-Path $Base ("jdk21-" + [guid]::NewGuid().ToString("N") + ".zip")
    $TempDir = Join-Path $Base ("jdk21-stage-" + [guid]::NewGuid().ToString("N"))
    try {
      Invoke-WebRequest -Uri ([string]$JdkAsset.binary.package.link) -UseBasicParsing -OutFile $ZipFile -TimeoutSec 600
      $ActualHash = (Get-FileHash -LiteralPath $ZipFile -Algorithm SHA256).Hash
      if ($ActualHash -ine [string]$JdkAsset.binary.package.checksum) {
        throw "O arquivo Java nao passou na verificacao SHA-256."
      }
      Expand-Archive -LiteralPath $ZipFile -DestinationPath $TempDir -Force
      $Folder = Get-ChildItem -LiteralPath $TempDir -Directory | Where-Object {
        (Test-Path -LiteralPath (Join-Path $_.FullName "bin\java.exe")) -and
        (Test-Path -LiteralPath (Join-Path $_.FullName "bin\javac.exe"))
      } | Select-Object -First 1
      if (!$Folder) { throw "Arquivo Java nao contem JDK valido." }
      Move-Item -LiteralPath $Folder.FullName -Destination $JdkDir -ErrorAction Stop
      $Selected = $JdkDir
      Write-Host "H2 Android: Java 21 instalado apenas na pasta H2 Android."
    } finally {
      if (Test-Path -LiteralPath $ZipFile) { Remove-Item -LiteralPath $ZipFile -Force -ErrorAction SilentlyContinue }
      if (Test-Path -LiteralPath $TempDir) { Remove-Item -LiteralPath $TempDir -Recurse -Force -ErrorAction SilentlyContinue }
    }
  }
  $env:JAVA_HOME = $Selected
  $env:PATH = (Join-Path $Selected "bin") + ";" + $env:PATH
  Write-Host "H2 Android: Java pronto para criar a instancia."
}

function Avd-Name([string]$Id) {
  if ($Id -notmatch '^[a-fA-F0-9-]{36}$') { throw "Identificador Android inválido." }
  return "H2_" + $Id.Replace("-","")
}
# ADB writes non-fatal startup notices to stderr on port 5037.
# Windows PowerShell 5.1 treats this as an exception when ErrorActionPreference=Stop.
# The wrapper ignores informational stderr but checks the real process exit code.
# Never kill or replace a shared ADB server used by other software.
function Invoke-H2Adb {
  param([string]$Executable,[string[]]$CommandArgs)
  $OriginalPreference = $ErrorActionPreference
  $ExitCode = -1
  $Output = @()
  try {
    $ErrorActionPreference = "SilentlyContinue"
    $Output = @(& $Executable @CommandArgs 2>$null)
    $ExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $OriginalPreference
  }
  if ($ExitCode -ne 0) {
    throw "ADB retornou codigo $ExitCode. Verifique o Android SDK e o servidor ADB."
  }
  return $Output
}

function Adb-Serial([string]$Adb,[string]$Name) {
  $Lines = @(Invoke-H2Adb -Executable $Adb -CommandArgs @("devices"))
  foreach ($line in $Lines) {
    if ($line -match '^(emulator-\d+)\s+device') {
      $serial = $Matches[1]
      $found = @(Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$serial,"emu","avd","name"))
      if ($found -contains $Name) { return $serial }
    }
  }
  return $null
}
# Use one HTTP proxy mode only: the Emulator's -http-proxy.
# Android global http_proxy conflicts with the emulator network proxy.
function Clear-H2AndroidGlobalProxy {
  param([string]$Adb,[string]$Serial)
  Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","settings","put","global","http_proxy",":0") | Out-Null
  $Value = (@(Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","settings","get","global","http_proxy")) | Out-String).Trim()
  if ($Value -notin @(":0","null","")) {
    throw "Proxy global Android nao foi desativado; nao conectar com duas configuracoes de rede."
  }
}
# Smoke test originates inside the guest, so it must traverse the Emulator TCP
# proxy. This does NOT prove UDP support or that every app respects the proxy.
function Test-H2AndroidTcpIp {
  param([string]$Adb,[string]$Serial)
  $Cmd = "printf 'GET / HTTP/1.0\r\nHost: checkip.amazonaws.com\r\nConnection: close\r\n\r\n' | toybox nc -w 12 checkip.amazonaws.com 80"
  $Raw = (@(Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell",$Cmd)) | Out-String)
  if ($Raw -notmatch '(?m)^HTTP/1\.[01] 200\b') { throw "Android nao conseguiu acessar a Internet pelo proxy HTTP/TCP." }
  $Match = [regex]::Match($Raw,'(?m)^\s*((?:[0-9]{1,3}\.){3}[0-9]{1,3})\s*$')
  if (!$Match.Success) { throw "Android respondeu ao teste HTTP mas nao informou IP." }
  return $Match.Groups[1].Value
}
function Assert-H2AndroidProxyOrStop {
  param([string]$Adb,[string]$Serial,[int]$RelayPort)
  try {
    if (!(Test-H2RelayPort -Port $RelayPort)) { throw "Ponte SOCKS5 nao esta disponivel." }
    Clear-H2AndroidGlobalProxy -Adb $Adb -Serial $Serial
    $Ip = Test-H2AndroidTcpIp -Adb $Adb -Serial $Serial
    Write-H2Status ("HTTP/TCP confirmado de dentro do Android: " + $Ip)
    return $Ip
  } catch {
    $Cause = $_.Exception.Message
    try { Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"emu","kill") | Out-Null }
    catch { Write-H2Status ("Falha ao parar Android sem rede validada: " + $Serial) }
    throw ("Internet dentro do Android nao validada. " + $Cause)
  }
}
function Switch-H2RelayUpstream {
  param([string]$Name,[string]$OldProxyId,[string]$NewProxyId,[object]$Proxy)
  $ReadyFile = Get-H2RelayReadyFile -Name $Name
  if (!(Test-Path -LiteralPath $ReadyFile)) { throw "Ponte do Android nao encontrada; nenhuma troca foi efetuada." }
  $Ready = Get-Content -LiteralPath $ReadyFile -Raw | ConvertFrom-Json
  if (!(Test-H2RelayProcess -ProcessId ([int]$Ready.pid) -Name $Name) -or
      !(Test-H2RelayPort -Port ([int]$Ready.port))) {
    throw "Ponte do Android nao esta ativa; troca cancelada."
  }
  if ([string]$Ready.proxyId -eq $NewProxyId) {
    return [int]$Ready.port
  }
  if ([string]$Ready.proxyId -ne $OldProxyId) {
    throw "O proxy da ponte mudou durante a troca; nenhum novo proxy consumido."
  }
  $Body = @{
    proxyId=$NewProxyId; host=[string]$Proxy.host; port=[int]$Proxy.port
    username=[string]$Proxy.username; password=[string]$Proxy.password
  } | ConvertTo-Json -Compress
  $Request = [System.Net.HttpWebRequest][System.Net.WebRequest]::Create(
    "http://127.0.0.1:$([int]$Ready.controlPort)/rotate"
  )
  $Request.Method = "POST"
  $Request.Proxy = [System.Net.GlobalProxySelection]::GetEmptyWebProxy()
  $Request.ContentType = "application/json"
  $Request.Headers.Add("Authorization",("Bearer " + [string]$Ready.controlSecret))
  $Request.Timeout = 15000
  $Request.ReadWriteTimeout = 15000
  $Payload = [System.Text.Encoding]::UTF8.GetBytes($Body)
  $Request.ContentLength = $Payload.Length
  $Stream = $Request.GetRequestStream()
  try { $Stream.Write($Payload,0,$Payload.Length) }
  finally { $Stream.Dispose() }
  $Response = $Request.GetResponse()
  try {
    $Reader = New-Object System.IO.StreamReader($Response.GetResponseStream())
    try { $Accepted = $Reader.ReadToEnd() | ConvertFrom-Json }
    finally { $Reader.Dispose() }
  } finally { $Response.Dispose() }
  if (!$Accepted.accepted -or [string]$Accepted.proxyId -ne $NewProxyId -or
      [int]$Accepted.port -ne [int]$Ready.port) {
    throw "Ponte nao confirmou troca do proxy; Android preservado."
  }
  Write-H2Status ("SOCKS5 trocado sem fechar Android; proxy #" + $NewProxyId)
  return [int]$Ready.port
}
function Wait-Boot([string]$Adb,[string]$Name,[int]$TimeoutSeconds=180) {
  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $Deadline) {
    $Serial = Adb-Serial $Adb $Name
    if ($Serial) {
      $Booted = @(Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","getprop","sys.boot_completed"))
      if (($Booted | Out-String).Trim() -eq "1") { return $Serial }
    }
    Start-Sleep -Seconds 3
  }
  throw "Emulador não ficou pronto em $TimeoutSeconds segundos."
}
# A dedicated, persistent local relay per Android instance. The ready file
# contains only process metadata and proxy ID, never SOCKS5 credentials.
function Get-H2RelayReadyFile([string]$Name) {
  $RelayDir = Join-Path $Base "relays"
  if (!(Test-Path -LiteralPath $RelayDir)) { New-Item -Path $RelayDir -ItemType Directory -Force | Out-Null }
  return (Join-Path $RelayDir ($Name + ".json"))
}
function Test-H2RelayProcess {
  param([int]$ProcessId,[string]$Name)
  if ($ProcessId -le 0) { return $false }
  try {
    $P = Get-CimInstance -ClassName Win32_Process -Filter ("ProcessId=" + $ProcessId) -ErrorAction Stop
    if (!$P) { return $false }
    $CommandLine = [string]$P.CommandLine
    return ($CommandLine -match '(?i)H2AndroidSocksRelay\.mjs' -and
      $CommandLine -match ('(?i)--h2-instance\s+' + [regex]::Escape($Name) + '(?:\s|$)'))
  } catch { return $false }
}
function Test-H2RelayPort {
  param([int]$Port)
  if ($Port -lt 1 -or $Port -gt 65535) { return $false }
  $Client = New-Object System.Net.Sockets.TcpClient
  try {
    $Task = $Client.ConnectAsync("127.0.0.1", $Port)
    if (!$Task.Wait(1000)) { return $false }
    return $Client.Connected
  } catch { return $false }
  finally { $Client.Dispose() }
}
function Stop-H2SocksRelay {
  param([string]$Name)
  $ReadyFile = Get-H2RelayReadyFile $Name
  if (!(Test-Path -LiteralPath $ReadyFile)) { return }
  try {
    $Ready = Get-Content -LiteralPath $ReadyFile -Raw | ConvertFrom-Json
    $PidValue = [int]$Ready.pid
    if (Test-H2RelayProcess -ProcessId $PidValue -Name $Name) {
      Stop-Process -Id $PidValue -Force -ErrorAction Stop
    }
  } catch {
    Write-H2Status ("Falha ao encerrar a ponte SOCKS5 do Android: " + $Name)
  }
  Remove-Item -LiteralPath $ReadyFile -Force -ErrorAction SilentlyContinue
}
function Start-H2SocksRelay {
  param([object]$Proxy,[string]$Name,[string]$ProxyId)
  if (!$Proxy -or $Proxy.protocol -ne "socks5") { throw "O proxy desta instancia precisa ser SOCKS5." }
  if ($ProxyId -notmatch '^\d+$') { throw "Identificador de proxy ausente do comando." }
  $ReadyFile = Get-H2RelayReadyFile $Name
  if (Test-Path -LiteralPath $ReadyFile) {
    try {
      $Ready = Get-Content -LiteralPath $ReadyFile -Raw | ConvertFrom-Json
      if ([string]$Ready.proxyId -eq $ProxyId -and
          (Test-H2RelayProcess -ProcessId ([int]$Ready.pid) -Name $Name) -and
          (Test-H2RelayPort -Port ([int]$Ready.port))) {
        Write-H2Status ("Ponte SOCKS5 existente reutilizada para " + $Name)
        return [int]$Ready.port
      }
    } catch {}
    Stop-H2SocksRelay -Name $Name
  }
  $RelayScript = Join-Path $Base "H2AndroidSocksRelay.mjs"
  if (!(Test-Path -LiteralPath $RelayScript)) { throw "Ponte SOCKS5 ausente. Atualize o agente Windows." }
  $NodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if (!$NodeCommand) { throw "Node.js nao foi encontrado no Windows para o proxy SOCKS5." }
  $Info = New-Object System.Diagnostics.ProcessStartInfo
  $Info.FileName = $NodeCommand.Source
  $Info.Arguments = '"' + $RelayScript + '" --h2-instance ' + $Name
  $Info.WorkingDirectory = $Base
  $Info.UseShellExecute = $false
  $Info.CreateNoWindow = $true
  $Info.EnvironmentVariables["H2_SOCKS_HOST"] = [string]$Proxy.host
  $Info.EnvironmentVariables["H2_SOCKS_PORT"] = [string]$Proxy.port
  $Info.EnvironmentVariables["H2_SOCKS_USER"] = [string]$Proxy.username
  $Info.EnvironmentVariables["H2_SOCKS_PASSWORD"] = [string]$Proxy.password
  $Info.EnvironmentVariables["H2_RELAY_READY_FILE"] = $ReadyFile
  $Info.EnvironmentVariables["H2_RELAY_PROXY_ID"] = $ProxyId
  $Process = New-Object System.Diagnostics.Process
  $Process.StartInfo = $Info
  try {
    if (!$Process.Start()) { throw "Ponte SOCKS5 local nao iniciou." }
    $Deadline = (Get-Date).AddSeconds(12)
    while ((Get-Date) -lt $Deadline) {
      Start-Sleep -Milliseconds 200
      $Process.Refresh()
      if ($Process.HasExited) { throw "Ponte SOCKS5 encerrou antes de conectar (codigo $($Process.ExitCode))." }
      if (!(Test-Path -LiteralPath $ReadyFile)) { continue }
      try {
        $Ready = Get-Content -LiteralPath $ReadyFile -Raw | ConvertFrom-Json
        if ([int]$Ready.pid -eq $Process.Id -and [string]$Ready.proxyId -eq $ProxyId -and
            (Test-H2RelayPort -Port ([int]$Ready.port))) {
          Write-H2Status ("Ponte SOCKS5 pronta: " + $Name)
          return [int]$Ready.port
        }
      } catch {}
    }
    throw "Ponte SOCKS5 nao ficou pronta em 12 segundos; Android preservado."
  } catch {
    try { if (!$Process.HasExited) { $Process.Kill() } } catch {}
    Remove-Item -LiteralPath $ReadyFile -Force -ErrorAction SilentlyContinue
    throw
  } finally { $Process.Dispose() }
}
function Check-Proxy {
  param([object]$Proxy,[string]$Name,[string]$ProxyId)
  $RelayPort = Start-H2SocksRelay -Proxy $Proxy -Name $Name -ProxyId $ProxyId
  $Address = "http://127.0.0.1:$RelayPort"
  # IP must be obtained through the same per-instance SOCKS5 relay used by Android.
  $Reply = Invoke-WebRequest -Uri "https://api.ipify.org?format=json" -Proxy $Address -TimeoutSec 25 -UseBasicParsing
  $Json = $Reply.Content | ConvertFrom-Json
  if ([string]$Json.ip -notmatch '^[0-9a-fA-F:.]+$') { throw "O proxy nao informou um IP valido." }
  Write-H2Status ("IP SOCKS5 validado: " + $Name)
  return @{ ip=[string]$Json.ip; port=$RelayPort }
}
# This helper reports the real avdmanager failure instead of a generic error.
# It changes only the fresh H2_<UUID> AVD and never removes preexisting profiles.
function New-H2NativeAvd {
  param(
    [string]$AvdManager,
    [string]$Name,
    [string]$Image,
    [string]$AvdPath
  )
  $StdErrFile = Join-Path $Base ("avdmanager-" + [guid]::NewGuid().ToString("N") + ".log")
  $OldPreference = $ErrorActionPreference
  $ExitCode = -1
  $StdOutText = ""
  $StdErrText = ""
  try {
    $ErrorActionPreference = "Continue"
    # No fixed Pixel device ID: installed SDK packages vary by release.
    # -p fixes the independent AVD data directory explicitly.
    $StdOutText = ("no" | & $AvdManager create avd -n $Name -k $Image -p $AvdPath -f 2> $StdErrFile | Out-String)
    $ExitCode = $LASTEXITCODE
  } catch {
    $StdErrText = $_.Exception.Message
  } finally {
    $ErrorActionPreference = $OldPreference
    if (Test-Path -LiteralPath $StdErrFile) {
      $StdErrText += " " + (Get-Content -LiteralPath $StdErrFile -Raw -ErrorAction SilentlyContinue)
      Remove-Item -LiteralPath $StdErrFile -Force -ErrorAction SilentlyContinue
    }
  }
  if ($ExitCode -ne 0) {
    $Details = ($StdOutText + " " + $StdErrText).Trim() -replace '[\r\n]+',' | '
    if ($Details.Length -gt 330) { $Details = $Details.Substring(0,330) }
    if (!$Details) { $Details = "Consulte os componentes e permissoes do Android SDK." }
    throw "AVDManager nao criou o Android (codigo $ExitCode): $Details"
  }
  if (!(Test-Path -LiteralPath (Join-Path $AvdPath "config.ini"))) {
    throw "AVDManager terminou sem config.ini na pasta exclusiva da instancia. Verifique permissoes do Windows."
  }
}

# H2-only AVD preferences. No changes to H2ADS, other AVDs or the Windows registry.
function Set-H2Keyboard {
  param([string]$Name)
  $Config = Join-Path (Join-Path $AvdHome "$Name.avd") "config.ini"
  if (!(Test-Path -LiteralPath $Config)) { throw "config.ini da instancia H2 nao encontrado." }
  $Current = Get-Content -LiteralPath $Config -Raw
  if ($Current -match '(?m)^hw\.keyboard\s*=\s*yes\s*$') { return }
  if ($Current -match '(?m)^hw\.keyboard\s*=') {
    $Updated = [regex]::Replace($Current,'(?m)^hw\.keyboard\s*=.*$','hw.keyboard=yes')
  } else {
    $Updated = $Current.TrimEnd() + [Environment]::NewLine + "hw.keyboard=yes" + [Environment]::NewLine
  }
  Set-Content -LiteralPath $Config -Value $Updated -Encoding Ascii -NoNewline
}
# Prevent a command-console window without hiding the actual Android GUI.
# Detect only the H2-owned AVD by its exact command-line -avd argument.
# ADB can temporarily report no device while the emulator process is booting.
# Single-instance lifecycle for H2-owned Android AVDs. Never create a second
# emulator process as a fallback. A VM must boot once and be diagnosed from its
# own stdout/stderr when that attempt fails.
function Get-H2EmulatorProcesses {
  param([string]$Name)
  $NamePattern = [regex]::Escape($Name)
  # PowerShell single-quoted strings use ONE backslash for regex whitespace.
  $Pattern = '(?i)(?:^|\s)-avd\s+"?' + $NamePattern + '"?(?=\s|$)'
  $DataPathPattern = '(?i)(?:^|[\\/])' + $NamePattern + '\.avd(?:[\\/]|$)'
  try {
    $Processes = @(Get-CimInstance -ClassName Win32_Process -Filter "Name='emulator.exe' OR Name='qemu-system-x86_64.exe'" -ErrorAction Stop)
    return @($Processes | Where-Object {
      $Cmd = [string]$_.CommandLine
      $Cmd -match $Pattern -or $Cmd -match $DataPathPattern
    })
  } catch {
    throw "Nao foi possivel verificar processos Android no Windows; inicio bloqueado para evitar duplicacao."
  }
}
function Test-H2EmulatorProcess {
  param([string]$Name)
  return (@(Get-H2EmulatorProcesses -Name $Name).Count -gt 0)
}
# Explicit test rebuild can recover a stopped/stuck AVD process even if the
# web status is 'error'. Only exact processes owned by this named AVD are touched.
function Stop-H2OwnedEmulatorForRebuild {
  param([string]$Adb,[string]$Name,[string]$Serial)
  $Before = @(Get-H2EmulatorProcesses -Name $Name)
  if (!$Serial -and !$Before.Count) { return }
  if ($Serial) {
    Write-H2Status ("Encerrando AVD por ADB para recriacao: " + $Name)
    try {
      Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"emu","kill") | Out-Null
    } catch {
      Write-H2Status ("Comando ADB de encerramento nao respondeu; verificando processo do proprio AVD: " + $Name)
    }
  }
  $Deadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $Deadline) {
    if (!(Test-H2EmulatorProcess -Name $Name)) { return }
    Start-Sleep -Seconds 1
  }
  # An orphaned emulator must not block explicit reconstruction forever.
  # Recheck AVD identity and process creation time immediately before killing.
  $Remaining = @(Get-H2EmulatorProcesses -Name $Name)
  if ($Remaining.Count -gt 8) {
    throw "Quantidade inesperada de processos Android; encerramento automatico bloqueado."
  }
  foreach ($Owned in $Remaining) {
    $ProcessId = [int]$Owned.ProcessId
    $Verified = @(Get-H2EmulatorProcesses -Name $Name | Where-Object {
      [int]$_.ProcessId -eq $ProcessId -and
      [string]$_.CreationDate -eq [string]$Owned.CreationDate
    })
    if (!$Verified.Count) { continue }
    try {
      Stop-Process -Id $ProcessId -Force -ErrorAction Stop
      Write-H2Status ("Processo preso encerrado somente no AVD " + $Name + "; PID " + $ProcessId)
    } catch {
      # The process may have ended between lookup and termination.
      if (@(Get-H2EmulatorProcesses -Name $Name | Where-Object {
        [int]$_.ProcessId -eq $ProcessId
      }).Count -gt 0) {
        throw ("Falha ao encerrar processo do Android de teste PID " + $ProcessId + ": " + $_.Exception.Message)
      }
    }
  }
  $Deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $Deadline) {
    if (!(Test-H2EmulatorProcess -Name $Name)) { return }
    Start-Sleep -Seconds 1
  }
  throw "Processo do proprio AVD continua ativo. Nao recriei nem apaguei dados para evitar conflito."
}
function Get-H2EmulatorDiagnostic {
  param([string]$ErrorLog,[string]$OutputLog)
  $Lines = @()
  foreach ($File in @($ErrorLog,$OutputLog)) {
    if (Test-Path -LiteralPath $File) {
      $Lines += @(Get-Content -LiteralPath $File -Tail 500 -ErrorAction SilentlyContinue)
    }
  }
  $Relevant = @($Lines | Where-Object {
    $_ -and $_ -match '(?i)(FATAL|PANIC|ERROR|failed|failure|unsupported|cannot|unable|requires|missing|hypervisor|WHPX|virtualization|acceleration|not available|not found|invalid|permission denied)' -and
    $_ -notmatch '(?i)DEBUG\s*\|?\s*qemu backend|Concatenated backend parameters|argv\[[0-9]+\]'
  } | Select-Object -Last 3)
  if (!$Relevant.Count) {
    $Relevant = @($Lines | Where-Object {
      $_ -and $_.Trim() -and $_ -notmatch '(?i)^\s*DEBUG\b|Concatenated backend parameters|argv\[[0-9]+\]'
    } | Select-Object -Last 3)
  }
  $Text = (($Relevant | ForEach-Object { $_.Trim() }) -join " | ").Trim()
  if (!$Text) { $Text = "Emulador encerrou sem diagnostico; consulte o log local." }
  $Text = $Text -replace '(?i)https?://[^\s|]+','[URL ocultada]'
  if ($Text.Length -gt 300) { $Text = $Text.Substring(0,300) }
  return $Text
}
function Start-H2Emulator {
  param([string]$Emulator,[string]$Sdk,[string]$Name,[string]$ProxyUri)
  if ($Name -notmatch '^H2_[a-fA-F0-9]{32}$') { throw "Nome de AVD invalido." }
  # Named mutex prevents separate agents racing on the same AVD.
  $Mutex = [System.Threading.Mutex]::new($false,("Local\H2AndroidStart_" + $Name))
  $Locked = $false
  try {
    try { $Locked = $Mutex.WaitOne(20000) }
    catch [System.Threading.AbandonedMutexException] { $Locked = $true }
    if (!$Locked) { throw "Outra inicializacao deste Android em andamento; processo duplicado bloqueado." }
    if (Test-H2EmulatorProcess -Name $Name) {
      Write-H2Status ("Android ja esta aberto ou inicializando: " + $Name)
      return
    }
    $LogId = "emulator-" + $Name + "-" + [guid]::NewGuid().ToString("N")
    $OutLog = Join-Path $Base ($LogId + ".stdout.log")
    $ErrLog = Join-Path $Base ($LogId + ".stderr.log")
    $Arguments = ('-avd "' + $Name + '" -http-proxy "' + $ProxyUri + '" -no-boot-anim -verbose')
    # Redirect directly to disk; prevent stderr/stdout pipe deadlocks.
    $Proc = Start-Process -FilePath $Emulator -ArgumentList $Arguments -WorkingDirectory (Join-Path $Sdk "emulator") -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog -WindowStyle Normal -PassThru -ErrorAction Stop
    try {
      Start-Sleep -Seconds 5
      $Proc.Refresh()
      if (!$Proc.HasExited) {
        Write-H2Status ("Processo Android iniciado uma unica vez: " + $Name)
        return
      }
      [void]$Proc.WaitForExit(2000)
      $Proc.Refresh()
      if (Test-H2EmulatorProcess -Name $Name) {
        # Emulator launcher may exit after spawning its QEMU child.
        # Never start a second copy or report an error while child is alive.
        Write-H2Status ("Android iniciou via processo filho: " + $Name)
        return
      }
      $Code = [string]$Proc.ExitCode
      $Details = Get-H2EmulatorDiagnostic -ErrorLog $ErrLog -OutputLog $OutLog
      Write-H2Status ("Falha Android " + $Name + "; codigo " + $Code + ". Log: " + $ErrLog)
      throw ("Android nao iniciou (codigo " + $Code + "). " + $Details + ". Log local: " + $ErrLog)
    } finally { $Proc.Dispose() }
  } finally {
    if ($Locked) { $Mutex.ReleaseMutex() }
    $Mutex.Dispose()
  }
}
# Google Play Android 15 is a production-style system image: adb shell cannot
# reliably change global locale with setprop or am update-config. Instead automate
# the standard Android Language Settings UI with accessibility XML and ADB input.
# This does not need root, reset userdata, install an APK, or touch any other AVD.
function Test-H2ActiveLocale {
  param([string]$Adb,[string]$Serial)
  try {
    $Config = (@(Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","am","get-config")) | Out-String)
    $Primary = [regex]::Match($Config,'(?i)-(?<language>[a-z]{2,3})-r(?<region>[a-z]{2})(?=[^a-z]|$)')
    if ($Primary.Success) {
      return ($Primary.Groups["language"].Value -ieq "pt" -and $Primary.Groups["region"].Value -ieq "BR")
    }
    $UserLocales = (@(Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","settings","get","system","system_locales")) | Out-String).Trim()
    return ($UserLocales -match '^(?i:pt[-_]BR)(?:,|$)')
  } catch { return $false }
}
function Get-H2LanguageUi {
  param([string]$Adb,[string]$Serial)
  [void](Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","uiautomator","dump","/sdcard/h2-language-layout.xml"))
  $XmlText = (@(Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","cat","/sdcard/h2-language-layout.xml")) | Out-String).Trim()
  $Doc = New-Object System.Xml.XmlDocument
  $Doc.LoadXml($XmlText)
  foreach ($Element in $Doc.SelectNodes("//node")) {
    $B = [regex]::Match($Element.GetAttribute("bounds"),'^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$')
    if (!$B.Success) { continue }
    $X1 = [int]$B.Groups[1].Value
    $Y1 = [int]$B.Groups[2].Value
    $X2 = [int]$B.Groups[3].Value
    $Y2 = [int]$B.Groups[4].Value
    if ($X2 -le $X1 -or $Y2 -le $Y1) { continue }
    [pscustomobject]@{
      Text = [string]$Element.GetAttribute("text")
      Description = [string]$Element.GetAttribute("content-desc")
      X1=$X1;Y1=$Y1;X2=$X2;Y2=$Y2
      X=[int](($X1+$X2)/2);Y=[int](($Y1+$Y2)/2)
    }
  }
}
function Find-H2LanguageUi {
  param([object[]]$Nodes,[string[]]$Patterns)
  foreach ($Pattern in $Patterns) {
    $Found = $Nodes | Where-Object {
      $_.Text -match $Pattern -or $_.Description -match $Pattern
    } | Sort-Object Y | Select-Object -First 1
    if ($Found) { return $Found }
  }
  return $null
}
function Tap-H2LanguageUi {
  param([string]$Adb,[string]$Serial,[object]$Node)
  Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","input","tap",([string]$Node.X),([string]$Node.Y)) | Out-Null
  Start-Sleep -Milliseconds 850
}
function Set-H2LocaleFromSettings {
  param([string]$Adb,[string]$Serial)
  Write-H2Status "Abrindo configuracoes oficiais de idioma Android"
  Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","am","start","-a","android.settings.LOCALE_SETTINGS") | Out-Null
  Start-Sleep -Seconds 2
  $PickRegion = $false
  $ScrollCount = 0
  for ($Step = 0; $Step -lt 24; $Step++) {
    if (Test-H2ActiveLocale -Adb $Adb -Serial $Serial) { return $true }
    try { $Nodes = @(Get-H2LanguageUi -Adb $Adb -Serial $Serial) }
    catch {
      if ($Step -ge 4) { break }
      Start-Sleep -Seconds 2
      continue
    }
    # Restrict touches to Android Settings language screens.
    $Windows = (@(Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","dumpsys","window","windows")) | Out-String)
    $Focus = [regex]::Match($Windows,'(?m)^\s*(?:mCurrentFocus|mFocusedApp)=[^\r\n]+').Value
    if ($Focus -notmatch 'com\.android\.settings') {
      Write-H2Status "A tela de idiomas nao esta em primeiro plano; nenhuma interacao foi enviada"
      break
    }
    $PortugueseBR = Find-H2LanguageUi -Nodes $Nodes -Patterns @('(?i)^Portugu.s\s*\(Brasil\)$','(?i)^Portuguese\s*\(Brazil\)$')
    $English = Find-H2LanguageUi -Nodes $Nodes -Patterns @('(?i)^English\s*\(United States\)$','(?i)^English\s*\(US\)$')
    $Add = Find-H2LanguageUi -Nodes $Nodes -Patterns @('(?i)^Add a language$','(?i)^Add language$','(?i)^Adicionar um idioma$','(?i)^Adicionar idioma$')
    $Confirm = Find-H2LanguageUi -Nodes $Nodes -Patterns @('(?i)^Set as default$','(?i)^Set as primary$','(?i)^Definir como padr.o$','(?i)^Definir como principal$')
    if ($Confirm) {
      Tap-H2LanguageUi -Adb $Adb -Serial $Serial -Node $Confirm
      Start-Sleep -Seconds 2
      continue
    }
    if ($PortugueseBR -and $English -and $PortugueseBR.Y -gt $English.Y) {
      # Android 14/15 requires dragging the selected language to first place.
      $X = [string]($PortugueseBR.X2 - 15)
      $TargetY = [string]([math]::Max(85,$English.Y - 25))
      Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","input","swipe",$X,([string]$PortugueseBR.Y),$X,$TargetY,"1100") | Out-Null
      Start-Sleep -Seconds 2
      continue
    }
    if ($PortugueseBR -and !$Add -and !$English) {
      Tap-H2LanguageUi -Adb $Adb -Serial $Serial -Node $PortugueseBR
      Start-Sleep -Milliseconds 600
      continue
    }
    if ($PickRegion) {
      $Brazil = Find-H2LanguageUi -Nodes $Nodes -Patterns @('(?i)^Brasil$','(?i)^Brazil$')
      if ($Brazil) {
        Tap-H2LanguageUi -Adb $Adb -Serial $Serial -Node $Brazil
        $PickRegion = $false
        continue
      }
    }
    if ($Add) {
      Tap-H2LanguageUi -Adb $Adb -Serial $Serial -Node $Add
      $ScrollCount = 0
      continue
    }
    $SystemLanguages = Find-H2LanguageUi -Nodes $Nodes -Patterns @('(?i)^System languages$','(?i)^Preferred language$','(?i)^Idiomas do sistema$','(?i)^Idioma preferido$')
    if ($SystemLanguages) {
      Tap-H2LanguageUi -Adb $Adb -Serial $Serial -Node $SystemLanguages
      continue
    }
    $Portuguese = Find-H2LanguageUi -Nodes $Nodes -Patterns @('(?i)^Portugu.s$','(?i)^Portuguese$')
    if ($Portuguese) {
      Tap-H2LanguageUi -Adb $Adb -Serial $Serial -Node $Portuguese
      $PickRegion = $true
      continue
    }
    $Languages = Find-H2LanguageUi -Nodes $Nodes -Patterns @('(?i)^Languages$','(?i)^Languages & input$','(?i)^Language & region$','(?i)^Idiomas$','(?i)^Idioma e regi.o$')
    if ($Languages) {
      Tap-H2LanguageUi -Adb $Adb -Serial $Serial -Node $Languages
      continue
    }
    if ($ScrollCount -ge 9) { break }
    # Use the actual emulator screen size, never fixed display coordinates.
    $SizeText = (@(Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","wm","size")) | Out-String)
    $Match = [regex]::Match($SizeText,'(\d+)x(\d+)')
    if (!$Match.Success) { break }
    $W=[int]$Match.Groups[1].Value; $H=[int]$Match.Groups[2].Value
    if ($W -lt 240 -or $H -lt 480) { break }
    $M=[string]([int]($W/2)); $StartY=[string]([int]($H*0.78)); $EndY=[string]([int]($H*0.32))
    Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","input","swipe",$M,$StartY,$M,$EndY,"380") | Out-Null
    $ScrollCount++
    Start-Sleep -Milliseconds 650
  }
  return (Test-H2ActiveLocale -Adb $Adb -Serial $Serial)
}
function Set-H2Locale {
  param([string]$Adb,[string]$Name,[string]$Serial,[bool]$UseSettings=$false)
  if (Test-H2ActiveLocale -Adb $Adb -Serial $Serial) { return $true }
  if (!$UseSettings) { return $false }
  try { return (Set-H2LocaleFromSettings -Adb $Adb -Serial $Serial) }
  catch {
    Write-H2Status ("Configuracao de idioma interrompida: " + $_.Exception.GetType().Name)
    return $false
  }
}

# Avoid incompatible Pixel skins: a skin may exist on disk but be designed
# for a different display size, causing cropped edges and black sidebars.
# Keep the emulator's native, correctly scaled display; Windows rounds its frame.
# Only H2-owned AVD config.ini is edited. Never restart, reset, or change proxy.
function Set-H2DeviceSkin {
  param([string]$Name,[string]$Sdk)
  $Cfg = Join-Path (Join-Path $AvdHome "$Name.avd") "config.ini"
  if (!(Test-Path -LiteralPath $Cfg)) { return }
  $Text = Get-Content -LiteralPath $Cfg -Raw
  $Pairs = @{
    "showDeviceFrame" = "no"
    "skin.dynamic" = "no"
    "skin.name" = "_no_skin"
    "skin.path" = "_no_skin"
  }
  $Changed = $false
  foreach ($Key in $Pairs.Keys) {
    $Line = $Key + "=" + $Pairs[$Key]
    $Regex = '(?m)^' + [regex]::Escape($Key) + '\s*=.*$'
    if ($Text -match $Regex) {
      $Next = [regex]::Replace($Text,$Regex,$Line)
      if ($Next -ne $Text) { $Changed = $true }
      $Text = $Next
    } else {
      $Text = $Text.TrimEnd() + [Environment]::NewLine + $Line + [Environment]::NewLine
      $Changed = $true
    }
  }
  if ($Changed) {
    Set-Content -LiteralPath $Cfg -Value $Text -Encoding Ascii -NoNewline
    Write-H2Status "Skin Pixel incompatível desativada. O Android mantém a tela nativa; mudança na moldura ao reabrir a instância."
  }
}
# Correct a landscape Android display at runtime, without restarting the emulator.
# Read the real display first; do not stretch or rotate an existing portrait screen.
function Set-H2PortraitDisplay {
  param([string]$Adb,[string]$Serial)
  $RawSize = (@(Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","wm","size")) | Out-String)
  $Found = [regex]::Match($RawSize,'(?m)(?:Physical|Override) size:\s*(\d+)x(\d+)')
  if (!$Found.Success) {
    Write-H2Status "Dimensoes da tela indisponiveis; visual preservado sem alterar resolucao"
    return
  }
  $Width = [int]$Found.Groups[1].Value
  $Height = [int]$Found.Groups[2].Value
  if ($Width -le $Height) {
    Write-H2Status ("Tela vertical preservada: " + $Width + "x" + $Height)
    return
  }
  # 720x1280 is a portrait Android display; Android keeps touch mapping internally.
  try {
    Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","wm","size","720x1280") | Out-Null
    $Check = (@(Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","wm","size")) | Out-String)
    if ($Check -notmatch '720x1280') { throw "Android nao confirmou a tela vertical" }
    Write-H2Status "Tela vertical Android 720x1280 confirmada, sem reiniciar a instancia"
  } catch {
    # Restore the previous display override or physical dimensions if correction failed.
    try { Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","wm","size","reset") | Out-Null } catch {}
    throw "Nao foi possivel corrigir a orientacao do Android sem alterar a instancia: $($_.Exception.Message)"
  }
}
# Increase Android density only on a small portrait screen. This does not
# restart Android, erase userdata, change AVD identity, or change the proxy.
function Set-H2ReadableDensity {
  param([string]$Adb,[string]$Serial)
  $SizeOutput = (@(Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","wm","size")) | Out-String)
  $OverrideSize = [regex]::Match($SizeOutput,'(?im)^Override size:\s*(\d+)x(\d+)')
  $PhysicalSize = [regex]::Match($SizeOutput,'(?im)^Physical size:\s*(\d+)x(\d+)')
  $SizeMatch = if ($OverrideSize.Success) { $OverrideSize } else { $PhysicalSize }
  if (!$SizeMatch.Success) {
    Write-H2Status "Densidade preservada: dimensoes indisponiveis"
    return
  }
  $Width = [int]$SizeMatch.Groups[1].Value
  $Height = [int]$SizeMatch.Groups[2].Value
  if ($Width -gt $Height -or $Width -lt 650 -or $Width -gt 800) {
    Write-H2Status "Densidade preservada: tela fora do perfil vertical 720px"
    return
  }
  $Raw = (@(Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","wm","density")) | Out-String)
  $Override = [regex]::Match($Raw,'(?im)^Override density:\s*(\d+)')
  $Physical = [regex]::Match($Raw,'(?im)^Physical density:\s*(\d+)')
  $Actual = if ($Override.Success) { [int]$Override.Groups[1].Value } elseif ($Physical.Success) { [int]$Physical.Groups[1].Value } else { 0 }
  if ($Actual -ge 320) {
    Write-H2Status ("Fonte e icones preservados: " + $Actual + " dpi")
    return
  }
  Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","wm","density","320") | Out-Null
  $Verified = (@(Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","wm","density")) | Out-String)
  if ($Verified -notmatch '(?im)^Override density:\s*320\s*$') {
    throw "O Android nao confirmou o ajuste de densidade para 320 dpi."
  }
  Write-H2Status "Fonte e icones ampliados no Android: 320 dpi"
}
# Use Android's bottom navigation buttons rather than the emulator's side controls.
function Set-H2BottomNavigation {
  param([string]$Adb,[string]$Serial)
  $Overlay = "com.android.internal.systemui.navbar.threebutton"
  Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"shell","cmd","overlay","enable","--user","0",$Overlay) | Out-Null
}
# Windows 11 rounded window corners (DWM): cosmetic, Android remains interactive.
function Set-H2RoundedWindow {
  param([string]$Name)
  try {
    if (-not ("H2WindowCorners" -as [type])) {
      Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class H2WindowCorners {
  public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lparam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lparam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int maxCount);
  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
  public static int RoundEmulator(string name) {
    int changed = 0;
    EnumWindows((hwnd, lparam) => {
      var sb = new StringBuilder(512);
      GetWindowText(hwnd, sb, sb.Capacity);
      if (sb.ToString().StartsWith("Android Emulator - " + name, StringComparison.OrdinalIgnoreCase)) {
        int preference = 2;
        if (DwmSetWindowAttribute(hwnd, 33, ref preference, sizeof(int)) == 0) changed++;
      }
      return true;
    }, IntPtr.Zero);
    return changed;
  }
}
'@
    }
    [void][H2WindowCorners]::RoundEmulator($Name)
  } catch {
    Write-H2Status "Moldura arredondada nao suportada pelo Windows"
  }
}
function Set-H2Presentation {
  param([string]$Adb,[string]$Name,[string]$Serial,[string]$Sdk,[bool]$Strict=$false,[bool]$Fresh=$false)
  Set-H2Keyboard -Name $Name
  Set-H2DeviceSkin -Name $Name -Sdk $Sdk
  Set-H2PortraitDisplay -Adb $Adb -Serial $Serial
  Set-H2ReadableDensity -Adb $Adb -Serial $Serial
  Set-H2RoundedWindow -Name $Name
  $NavError = $null
  try { Set-H2BottomNavigation -Adb $Adb -Serial $Serial }
  catch { $NavError = $_.Exception.Message }
  $LocaleSet = Set-H2Locale -Adb $Adb -Name $Name -Serial $Serial -UseSettings ($Strict -or $Fresh)
  if ($Strict -and !$LocaleSet) { throw "O Android nao confirmou Portugues (Brasil). A tela Configuracoes > Sistema > Idiomas foi aberta para ajuste. Instancia e proxy preservados." }
  if ($Strict -and $NavError) { throw ("Barra inferior nao suportada nesta imagem Android: " + $NavError) }
  if (!$LocaleSet) { Write-H2Status "Idioma pt-BR nao confirmado nesta imagem Google Play" }
}


function Run-Job([object]$Job,[string]$Sdk) {
  if ($Job.action -in @("create","rebuild","delete")) { Set-H2AndroidJava }
  $Name = Avd-Name ([string]$Job.profileId)
  $Adb = Join-Path $Sdk "platform-tools\adb.exe"
  $Emulator = Join-Path $Sdk "emulator\emulator.exe"
  $AvdManager = Join-Path $Sdk "cmdline-tools\latest\bin\avdmanager.bat"
  $Image = "system-images;android-35;google_apis_playstore;x86_64"
  $ProxyIp = $null
  $RelayPort = $null
  if ($Job.action -in @("create","rebuild","start")) {
    $ProxyCheck = Check-Proxy -Proxy $Job.proxy -Name $Name -ProxyId ([string]$Job.proxyId)
    $ProxyIp = [string]$ProxyCheck.ip
    $RelayPort = [int]$ProxyCheck.port
  }
  $Serial = Adb-Serial $Adb $Name
  if ($Job.action -eq "rebuild") {
    # User explicitly opted for a fresh test: remove ONLY the error-state
    # instance's own AVD. Never delete proxies or other AVDs.
    Stop-H2OwnedEmulatorForRebuild -Adb $Adb -Name $Name -Serial $Serial
    # The AVD is now stopped; release only its own relay for a clean reconnect.
    Stop-H2SocksRelay -Name $Name
    $ProxyCheck = Check-Proxy -Proxy $Job.proxy -Name $Name -ProxyId ([string]$Job.proxyId)
    $ProxyIp = [string]$ProxyCheck.ip
    $RelayPort = [int]$ProxyCheck.port
    $Serial = $null
    $OldAvd = Join-Path $AvdHome "$Name.avd"
    if (Test-Path -LiteralPath $OldAvd) {
      $OldPreference = $ErrorActionPreference
      try {
        $ErrorActionPreference = "SilentlyContinue"
        & $AvdManager delete avd -n $Name 2>$null | Out-Null
        $DeleteExitCode = $LASTEXITCODE
      } finally { $ErrorActionPreference = $OldPreference }
      if ($DeleteExitCode -ne 0 -or (Test-Path -LiteralPath $OldAvd)) {
        throw "Nao foi possivel limpar o AVD de teste com seguranca; nenhum proxy foi alterado."
      }
      Write-H2Status ("AVD de teste removido para recriacao: " + $Name)
    }
    $OldIni = Join-Path $AvdHome "$Name.ini"
    if (Test-Path -LiteralPath $OldIni) {
      Remove-Item -LiteralPath $OldIni -Force
    }
  }
  $EffectiveAction = if ($Job.action -eq "rebuild") { "create" } else { [string]$Job.action }
  switch ($EffectiveAction) {
    "create" {
      $AvdPath = Join-Path $AvdHome "$Name.avd"
      if (!(Test-Path -LiteralPath $AvdPath)) {
        # No clone: create an AVD with a unique writable userdata directory.
        $PackageDir = Join-Path $Sdk "system-images\android-35\google_apis_playstore\x86_64"
        if (!(Test-Path -LiteralPath $PackageDir)) {
          throw "Imagem Play Store Android 35 x86_64 ausente no SDK. Instale a imagem antes de repetir."
        }
        New-H2NativeAvd -AvdManager $AvdManager -Name $Name -Image $Image -AvdPath $AvdPath
      } elseif (!(Test-Path -LiteralPath (Join-Path $AvdPath "config.ini"))) {
        # Do not overwrite/delete partial data automatically.
        throw "Pasta parcial do teste1 encontrada sem config.ini. O agente preservou os dados; verifique o SDK."
      }
      if (!$Serial) {
        # The Emulator only receives the loopback HTTP endpoint. SOCKS5 credentials
        # remain inside the local relay and never appear in the Emulator arguments.
        $Uri = "http://127.0.0.1:$RelayPort"
        Set-H2Keyboard -Name $Name
        Start-H2Emulator -Emulator $Emulator -Sdk $Sdk -Name $Name -ProxyUri $Uri
      }
      $BootSerial = Wait-Boot $Adb $Name
      $AndroidIp = Assert-H2AndroidProxyOrStop -Adb $Adb -Serial $BootSerial -RelayPort $RelayPort
      Set-H2Presentation -Adb $Adb -Name $Name -Serial $BootSerial -Sdk $Sdk -Fresh $true
      return $AndroidIp
    }
    "start" {
      if (!(Test-Path (Join-Path $AvdHome "$Name.avd"))) { throw "Este Android não está instalado no computador." }
      if (!$Serial) {
        $Uri = "http://127.0.0.1:$RelayPort"
        Set-H2Keyboard -Name $Name
        Start-H2Emulator -Emulator $Emulator -Sdk $Sdk -Name $Name -ProxyUri $Uri
      }
      $BootSerial = Wait-Boot $Adb $Name
      $AndroidIp = Assert-H2AndroidProxyOrStop -Adb $Adb -Serial $BootSerial -RelayPort $RelayPort
      Set-H2Presentation -Adb $Adb -Name $Name -Serial $BootSerial -Sdk $Sdk
      return $AndroidIp
    }
    "rotate" {
      if (!$Serial -or !(Test-H2EmulatorProcess -Name $Name)) {
        throw "O Android nao esta aberto; a troca ao vivo foi cancelada."
      }
      # Pre-flight the candidate separately, while the original relay and
      # Android remain untouched. A bad candidate never consumes the old proxy.
      $Candidate = $Name + "_probe"
      try {
        $CandidateCheck = Check-Proxy -Proxy $Job.proxy -Name $Candidate -ProxyId ([string]$Job.proxyId)
        $PreviousReady = Get-Content -LiteralPath (Get-H2RelayReadyFile -Name $Name) -Raw | ConvertFrom-Json
        $OldProxyId = [string]$PreviousReady.proxyId
        $LivePort = Switch-H2RelayUpstream -Name $Name -OldProxyId $OldProxyId -NewProxyId ([string]$Job.proxyId) -Proxy $Job.proxy
        # Revalidate with a TCP request from inside Android using the SAME
        # emulator and the SAME listener port, without rebooting the AVD.
        $AndroidIp = Test-H2AndroidTcpIp -Adb $Adb -Serial $Serial
        Write-H2Status ("Novo IP Android apos troca: " + $AndroidIp)
        return $AndroidIp
      } finally {
        Stop-H2SocksRelay -Name $Candidate
      }
    }
    "configure" {
      if (!$Serial) { throw "Abra a instancia antes de ajustar idioma e visual." }
      Set-H2Presentation -Adb $Adb -Name $Name -Serial $Serial -Sdk $Sdk -Strict $true
      return $null
    }
    "stop" {
      if ($Serial) {
        Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"emu","kill") | Out-Null
        $Deadline = (Get-Date).AddSeconds(45)
        while ((Get-Date) -lt $Deadline -and (Adb-Serial $Adb $Name)) { Start-Sleep -Seconds 2 }
        if (Adb-Serial $Adb $Name) { throw "Android continua aberto; não foi possível confirmar parada." }
      }
      if (Test-H2EmulatorProcess -Name $Name) { throw "O processo Android ainda esta aberto; proxy mantido." }
      Stop-H2SocksRelay -Name $Name
      return $null
    }
    "delete" {
      if ($Serial) {
        Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"emu","kill") | Out-Null
        $Deadline = (Get-Date).AddSeconds(45)
        while ((Get-Date) -lt $Deadline -and (Adb-Serial $Adb $Name)) { Start-Sleep -Seconds 2 }
        if (Adb-Serial $Adb $Name) { throw "Android ainda aberto. Exclusão bloqueada." }
      }
      if (Test-H2EmulatorProcess -Name $Name) { throw "O processo Android ainda esta aberto; exclusao bloqueada." }
      if (Test-Path (Join-Path $AvdHome "$Name.avd")) {
        & $AvdManager delete avd -n $Name | Out-Null
        if (Test-Path (Join-Path $AvdHome "$Name.avd")) { throw "Arquivos do Android não foram removidos." }
      }
      $Ini = Join-Path $AvdHome "$Name.ini"
      if (Test-Path $Ini) { Remove-Item -LiteralPath $Ini -Force }
      if (Test-H2EmulatorProcess -Name $Name) { throw "O processo Android ainda esta aberto; proxy mantido." }
      Stop-H2SocksRelay -Name $Name
      return $null
    }
    default { throw "Comando desconhecido." }
  }
}

$LogPath = Join-Path $Base "agent-status.log"
function Write-H2Status([string]$Message) {
  try { Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value ((Get-Date).ToString("s") + " " + $Message) } catch {}
}
function Start-H2JobHeartbeat([string]$HeartbeatServer,[string]$HeartbeatToken,[string]$HeartbeatComputer,[string]$HeartbeatVersion,[long]$HeartbeatJobId) {
  $HeartbeatScript = {
    param($Server,$Token,$ComputerName,$Version,$JobId)
    $Headers = @{ Authorization = "Bearer $Token" }
    $Body = @{ computerName=$ComputerName;version=$Version;jobId=$JobId } | ConvertTo-Json -Compress
    for (;;) {
      try {
        Invoke-RestMethod -Uri ($Server + "/api/h2-android/agent/heartbeat") -Method Post `
          -ContentType "application/json" -Headers $Headers -Body $Body -TimeoutSec 20 -MaximumRedirection 0 | Out-Null
      } catch {}
      Start-Sleep -Seconds 20
    }
  }
  return (Start-Job -ScriptBlock $HeartbeatScript -ArgumentList $HeartbeatServer,$HeartbeatToken,$HeartbeatComputer,$HeartbeatVersion,$HeartbeatJobId)
}
function Stop-H2JobHeartbeat([object]$HeartbeatJob) {
  if (!$HeartbeatJob) { return }
  try { Stop-Job -Job $HeartbeatJob -ErrorAction SilentlyContinue } catch {}
  try { Remove-Job -Job $HeartbeatJob -ErrorAction SilentlyContinue } catch {}
}
Write-H2Status ("START " + $Version)
$Token = Read-Token
if (!$Token) {
  if (!$PairCode) { $PairCode = Read-Host "Digite o código temporário exibido no ADM H2 Android" }
  $Claim = Api "/api/h2-android/agent/claim" @{
    code=$PairCode;computerName=$env:COMPUTERNAME;version=$Version
  }
  $Token = [string]$Claim.token
  if (!$Token) { throw "Pareamento não retornou credencial." }
  Save-Token $Token
  Write-Host "Agente H2 Android pareado com sucesso."
}
Write-Host "H2 Android ${Version}: verificando autenticacao com $Server..."
$Online = $false
while ($true) {
  try {
    # Heartbeat must not depend on the Android SDK being installed. Pair first,
    # then report missing SDK components as a job error, never as "offline".
    $Result = Api "/api/h2-android/agent/next" @{computerName=$env:COMPUTERNAME;version=$Version} $Token
    if (!$Online) { Write-Host "H2 Android: conexao autenticada, agente online."; Write-H2Status "ONLINE"; $Online = $true }
    if ($Result.job) {
      $Job = $Result.job
      Write-Host "Comando $($Job.action) / $($Job.profileId)"
      $Success = $false
      $ErrorText = $null
      $ObservedIp = $null
      $HeartbeatJob = $null
      try {
        $HeartbeatJob = Start-H2JobHeartbeat -HeartbeatServer $Server -HeartbeatToken $Token `
          -HeartbeatComputer $env:COMPUTERNAME -HeartbeatVersion $Version -HeartbeatJobId ([long]$Job.id)
        $Sdk = Android-Sdk
        # One job per AVD across multiple Windows agent processes.
        $JobLockName = "Local\H2AndroidJob_" + (Avd-Name ([string]$Job.profileId))
        $JobMutex = [System.Threading.Mutex]::new($false,$JobLockName)
        $JobLocked = $false
        try {
          try { $JobLocked = $JobMutex.WaitOne(10000) }
          catch [System.Threading.AbandonedMutexException] { $JobLocked = $true }
          if (!$JobLocked) { throw "Outro agente ja opera esta instancia; comando duplicado bloqueado." }
          $ObservedIp = Run-Job $Job $Sdk
          $Success = $true
        } finally {
          if ($JobLocked) { $JobMutex.ReleaseMutex() }
          $JobMutex.Dispose()
        }
      } catch {
        $ErrorText = [string]$_.Exception.Message
        Write-Warning $ErrorText
      } finally {
        Stop-H2JobHeartbeat -HeartbeatJob $HeartbeatJob
        # Do not stop the relay after a successful boot: Android still uses it.
        # On failure, preserve a relay if the native emulator is still alive.
        if (!$Success -and $Job.action -in @("create","rebuild","start")) {
          try {
            $Avd = Avd-Name ([string]$Job.profileId)
            if (!(Test-H2EmulatorProcess -Name $Avd)) { Stop-H2SocksRelay -Name $Avd }
          } catch {}
        }
      }
      # The completion endpoint stores at most 500 chars of diagnostics.
      # Always send a bounded error so a long emulator log cannot cause HTTP 400.
      if ($ErrorText -and $ErrorText.Length -gt 500) {
        $ErrorText = $ErrorText.Substring(0,500)
      }
      if ($ObservedIp -and $ObservedIp.Length -gt 64) {
        $ObservedIp = $ObservedIp.Substring(0,64)
      }
      $Done = @{jobId=[long]$Job.id;success=$Success;error=$ErrorText;observedIp=$ObservedIp}
      $CompletionAccepted = $false
      for ($CompletionAttempt = 1; $CompletionAttempt -le 3; $CompletionAttempt++) {
        try {
          $Completed = Api "/api/h2-android/agent/complete" $Done $Token
          if (!$Completed.accepted) { throw "Servidor recusou a conclusao do comando." }
          $CompletionAccepted = $true
          Write-H2Status ("JOB_COMPLETE " + [string]$Job.id + " " + [string]$Success)
          break
        } catch {
          Write-H2Status ("JOB_COMPLETE_RETRY " + [string]$Job.id + " attempt " + $CompletionAttempt)
          if ($CompletionAttempt -lt 3) { Start-Sleep -Seconds 3 }
        }
      }
      if (!$CompletionAccepted) { throw "Servidor nao confirmou a conclusao do comando apos 3 tentativas." }
    } else { Start-Sleep -Seconds 4 }
  } catch {
    $Online = $false
    Write-H2Status "RECONNECTING"
    Write-Warning ("H2 Android: " + $_.Exception.Message)
    Start-Sleep -Seconds 10
  }
}
