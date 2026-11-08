# H2 Android Native - instalador ISO UEFI isolado, somente componentes Windows.
# Padrao: diagnostico do host, sem criar VM, instalar app, baixar ISO ou mudar rede.
[CmdletBinding()]
param(
  [ValidateSet("CheckHost","CheckMedia","Prepare","Audit","Start","Console","Stop","List")]
  [string]$Action = "CheckHost",
  [string]$VMName = "",
  [string]$IsoPath = "",
  [string]$ExpectedSha256 = "",
  [switch]$AllowUnsignedBoot,
  [switch]$Json
)
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "H2NativeCore.psm1") -Force -ErrorAction Stop
$tag = "H2_ANDROID_NATIVE_V1"

function Publish-H2Result {
  param([Parameter(Mandatory = $true)]$Value)
  if ($Json) { $Value | ConvertTo-Json -Depth 7 }
  else { $Value | Format-List | Out-String | Write-Output }
}

function Test-H2IsoEfi {
  param([Parameter(Mandatory = $true)][string]$FullIsoPath)
  # Temporariamente montar APENAS a ISO local; nenhuma particao de sistema e alterada.
  $state = Get-DiskImage -ImagePath $FullIsoPath -ErrorAction Stop
  $mountedHere = !$state.Attached
  try {
    if ($mountedHere) {
      Mount-DiskImage -ImagePath $FullIsoPath -StorageType ISO -Access ReadOnly -ErrorAction Stop | Out-Null
    }
    $volumes = @(Get-DiskImage -ImagePath $FullIsoPath -ErrorAction Stop | Get-Volume -ErrorAction Stop)
    foreach ($volume in $volumes) {
      if (![string]::IsNullOrWhiteSpace([string]$volume.DriveLetter)) {
        $driveRoot = ([string]$volume.DriveLetter) + ":\"
        if (Test-Path -LiteralPath (Join-Path $driveRoot "EFI\BOOT\BOOTX64.EFI") -PathType Leaf) {
          return $true
        }
      }
    }
    return $false
  } finally {
    if ($mountedHere) {
      # Nunca desmontar ISO que ja estava montada pelo usuario.
      Dismount-DiskImage -ImagePath $FullIsoPath -ErrorAction Stop | Out-Null
    }
  }
}

function Get-H2IsoMediaStatus {
  param([string]$FilePath, [string]$Sha256)
  if (!(Test-H2NativeHash $Sha256)) { throw "Informe SHA-256 exato da imagem ISO (64 caracteres hexadecimais)." }
  if ([string]::IsNullOrWhiteSpace($FilePath)) { throw "Informe caminho de ISO Android x86_64 UEFI." }
  $resolved = (Resolve-Path -LiteralPath $FilePath -ErrorAction Stop).ProviderPath
  if ([IO.Path]::GetExtension($resolved) -ine ".iso") { throw "Somente arquivo ISO local e aceito." }
  if (!(Test-Path -LiteralPath $resolved -PathType Leaf)) { throw "Imagem ISO nao encontrada." }
  $size = (Get-Item -LiteralPath $resolved -ErrorAction Stop).Length
  if ($size -lt 64MB) { throw "ISO pequena demais para uma imagem Android completa." }
  $digest = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256 -ErrorAction Stop).Hash
  if ($digest -ine $Sha256) { throw "SHA-256 nao confere; imagem nao autorizada." }
  $uefi = Test-H2IsoEfi -FullIsoPath $resolved
  return [pscustomobject]@{
    project = "H2 Android Native"
    path = $resolved
    sizeGB = [Math]::Round(([double]$size / 1GB), 2)
    isoSha256 = $digest
    sha256Match = $true
    efiBootX64Found = [bool]$uefi
    imageProvenanceVerified = $false
    androidBootVerified = $false
    readyForOfflineInstallAttempt = [bool]$uefi
    note = "EFI BOOTX64 encontrado apenas indica candidato UEFI; boot Android precisa teste real."
  }
}

function Get-H2NativeIsoAudit {
  param([string]$Name)
  Assert-H2NativeName $Name
  Assert-H2NativeReady
  $vm = Get-H2NativeOwnedVm $Name
  $disk = Get-H2NativeDiskPath $Name
  $manifestPath = Join-Path (Split-Path $disk -Parent) "manifest.json"
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop | ConvertFrom-Json
  if ([string]$manifest.mode -cne "ISO_INSTALLER") {
    throw "VM nao foi preparada pelo instalador ISO H2. Nao sera modificada."
  }
  $diskInfo = Get-VHD -Path $disk -ErrorAction Stop
  if ([string]$diskInfo.VhdType -ne "Dynamic") { throw "Disco do instalador nao e VHDX dinamico H2." }
  $isoPath = [string]$manifest.imagePath
  if (!(Test-Path -LiteralPath $isoPath -PathType Leaf)) { throw "ISO original nao foi encontrada." }
  if ([IO.Path]::GetExtension($isoPath) -ine ".iso") { throw "Midia do manifesto nao e ISO." }
  $digest = (Get-FileHash -LiteralPath $isoPath -Algorithm SHA256 -ErrorAction Stop).Hash
  if ($digest -ine [string]$manifest.imageSha256) { throw "ISO mudou apos provisionamento; boot recusado." }
  $dvds = @(Get-VMDvdDrive -VMName $Name -ErrorAction Stop)
  if ($dvds.Count -ne 1 -or [string]::IsNullOrWhiteSpace([string]$dvds[0].Path)) {
    throw "Drive de instalacao da VM ausente ou inesperado."
  }
  $matches = [string]::Equals([IO.Path]::GetFullPath([string]$dvds[0].Path),
    [IO.Path]::GetFullPath($isoPath), [StringComparison]::OrdinalIgnoreCase)
  if (!$matches) { throw "Drive ISO nao coincide com manifesto do H2." }
  $network = @(Get-VMNetworkAdapter -VMName $Name -ErrorAction Stop | Where-Object {
    ![string]::IsNullOrWhiteSpace([string]$_.SwitchName)
  })
  if ($network.Count -gt 0) { throw "Rede conectada; inicializacao recusada ate isolamento SOCKS5 validado." }
  $firmware = Get-VMFirmware -VMName $Name -ErrorAction Stop
  return [pscustomobject]@{
    project = "H2 Android Native"
    mode = "ISO_INSTALLER"
    name = $Name
    hyperVState = [string]$vm.State
    generation = [int]$vm.Generation
    disk = $disk
    iso = $isoPath
    isoHashMatch = $true
    dvdMatchesManifest = $true
    secureBoot = [string]$firmware.SecureBoot
    networkConnected = $false
    readyForOfflineBootAttempt = $true
    androidBootVerified = $false
    playStoreVerified = $false
    proxyVerified = $false
  }
}

switch ($Action) {
  "CheckHost" {
    Publish-H2Result (& (Join-Path $PSScriptRoot "H2NativeReadiness.ps1") -Json | ConvertFrom-Json)
  }
  "CheckMedia" {
    Publish-H2Result (Get-H2IsoMediaStatus -FilePath $IsoPath -Sha256 $ExpectedSha256)
  }
  "List" {
    Publish-H2Result ([pscustomobject]@{ project="H2 Android Native"; vms=@(Get-H2NativeInventory) })
  }
  "Prepare" {
    Assert-H2NativeName $VMName
    Assert-H2NativeReady
    $media = Get-H2IsoMediaStatus -FilePath $IsoPath -Sha256 $ExpectedSha256
    if (!$media.readyForOfflineInstallAttempt) { throw "ISO nao contem EFI\BOOT\BOOTX64.EFI. Gen2 UEFI nao verificado." }
    if (Get-VM -Name $VMName -ErrorAction SilentlyContinue) {
      throw "VM com esse nome ja existe; nunca sobrescrever."
    }
    $owned = @(Get-VM -ErrorAction Stop | Where-Object {
      (Test-H2NativeName $_.Name) -and [string]$_.Notes -ceq $tag
    })
    if ($owned.Count -ge 100) { throw "Limite de 100 VMs H2 cadastradas." }
    $disk = Get-H2NativeDiskPath $VMName
    $folder = Split-Path $disk -Parent
    if (Test-Path -LiteralPath $folder) { throw "Pasta da instancia ja existe; nenhuma alteracao." }
    $configDir = Join-Path (Get-H2NativeRoot) "Configs"
    $root = [IO.Path]::GetPathRoot($folder)
    if ((New-Object System.IO.DriveInfo($root)).AvailableFreeSpace -lt 12GB) {
      throw "Espaco livre insuficiente: minimo de 12 GB para iniciar instalacao H2."
    }
    New-Item -ItemType Directory -Path $folder -ErrorAction Stop | Out-Null
    New-Item -ItemType Directory -Path $configDir -Force -ErrorAction Stop | Out-Null
    # Disco exclusivo do H2. Nenhum disco de outra VM e tocado.
    New-VHD -Path $disk -Dynamic -SizeBytes 32GB -ErrorAction Stop | Out-Null
    $vm = New-VM -Name $VMName -Generation 2 -Path $configDir -VHDPath $disk -MemoryStartupBytes 4GB -ErrorAction Stop
    Set-VM -VM $vm -Notes $tag -AutomaticStartAction Nothing -AutomaticStopAction ShutDown -ErrorAction Stop
    Set-VMProcessor -VMName $VMName -Count 2 -ErrorAction Stop
    Add-VMDvdDrive -VMName $VMName -Path $media.path -ErrorAction Stop | Out-Null
    $dvd = @(Get-VMDvdDrive -VMName $VMName -ErrorAction Stop)
    if ($dvd.Count -ne 1) { throw "Numero inesperado de DVDs; a VM permanece desligada." }
    Set-VMFirmware -VMName $VMName -FirstBootDevice $dvd[0] -ErrorAction Stop
    if ($AllowUnsignedBoot) {
      Set-VMFirmware -VMName $VMName -EnableSecureBoot Off -ErrorAction Stop
    }
    foreach ($adapter in @(Get-VMNetworkAdapter -VMName $VMName -ErrorAction Stop)) {
      if (![string]::IsNullOrWhiteSpace([string]$adapter.SwitchName)) {
        Disconnect-VMNetworkAdapter -VMNetworkAdapter $adapter -ErrorAction Stop
      }
    }
    $manifest = @{
      owner = $tag; mode = "ISO_INSTALLER"; name = $VMName
      vmId = $vm.Id.ToString(); imagePath = $media.path
      imageSha256 = $media.isoSha256; createdUtc = [datetime]::UtcNow.ToString("o")
      networkPolicy = "disconnected-until-proxy-guest-isolation"
      androidBootVerified = $false
    }
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $folder "manifest.json") -Encoding UTF8 -ErrorAction Stop
    Publish-H2Result (Get-H2NativeIsoAudit -Name $VMName)
  }
  "Audit" {
    Publish-H2Result (Get-H2NativeIsoAudit -Name $VMName)
  }
  "Start" {
    $audit = Get-H2NativeIsoAudit -Name $VMName
    if (!$audit.readyForOfflineBootAttempt) { throw "Auditoria reprovada; boot bloqueado." }
    Publish-H2Result (Start-H2NativeVm -VMName $VMName)
  }
  "Console" {
    $audit = Get-H2NativeIsoAudit -Name $VMName
    if ($audit.hyperVState -ne "Running") { throw "A VM H2 ainda nao esta ligada." }
    $viewer = Join-Path $env:WINDIR "System32\vmconnect.exe"
    if (!(Test-Path -LiteralPath $viewer -PathType Leaf)) { throw "VMConnect nativo do Windows ausente." }
    Start-Process -FilePath $viewer -ArgumentList @("localhost",$VMName) -ErrorAction Stop | Out-Null
    Publish-H2Result ([pscustomobject]@{
      project="H2 Android Native";name=$VMName;console="Hyper-V VMConnect"
      networkConnected=$false;androidBootVerified=$false
      note="Console local aberto. Confirme boot real do Android antes de instalar apps."
    })
  }
  "Stop" {
    Get-H2NativeIsoAudit -Name $VMName | Out-Null
    Publish-H2Result (Stop-H2NativeVm -VMName $VMName)
  }
}
