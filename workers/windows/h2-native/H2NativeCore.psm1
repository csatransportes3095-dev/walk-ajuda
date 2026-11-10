# H2 Android Native - host functions (Windows PowerShell 5.1).
# Native Windows Hyper-V only. Never starts Android Studio, Android Emulator or ADB.
# This module intentionally has no remote command polling and no network setup.
Set-StrictMode -Version Latest
$script:H2NativeTag = "H2_ANDROID_NATIVE_V1"

function Test-H2NativeName {
  param([AllowEmptyString()][string]$Name)
  return [bool]($Name -cmatch '^H2N_(?!000)[0-9]{3}$')
}

function Assert-H2NativeName {
  param([string]$Name)
  if (!(Test-H2NativeName $Name)) {
    throw "Nome invalido. Use H2N_001 ate H2N_999. Outros aparelhos nao podem ser alterados."
  }
}

function Test-H2NativeHash {
  param([AllowEmptyString()][string]$Sha256)
  return [bool]($Sha256 -match '^[a-fA-F0-9]{64}$')
}

function Get-H2NativeRoot {
  $base = [Environment]::GetFolderPath("CommonApplicationData")
  if ([string]::IsNullOrWhiteSpace($base)) { throw "Diretorio ProgramData indisponivel." }
  return Join-Path $base "H2AndroidNative"
}

function Get-H2NativeDiskPath {
  param([string]$VMName)
  Assert-H2NativeName $VMName
  return Join-Path (Join-Path (Join-Path (Get-H2NativeRoot) "Disks") $VMName) "system.vhdx"
}

function Test-H2NativeAdministrator {
  try {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch { return $false }
}

function Get-H2NativeHostStatus {
  $isWindows = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
  $edition = ""
  if ($isWindows) {
    try {
      $edition = [string](Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion" -ErrorAction Stop).EditionID
    } catch {}
  }
  $editionSupported = $edition -match '^(Professional|Enterprise|Education|IoTEnterprise)'
  $isAdmin = Test-H2NativeAdministrator
  $hasHyperV = [bool](Get-Command Get-VM -ErrorAction SilentlyContinue)
  $vmApiReady = $false
  if ($isWindows -and $editionSupported -and $isAdmin -and $hasHyperV) {
    try {
      Get-VM -ErrorAction Stop | Out-Null
      $vmApiReady = $true
    } catch {}
  }
  return [pscustomobject]@{
    engine = "H2 Native / Windows Hyper-V"
    windows = $isWindows
    edition = $edition
    editionSupported = [bool]$editionSupported
    administrator = [bool]$isAdmin
    hyperVModule = [bool]$hasHyperV
    hyperVReady = [bool]$vmApiReady
    ready = [bool]$vmApiReady
    installsExternalEmulator = $false
    modifiesExistingAndroid = $false
    networkEnabledByDefault = $false
    reason = $(if (!$isWindows) { "Somente Windows." }
      elseif (!$editionSupported) { "Hyper-V exige Windows Pro, Enterprise ou Education." }
      elseif (!$isAdmin) { "Abra o PowerShell como administrador para gerenciar VMs." }
      elseif (!$hasHyperV) { "Ative o recurso Hyper-V do Windows; nenhuma instalacao automatica sera feita." }
      elseif (!$vmApiReady) { "O servico Hyper-V nao respondeu." }
      else { "Host preparado; a imagem AOSP inicializavel ainda precisa ser fornecida." })
  }
}

function Assert-H2NativeReady {
  $status = Get-H2NativeHostStatus
  if (!$status.ready) { throw $status.reason }
}

function Get-H2NativeOwnedVm {
  param([string]$VMName)
  Assert-H2NativeName $VMName
  $vm = Get-VM -Name $VMName -ErrorAction SilentlyContinue
  if (!$vm) { throw "VM H2 nao encontrada: $VMName" }
  if ([string]$vm.Notes -cne $script:H2NativeTag -or [int]$vm.Generation -ne 2) {
    throw "VM existente nao pertence ao H2 Native. Operacao recusada."
  }
  $disks = @(Get-VMHardDiskDrive -VMName $VMName -ErrorAction Stop)
  $expected = [IO.Path]::GetFullPath((Get-H2NativeDiskPath $VMName))
  if ($disks.Count -ne 1 -or
      ![string]::Equals([IO.Path]::GetFullPath([string]$disks[0].Path), $expected,
        [StringComparison]::OrdinalIgnoreCase)) {
    throw "Disco nao corresponde a pasta exclusiva H2 Native. Operacao recusada."
  }
  $manifestPath = Join-Path (Split-Path $expected -Parent) "manifest.json"
  if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Manifesto H2 ausente. Nenhum comando sera enviado."
  }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop | ConvertFrom-Json
  if ([string]$manifest.owner -cne $script:H2NativeTag -or
      [string]$manifest.vmId -cne $vm.Id.ToString() -or
      [string]$manifest.name -cne $VMName) {
    throw "Manifesto H2 inconsistente. Operacao recusada."
  }
  return $vm
}

function Get-H2NativeInventory {
  Assert-H2NativeReady
  $out = @()
  foreach ($vm in @(Get-VM -ErrorAction Stop | Where-Object {
    (Test-H2NativeName $_.Name) -and [string]$_.Notes -ceq $script:H2NativeTag
  })) {
    try {
      $owned = Get-H2NativeOwnedVm $vm.Name
      $connected = @((Get-VMNetworkAdapter -VMName $owned.Name -ErrorAction Stop) |
        Where-Object { ![string]::IsNullOrWhiteSpace([string]$_.SwitchName) }).Count -gt 0
      $out += [pscustomobject]@{
        name = $owned.Name
        state = [string]$owned.State
        networkConnected = [bool]$connected
        vmId = $owned.Id.ToString()
      }
    } catch {
      $out += [pscustomobject]@{
        name = $vm.Name
        state = "BLOCKED"
        networkConnected = $null
        error = $_.Exception.Message
      }
    }
  }
  return $out
}

function New-H2NativeVm {
  param(
    [Parameter(Mandatory = $true)][string]$VMName,
    [Parameter(Mandatory = $true)][string]$ImagePath,
    [Parameter(Mandatory = $true)][string]$ImageSha256,
    [switch]$AllowUnsignedBoot
  )
  Assert-H2NativeName $VMName
  if (!(Test-H2NativeHash $ImageSha256)) { throw "SHA-256 da imagem deve ter 64 digitos hexadecimais." }
  Assert-H2NativeReady
  $resolved = (Resolve-Path -LiteralPath $ImagePath -ErrorAction Stop).ProviderPath
  if ([IO.Path]::GetExtension($resolved) -ine ".vhdx") {
    throw "A imagem AOSP deve ser VHDX inicializavel, produzida separadamente."
  }
  $digest = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256 -ErrorAction Stop).Hash
  if ($digest -ine $ImageSha256) { throw "Integridade da imagem incorreta (SHA-256)." }
  $vhd = Get-VHD -Path $resolved -ErrorAction Stop
  if ([string]$vhd.VhdFormat -ne "VHDX" -or
      [string]$vhd.VhdType -notin @("Fixed","Dynamic")) {
    throw "Imagem base VHDX invalida ou em formato differencing."
  }
  if (Get-VM -Name $VMName -ErrorAction SilentlyContinue) {
    throw "Ja existe VM com esse nome. Nao sera alterada."
  }
  $nativeVmCount = @(Get-VM -ErrorAction Stop | Where-Object {
    (Test-H2NativeName $_.Name) -and [string]$_.Notes -ceq $script:H2NativeTag
  }).Count
  if ($nativeVmCount -ge 100) { throw "Limite de 100 VMs H2 cadastradas." }
  $disk = Get-H2NativeDiskPath $VMName
  $folder = Split-Path $disk -Parent
  if (Test-Path -LiteralPath $folder) {
    throw "Pasta da instancia ja existe. Nao sera sobrescrita."
  }
  $configPath = Join-Path (Get-H2NativeRoot) "Configs"
  New-Item -ItemType Directory -Path $folder -ErrorAction Stop | Out-Null
  New-Item -ItemType Directory -Path $configPath -Force -ErrorAction Stop | Out-Null
  # Differencing disk shares the immutable base but has private writable state.
  New-VHD -Path $disk -ParentPath $resolved -Differencing -ErrorAction Stop | Out-Null
  $vm = New-VM -Name $VMName -Generation 2 -Path $configPath -VHDPath $disk -MemoryStartupBytes 4GB -ErrorAction Stop
  Set-VM -VM $vm -Notes $script:H2NativeTag -AutomaticStartAction Nothing -AutomaticStopAction ShutDown -ErrorAction Stop
  Set-VMProcessor -VMName $VMName -Count 2 -ErrorAction Stop
  if ($AllowUnsignedBoot) {
    # Only with explicit operator consent; an unsigned AOSP image needs this.
    Set-VMFirmware -VMName $VMName -EnableSecureBoot Off -ErrorAction Stop
  }
  foreach ($adapter in @(Get-VMNetworkAdapter -VMName $VMName -ErrorAction Stop)) {
    if (![string]::IsNullOrWhiteSpace([string]$adapter.SwitchName)) {
      Disconnect-VMNetworkAdapter -VMNetworkAdapter $adapter -ErrorAction Stop
    }
  }
  $manifest = @{
    owner = $script:H2NativeTag
    name = $VMName
    vmId = $vm.Id.ToString()
    imageSha256 = $digest
    imagePath = $resolved
    createdUtc = [datetime]::UtcNow.ToString("o")
    networkPolicy = "disconnected-until-proxy-guest-isolation"
  }
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $folder "manifest.json") -Encoding UTF8 -ErrorAction Stop
  return [pscustomobject]@{
    name = $VMName
    state = "Created"
    engine = "Hyper-V"
    imageIntegrityVerified = $true
    networkConnected = $false
    guestBootVerified = $false
    note = "VM criada; imagem AOSP e boot devem ser validados no Windows."
  }
}


# Copia OFFLINE um disco Android H2 ja instalado para uma VM totalmente nova.
# A copia de /data tambem leva os identificadores do Android convidado:
# nao afirmar identidade independente ate uma inicializacao/redefinicao propria.
function New-H2NativeClone {
  param(
    [Parameter(Mandatory = $true)][string]$VMName,
    [Parameter(Mandatory = $true)][string]$SourceVMName
  )
  Assert-H2NativeName $VMName
  Assert-H2NativeName $SourceVMName
  if ($VMName -ceq $SourceVMName) { throw "Origem e destino devem ser diferentes." }
  Assert-H2NativeReady
  if (Get-VM -Name $VMName -ErrorAction SilentlyContinue) {
    throw "A VM destino ja existe. Nenhum disco sera sobrescrito."
  }

  $source = Get-H2NativeOwnedVm -VMName $SourceVMName
  if ([string]$source.State -ne "Off") {
    throw "Desligue a VM de origem antes de copiar. Nao sera desligada automaticamente."
  }
  if (@(Get-VMSnapshot -VMName $SourceVMName -ErrorAction Stop).Count -gt 0) {
    throw "A VM original tem checkpoints. Resolva-os antes da copia; nada sera alterado."
  }
  $sourceDisk = Get-H2NativeDiskPath $SourceVMName
  $sourceVhd = Get-VHD -Path $sourceDisk -ErrorAction Stop
  if ([string]$sourceVhd.VhdFormat -cne "VHDX" -or
      [string]$sourceVhd.VhdType -cne "Dynamic" -or
      ![string]::IsNullOrWhiteSpace([string]$sourceVhd.ParentPath) -or
      !(Test-VHD -Path $sourceDisk -ErrorAction Stop)) {
    throw "O disco original nao e VHDX dinamico independente e integro. Copia bloqueada."
  }
  $manifestPath = Join-Path (Split-Path $sourceDisk -Parent) "manifest.json"
  $sourceManifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop |
    ConvertFrom-Json -ErrorAction Stop
  if ([string]$sourceManifest.mode -cne "DISK_FIRST_BOOT" -or
      [IO.Path]::GetExtension([string]$sourceManifest.imagePath) -ine ".iso" -or
      !(Test-H2NativeHash ([string]$sourceManifest.imageSha256))) {
    throw "Instale e inicie primeiro o Android de origem pelo disco, sem ISO."
  }
  $dvd = @(Get-VMDvdDrive -VMName $SourceVMName -ErrorAction Stop)
  if ($dvd.Count -ne 1 -or
      ![string]::IsNullOrWhiteSpace([string]$dvd[0].Path)) {
    throw "Retire a ISO da VM de origem antes de copiar."
  }
  $attached = @(Get-VMNetworkAdapter -VMName $SourceVMName -ErrorAction Stop |
    Where-Object { ![string]::IsNullOrWhiteSpace([string]$_.SwitchName) })
  if ($attached.Count -gt 0) { throw "Origem com rede ligada: copia bloqueada ate validar isolamento." }
  if ([string](Get-VMFirmware -VMName $SourceVMName -ErrorAction Stop).SecureBoot -ne "Off") {
    throw "Origem nao usa o perfil EFI esperado para Android-x86."
  }
  $count = @(Get-VM -ErrorAction Stop | Where-Object {
    (Test-H2NativeName $_.Name) -and [string]$_.Notes -ceq $script:H2NativeTag
  }).Count
  if ($count -ge 100) { throw "Limite de 100 maquinas H2 cadastradas." }

  $sourceFile = Get-Item -LiteralPath $sourceDisk -ErrorAction Stop
  $disk = Get-H2NativeDiskPath $VMName
  $folder = Split-Path $disk -Parent
  if (Test-Path -LiteralPath $folder) {
    throw "A pasta do novo Android ja existe. Nao sera sobrescrita."
  }
  $free = (New-Object System.IO.DriveInfo([IO.Path]::GetPathRoot($disk))).AvailableFreeSpace
  $required = [Math]::Max(8GB, [int64]$sourceFile.Length + 4GB)
  if ($free -lt $required) { throw "Espaco em disco insuficiente para copiar Android e manter margem livre." }

  $createdFolder = $false
  $createdVM = $false
  $newVMId = ""
  try {
    New-Item -ItemType Directory -Path $folder -ErrorAction Stop | Out-Null
    $createdFolder = $true
    # Nao usar disco diferencial da origem: o novo Android precisa ter disco proprio.
    Copy-Item -LiteralPath $sourceDisk -Destination $disk -ErrorAction Stop
    if ((Get-VM -Name $SourceVMName -ErrorAction Stop).State -ne "Off") {
      throw "Origem foi ligada durante a copia. Copia descartada."
    }
    $afterSource = Get-Item -LiteralPath $sourceDisk -ErrorAction Stop
    if ($afterSource.Length -ne $sourceFile.Length -or
        $afterSource.LastWriteTimeUtc -ne $sourceFile.LastWriteTimeUtc) {
      throw "Disco de origem mudou durante a copia. Copia descartada."
    }
    $sourceHash = (Get-FileHash -LiteralPath $sourceDisk -Algorithm SHA256 -ErrorAction Stop).Hash
    $destHash = (Get-FileHash -LiteralPath $disk -Algorithm SHA256 -ErrorAction Stop).Hash
    if ($sourceHash -ine $destHash -or !(Test-VHD -Path $disk -ErrorAction Stop)) {
      throw "O disco copiado nao passou na verificacao de integridade."
    }
    $configPath = Join-Path (Get-H2NativeRoot) "Configs"
    New-Item -ItemType Directory -Path $configPath -Force -ErrorAction Stop | Out-Null
    $newVM = New-VM -Name $VMName -Generation 2 -Path $configPath -VHDPath $disk -MemoryStartupBytes 4GB -ErrorAction Stop
    $newVMId = $newVM.Id.ToString()
    $createdVM = $true
    Set-VM -VM $newVM -Notes $script:H2NativeTag -AutomaticStartAction Nothing -AutomaticStopAction ShutDown -AutomaticCheckpointsEnabled $false -ErrorAction Stop
    Set-VMProcessor -VMName $VMName -Count 2 -ErrorAction Stop
    Set-VMFirmware -VMName $VMName -EnableSecureBoot Off -ErrorAction Stop
    Add-VMDvdDrive -VMName $VMName -ErrorAction Stop | Out-Null
    foreach ($adapter in @(Get-VMNetworkAdapter -VMName $VMName -ErrorAction Stop)) {
      if (![string]::IsNullOrWhiteSpace([string]$adapter.SwitchName)) {
        Disconnect-VMNetworkAdapter -VMNetworkAdapter $adapter -ErrorAction Stop
      }
    }
    $newDisk = @(Get-VMHardDiskDrive -VMName $VMName -ErrorAction Stop)
    if ($newDisk.Count -ne 1) { throw "Discos da nova VM inconsistentes." }
    Set-VMFirmware -VMName $VMName -FirstBootDevice $newDisk[0] -ErrorAction Stop
    $manifest = @{
      owner = $script:H2NativeTag
      name = $VMName
      vmId = $newVMId
      mode = "DISK_FIRST_BOOT"
      imagePath = [string]$sourceManifest.imagePath
      imageSha256 = [string]$sourceManifest.imageSha256
      cloneSourceName = $SourceVMName
      cloneSourceDiskSha256 = $sourceHash
      createdUtc = [datetime]::UtcNow.ToString("o")
      networkPolicy = "disconnected-until-proxy-guest-isolation"
      androidBootVerified = $false
      independentGuestIdentityVerified = $false
    }
    $manifest | ConvertTo-Json -Depth 5 |
      Set-Content -LiteralPath (Join-Path $folder "manifest.json") -Encoding UTF8 -ErrorAction Stop
    Get-H2NativeOwnedVm -VMName $VMName | Out-Null
    return [pscustomobject]@{
      name=$VMName
      state="Created"
      clonedFrom=$SourceVMName
      networkConnected=$false
      guestBootVerified=$false
      independentGuestIdentityVerified=$false
      note="Disco separado copiado offline. Primeiro boot e identidade Android precisam validacao; nao configure contas antes disso."
    }
  } catch {
    $cause = $_.Exception.Message
    # Nunca tocar na origem. Reverter somente a VM de destino criada nesta tentativa.
    if ($createdVM) {
      try {
        $registered = Get-VM -Name $VMName -ErrorAction SilentlyContinue
        if ($registered -and $registered.Id.ToString() -ceq $newVMId -and
            [string]$registered.State -eq "Off") {
          Remove-VM -VM $registered -Force -ErrorAction Stop
        } else {
          throw "Registro da nova VM mudou; nenhuma limpeza automatica."
        }
      } catch { throw "Clone interrompido: $cause. Verifique manualmente o destino antes de continuar." }
    }
    if ($createdFolder -and (Test-Path -LiteralPath $folder)) {
      try { Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction Stop }
      catch { throw "Clone interrompido: $cause. Pasta destino precisa verificacao manual." }
    }
    throw $cause
  }
}

function Start-H2NativeVm {
  param([Parameter(Mandatory = $true)][string]$VMName)
  Assert-H2NativeName $VMName
  Assert-H2NativeReady
  $vm = Get-H2NativeOwnedVm $VMName
  if ([string]$vm.State -eq "Running") { return [pscustomobject]@{ name=$VMName; state="Running" } }
  if ([string]$vm.State -ne "Off") { throw "VM nao esta desligada; estado: $($vm.State)." }
  $connected = @((Get-VMNetworkAdapter -VMName $VMName -ErrorAction Stop) |
    Where-Object { ![string]::IsNullOrWhiteSpace([string]$_.SwitchName) })
  if ($connected.Count -gt 0) {
    throw "Rede da VM conectada sem isolamento de proxy validado. Inicializacao bloqueada."
  }
  $running = @(Get-VM -ErrorAction Stop | Where-Object {
    (Test-H2NativeName $_.Name) -and [string]$_.Notes -ceq $script:H2NativeTag -and
    [string]$_.State -eq "Running"
  })
  if ($running.Count -ge 5) { throw "Limite de cinco instancias simultaneas." }
  Start-VM -Name $VMName -ErrorAction Stop | Out-Null
  return [pscustomobject]@{ name=$VMName; state="Starting"; networkConnected=$false }
}

function Stop-H2NativeVm {
  param([Parameter(Mandatory = $true)][string]$VMName, [switch]$ForcePowerOff)
  Assert-H2NativeName $VMName
  Assert-H2NativeReady
  $vm = Get-H2NativeOwnedVm $VMName
  if ([string]$vm.State -eq "Off") { return [pscustomobject]@{ name=$VMName; state="Off" } }
  if ($ForcePowerOff) {
    # Explicit request only: equivalent to removing power, may lose data.
    Stop-VM -Name $VMName -TurnOff -Force -ErrorAction Stop
  } else {
    # Stop-VM sem flags solicita shutdown via o SO convidado.
    # -Shutdown NAO e parametro do cmdlet Hyper-V no Windows PowerShell 5.1.
    # Falhas do servico de integracao do Android devem ser explicitas; nunca desligar
    # a forca sem pedido separado do administrador.
    Stop-VM -Name $VMName -ErrorAction Stop
  }
  return [pscustomobject]@{ name=$VMName; state="Stopping"; forced=[bool]$ForcePowerOff }
}

Export-ModuleMember -Function Test-H2NativeName, Assert-H2NativeName, Test-H2NativeHash, Get-H2NativeRoot, Get-H2NativeDiskPath, Get-H2NativeHostStatus, Assert-H2NativeReady, Get-H2NativeOwnedVm, Get-H2NativeInventory, New-H2NativeVm, New-H2NativeClone, Start-H2NativeVm, Stop-H2NativeVm
