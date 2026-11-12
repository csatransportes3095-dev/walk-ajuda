# H2 Android Windows Agent - runs native Google Android Emulator windows only.
# Requires Google SDK command-line tools + Android Emulator + a Play Store x86_64 image.
# Scope: %LOCALAPPDATA%\H2AndroidNative. Does not touch H2ADS/other AVDs.
param(
  [string]$Server = "https://www.h2colombiano.com",
  [string]$PairCode = ""
)
$ErrorActionPreference = "Stop"
$Version = "1.0.0"
$Base = Join-Path $env:LOCALAPPDATA "H2AndroidNative"
$AvdHome = Join-Path $Base "avd"
$TokenFile = Join-Path $Base "agent.secure"
New-Item -ItemType Directory -Force -Path $Base,$AvdHome | Out-Null
$env:ANDROID_AVD_HOME = $AvdHome
$Server = $Server.TrimEnd("/")
if ($Server -notmatch '^https://[a-z0-9.-]+$') { throw "A URL do servidor deve usar HTTPS." }

function Api([string]$Endpoint, [object]$Body, [string]$Token = "") {
  $Headers = @{}
  if ($Token) { $Headers.Authorization = "Bearer $Token" }
  return Invoke-RestMethod -Uri ($Server + $Endpoint) -Method Post -ContentType "application/json" -Headers $Headers -Body (ConvertTo-Json -InputObject $Body -Depth 8 -Compress) -TimeoutSec 45
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
function Adb-Serial([string]$Adb,[string]$Name) {
  $Lines = @(& $Adb devices 2>$null)
  foreach ($line in $Lines) {
    if ($line -match '^(emulator-\d+)\s+device') {
      $serial = $Matches[1]
      $found = @(& $Adb -s $serial emu avd name 2>$null)
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
      $Booted = @(& $Adb -s $Serial shell getprop sys.boot_completed 2>$null)
      if (($Booted | Out-String).Trim() -eq "1") { return $Serial }
    }
    Start-Sleep -Seconds 3
  }
  throw "Emulador não ficou pronto em $TimeoutSeconds segundos."
}
function Check-Proxy([object]$Proxy) {
  if (!$Proxy -or $Proxy.protocol -ne "http") { throw "Somente proxy HTTP autenticado é aceito neste agente." }
  $Address = "http://$($Proxy.host):$($Proxy.port)"
  $Credential = New-Object System.Management.Automation.PSCredential(
    [string]$Proxy.username,(ConvertTo-SecureString ([string]$Proxy.password) -AsPlainText -Force))
  # Explicitly test remote IP THROUGH the proxy before creating/starting an AVD.
  $Reply = Invoke-WebRequest -Uri "https://api.ipify.org?format=json" -Proxy $Address -ProxyCredential $Credential -TimeoutSec 25 -UseBasicParsing
  $Json = $Reply.Content | ConvertFrom-Json
  if ([string]$Json.ip -notmatch '^[0-9a-fA-F:.]+$') { throw "O proxy não informou um IP válido." }
  return [string]$Json.ip
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
      if (!(Test-Path (Join-Path $AvdHome "$Name.avd"))) {
        # No clone: build fresh AVD with a unique writable userdata image.
        $PackageDir = Join-Path $Sdk "system-images\android-35\google_apis_playstore\x86_64"
        if (!(Test-Path $PackageDir)) { throw "Imagem Play Store Android 35 x86_64 não instalada no SDK." }
        "no" | & $AvdManager create avd -n $Name -k $Image -d "pixel_6" -f | Out-Null
        if ($LASTEXITCODE -ne 0 -or !(Test-Path (Join-Path $AvdHome "$Name.avd"))) {
          throw "Falha ao criar Android virtual individual."
        }
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
        & $Adb -s $Serial emu kill | Out-Null
        $Deadline = (Get-Date).AddSeconds(45)
        while ((Get-Date) -lt $Deadline -and (Adb-Serial $Adb $Name)) { Start-Sleep -Seconds 2 }
        if (Adb-Serial $Adb $Name) { throw "Android continua aberto; não foi possível confirmar parada." }
      }
      return $null
    }
    "delete" {
      if ($Serial) {
        & $Adb -s $Serial emu kill | Out-Null
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
Write-Host "H2 Android nativo: conectado a $Server. Ctrl+C para encerrar."
while ($true) {
  try {
    $Sdk = Android-Sdk
    $Result = Api "/api/h2-android/agent/next" @{computerName=$env:COMPUTERNAME;version=$Version} $Token
    if ($Result.job) {
      $Job = $Result.job
      Write-Host "Comando $($Job.action) / $($Job.profileId)"
      $Success = $false
      $ErrorText = $null
      $ObservedIp = $null
      try {
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
    Write-Warning ("H2 Android: " + $_.Exception.Message)
    Start-Sleep -Seconds 10
  }
}
