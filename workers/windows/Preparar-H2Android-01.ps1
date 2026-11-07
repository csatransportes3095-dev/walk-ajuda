param([switch]$CheckOnly)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$AvdName = "H2Android_01"
$ImagePackage = "system-images;android-35;google_apis_playstore;x86_64"
$OfficialDocs = "https://developer.android.com/studio"
$Host.UI.RawUI.WindowTitle = "H2 Android - Primeiro Aparelho" 

function Say([string]$msg) { Write-Host $msg -ForegroundColor Cyan }
function Notice([string]$msg) { Write-Host $msg -ForegroundColor Yellow }
function Stop-Setup([string]$message) {
  Write-Host ("NAO FOI POSSIVEL CONTINUAR: " + $message) -ForegroundColor Red
  throw $message
}
function Find-Sdk {
  $roots = @()
  if ($env:ANDROID_HOME) { $roots += $env:ANDROID_HOME }
  if ($env:ANDROID_SDK_ROOT) { $roots += $env:ANDROID_SDK_ROOT }
  $roots += (Join-Path $env:LOCALAPPDATA "Android\Sdk")
  foreach ($root in ($roots | Select-Object -Unique)) {
    if (!$root) { continue }
    $emu = Join-Path $root "emulator\emulator.exe"
    $sdkTools = Join-Path $root "cmdline-tools"
    if ((Test-Path -LiteralPath $emu) -or (Test-Path -LiteralPath $sdkTools)) { return $root }
  }
  return $null
}
function Find-SdkTool([string]$root, [string]$name) {
  if (!$root) { return $null }
  $file = switch ($name) {
    "emulator" { Join-Path $root "emulator\emulator.exe"; break }
    "adb" { Join-Path $root "platform-tools\adb.exe"; break }
    "sdkmanager" {
      $latest = Join-Path $root "cmdline-tools\latest\bin\sdkmanager.bat"
      if (Test-Path -LiteralPath $latest) { return $latest }
      $other = @(Get-ChildItem -LiteralPath (Join-Path $root "cmdline-tools") -Filter sdkmanager.bat -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1)
      if ($other.Count) { return $other[0].FullName }
      return $null
    }
    "avdmanager" {
      $latest = Join-Path $root "cmdline-tools\latest\bin\avdmanager.bat"
      if (Test-Path -LiteralPath $latest) { return $latest }
      $other = @(Get-ChildItem -LiteralPath (Join-Path $root "cmdline-tools") -Filter avdmanager.bat -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1)
      if ($other.Count) { return $other[0].FullName }
      return $null
    }
  }
  if (Test-Path -LiteralPath $file -PathType Leaf) { return $file }
  return $null
}
function Confirm-Action([string]$message) {
  $answer = Read-Host ($message + " [S/N]")
  return $answer -match '^[sSyY]$'
}

Say "====================================================="
Say "       H2 ANDROID - PRIMEIRO APARELHO VIRTUAL"
Say "====================================================="
Write-Host "Este assistente prepara somente $AvdName no seu Windows."
Write-Host "Nao altera H2 ADS, Chrome, outros AVDs ou proxies."
Write-Host "Nao modifica IMEI, serial, MAC ou seguranca de aplicativos."
Write-Host ""
if ([Environment]::Is64BitOperatingSystem -ne $true) { Stop-Setup "Windows 64 bits obrigatorio." }

$root = Find-Sdk
if (!$root) {
  Notice "Android SDK ainda nao foi encontrado."
  Write-Host "Instale o Android Studio oficial, abra o SDK Manager e instale Android SDK Command-line Tools e Android Emulator."
  Write-Host "Endereco oficial: $OfficialDocs"
  Write-Host "Apos a instalacao, execute este assistente novamente."
  exit 2
}
$env:ANDROID_HOME = $root
$env:ANDROID_SDK_ROOT = $root
Say ("SDK identificado em: " + $root)

$emulator = Find-SdkTool $root "emulator"
$adb = Find-SdkTool $root "adb"
$sdkmanager = Find-SdkTool $root "sdkmanager"
$avdmanager = Find-SdkTool $root "avdmanager"
if (!$sdkmanager -or !$avdmanager) {
  Notice "Faltam as Android SDK Command-line Tools."
  Write-Host "Abra Android Studio > SDK Manager > SDK Tools > Android SDK Command-line Tools (latest)."
  exit 3
}

if (!(Get-Command java.exe -ErrorAction SilentlyContinue) -and !$env:JAVA_HOME) {
  foreach ($candidate in @(
    (Join-Path $env:ProgramFiles "Android\Android Studio\jbr"),
    (Join-Path $env:ProgramFiles "Android\Android Studio\jre")
  )) {
    if (Test-Path -LiteralPath (Join-Path $candidate "bin\java.exe")) {
      $env:JAVA_HOME = $candidate
      break
    }
  }
}
if (!(Get-Command java.exe -ErrorAction SilentlyContinue) -and (!$env:JAVA_HOME -or !(Test-Path -LiteralPath (Join-Path $env:JAVA_HOME "bin\java.exe")))) {
  Notice "Java (JBR) nao encontrado. Conclua a instalacao do Android Studio oficial."
  exit 4
}

if (!$emulator) {
  Notice "Android Emulator nao instalado."
  Write-Host "Abra Android Studio > SDK Manager > SDK Tools e instale Android Emulator."
  exit 5
}
$accel = @(& $emulator -accel-check 2>&1 | ForEach-Object { "$_" })
$accel | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) {
  Notice "A aceleracao de virtualizacao nao esta pronta."
  Write-Host "Verifique BIOS (VT-x/AMD-V) e Windows Hypervisor Platform (WHPX)."
  Write-Host "Nao vamos alterar BIOS ou recursos do Windows automaticamente."
  exit 6
}
Say "Aceleracao do Android Emulator detectada."

$freeGb = $null
try {
  $drive = [IO.Path]::GetPathRoot($env:USERPROFILE)
  $info = New-Object IO.DriveInfo($drive)
  $freeGb = [Math]::Round($info.AvailableFreeSpace / 1GB, 1)
  Write-Host ("Espaco livre no disco do usuario: " + $freeGb + " GB.")
} catch {}
if ($null -ne $freeGb -and $freeGb -lt 18) {
  Notice "Menos de 18 GB livres. Libere espaco antes de baixar a imagem Google Play."
  exit 7
}

$avds = @(& $emulator -list-avds 2>$null | ForEach-Object { $_.Trim() })
$existing = @($avds | Where-Object { $_ -eq $AvdName }).Count -gt 0
$imageRoot = Join-Path $root "system-images\android-35\google_apis_playstore\x86_64"
$installed = Test-Path -LiteralPath (Join-Path $imageRoot "system.img") -PathType Leaf
Write-Host ("Google Play Android 15 (API 35): " + $(if ($installed) {"instalado"} else {"nao instalado"}))
Write-Host ("Perfil ${AvdName}: " + $(if ($existing) {"existente"} else {"novo"}))
if ($CheckOnly) {
  Say "Diagnostico concluido. Nenhuma alteracao foi feita."
  exit 0
}

if (!$installed -and !$existing) {
  Notice "A imagem oficial Google Play pode ocupar varios GB e exigir licencas."
  if (!(Confirm-Action "Autoriza baixar e instalar a imagem oficial Android 15 Google Play neste computador?")) {
    Write-Host "Download cancelado sem alteracoes."
    exit 0
  }
  Write-Host "O Google podera solicitar aceite dos termos. Leia antes de aceitar."
  & $sdkmanager "--sdk_root=$root" "--install" $ImagePackage
  if ($LASTEXITCODE -ne 0) { Stop-Setup "Falha no SDK Manager. Verifique licencas, Java e internet." }
  if (!(Test-Path -LiteralPath (Join-Path $imageRoot "system.img"))) {
    Stop-Setup "Imagem nao foi instalada no caminho esperado. Use o SDK Manager do Android Studio."
  }
}
if (!$existing) {
  $deviceList = @(& $avdmanager list device -c 2>$null)
  $deviceText = $deviceList -join "\n"
  $selected = @("pixel_8","pixel_7","pixel_6","pixel_5","pixel_4") | Where-Object {
    $deviceText -match [regex]::Escape($_)
  } | Select-Object -First 1
  if (!$selected) {
    Notice "Nenhum perfil Pixel padrao encontrado. Crie um Pixel com Play Store no Device Manager do Android Studio."
    exit 8
  }
  if (!(Confirm-Action "Criar o perfil $AvdName usando $selected (sem mexer nos Androids existentes)?")) {
    Write-Host "Criacao cancelada."
    exit 0
  }
  & $avdmanager create avd -n $AvdName -k $ImagePackage -d $selected
  if ($LASTEXITCODE -ne 0) { Stop-Setup "Falha ao criar o perfil Android. Verifique as mensagens acima." }
  Say "Perfil $AvdName criado!"
} else {
  Say "Perfil $AvdName ja existe e foi preservado."
}

if (!$adb) { Notice "ADB nao instalado. Instale Android SDK Platform-Tools no SDK Manager antes de continuar."; exit 9 }
$running = @(& $adb devices 2>$null | Where-Object { $_ -match '^emulator-[0-9]+\\s+device$' })
if ($running.Count -ge 5) { Notice "Ja existem cinco emuladores ligados. Desligue um antes de iniciar outro."; exit 10 }

if (Confirm-Action "Abrir agora o Android 01 em uma janela propria do Windows?") {
  Start-Process -FilePath $emulator -ArgumentList @("-avd", $AvdName, "-no-snapshot-load") -WorkingDirectory (Split-Path -Parent $emulator)
  Say "Android 01 foi solicitado para iniciar."
  Write-Host "Confira a tela do emulador. O agente H2 Android identificara o AVD no ADM."
  Write-Host "Depois da inicializacao, abra a Play Store e confira a disponibilidade dos apps."
} else {
  Write-Host "Android preparado e desligado. Nenhum emulador foi iniciado."
}
