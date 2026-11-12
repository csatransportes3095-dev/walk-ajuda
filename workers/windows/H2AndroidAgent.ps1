# H2 Android Windows Agent - runs native Google Android Emulator windows only.
# Requires Google SDK command-line tools + Android Emulator + a Play Store x86_64 image.
# Scope: %LOCALAPPDATA%\H2AndroidNative. Does not touch H2ADS/other AVDs.
param(
  [string]$Server = "https://h2colombiano.com",
  [string]$PairCode = ""
)
$ErrorActionPreference = "Stop"
$Version = "1.0.3"
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
function Check-Proxy([object]$Proxy) {
  if (!$Proxy -or $Proxy.protocol -ne "http") { throw "Somente proxy HTTP autenticado é aceito neste agente." }
  $Address = "http://$($Proxy.host):$($Proxy.port)"
  $SecurePassword = ConvertTo-SecureString -String ([string]$Proxy.password) -AsPlainText -Force
  $Credential = [System.Management.Automation.PSCredential]::new([string]$Proxy.username, $SecurePassword)
  # Explicitly test remote IP THROUGH the proxy before creating/starting an AVD.
  $Reply = Invoke-WebRequest -Uri "https://api.ipify.org?format=json" -Proxy $Address -ProxyCredential $Credential -TimeoutSec 25 -UseBasicParsing
  $Json = $Reply.Content | ConvertFrom-Json
  if ([string]$Json.ip -notmatch '^[0-9a-fA-F:.]+$') { throw "O proxy não informou um IP válido." }
  return [string]$Json.ip
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

function Run-Job([object]$Job,[string]$Sdk) {
  $Name = Avd-Name ([string]$Job.profileId)
  $Adb = Join-Path $Sdk "platform-tools\adb.exe"
  $Emulator = Join-Path $Sdk "emulator\emulator.exe"
  $AvdManager = Join-Path $Sdk "cmdline-tools\latest\bin\avdmanager.bat"
  $Image = "system-images;android-35;google_apis_playstore;x86_64"
  $ProxyIp = $null
  if ($Job.action -in @("create","start")) { $ProxyIp = Check-Proxy $Job.proxy }
  $Serial = Adb-Serial $Adb $Name
  switch ([string]$Job.action) {
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
        # Proxy credentials are passed to Android Emulator, not to the website.
        # Native proxy is HTTP/TCP only. Verify real app routing independently.
        $Uri = "http://$([uri]::EscapeDataString([string]$Job.proxy.username)):$([uri]::EscapeDataString([string]$Job.proxy.password))@$($Job.proxy.host):$($Job.proxy.port)"
        Start-Process -FilePath $Emulator -ArgumentList @("-avd",$Name,"-http-proxy",$Uri,"-no-boot-anim") -WorkingDirectory (Join-Path $Sdk "emulator") | Out-Null
      }
      [void](Wait-Boot $Adb $Name)
      return $ProxyIp
    }
    "start" {
      if (!(Test-Path (Join-Path $AvdHome "$Name.avd"))) { throw "Este Android não está instalado no computador." }
      if (!$Serial) {
        $Uri = "http://$([uri]::EscapeDataString([string]$Job.proxy.username)):$([uri]::EscapeDataString([string]$Job.proxy.password))@$($Job.proxy.host):$($Job.proxy.port)"
        Start-Process -FilePath $Emulator -ArgumentList @("-avd",$Name,"-http-proxy",$Uri,"-no-boot-anim") -WorkingDirectory (Join-Path $Sdk "emulator") | Out-Null
      }
      [void](Wait-Boot $Adb $Name)
      return $ProxyIp
    }
    "stop" {
      if ($Serial) {
        Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"emu","kill") | Out-Null
        $Deadline = (Get-Date).AddSeconds(45)
        while ((Get-Date) -lt $Deadline -and (Adb-Serial $Adb $Name)) { Start-Sleep -Seconds 2 }
        if (Adb-Serial $Adb $Name) { throw "Android continua aberto; não foi possível confirmar parada." }
      }
      return $null
    }
    "delete" {
      if ($Serial) {
        Invoke-H2Adb -Executable $Adb -CommandArgs @("-s",$Serial,"emu","kill") | Out-Null
        $Deadline = (Get-Date).AddSeconds(45)
        while ((Get-Date) -lt $Deadline -and (Adb-Serial $Adb $Name)) { Start-Sleep -Seconds 2 }
        if (Adb-Serial $Adb $Name) { throw "Android ainda aberto. Exclusão bloqueada." }
      }
      if (Test-Path (Join-Path $AvdHome "$Name.avd")) {
        & $AvdManager delete avd -n $Name | Out-Null
        if (Test-Path (Join-Path $AvdHome "$Name.avd")) { throw "Arquivos do Android não foram removidos." }
      }
      $Ini = Join-Path $AvdHome "$Name.ini"
      if (Test-Path $Ini) { Remove-Item -LiteralPath $Ini -Force }
      return $null
    }
    default { throw "Comando desconhecido." }
  }
}

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
Write-Host "H2 Android $Version: verificando autenticacao com $Server..."
$Online = $false
while ($true) {
  try {
    # Heartbeat must not depend on the Android SDK being installed. Pair first,
    # then report missing SDK components as a job error, never as "offline".
    $Result = Api "/api/h2-android/agent/next" @{computerName=$env:COMPUTERNAME;version=$Version} $Token
    if (!$Online) { Write-Host "H2 Android: conexao autenticada, agente online."; $Online = $true }
    if ($Result.job) {
      $Job = $Result.job
      Write-Host "Comando $($Job.action) / $($Job.profileId)"
      $Success = $false
      $ErrorText = $null
      $ObservedIp = $null
      try {
        $Sdk = Android-Sdk
        $ObservedIp = Run-Job $Job $Sdk
        $Success = $true
      } catch {
        $ErrorText = [string]$_.Exception.Message
        Write-Warning $ErrorText
      }
      $Done = @{jobId=[long]$Job.id;success=$Success;error=$ErrorText;observedIp=$ObservedIp}
      [void](Api "/api/h2-android/agent/complete" $Done $Token)
    } else { Start-Sleep -Seconds 4 }
  } catch {
    $Online = $false
    Write-Warning ("H2 Android: " + $_.Exception.Message)
    Start-Sleep -Seconds 10
  }
}
