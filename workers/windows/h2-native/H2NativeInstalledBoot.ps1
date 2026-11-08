# H2 Android Native - etapa 3: primeiro boot do disco apos instalar pela ISO.
# Script exclusivamente local e OFFLINE; nao altera outras VMs, rotas ou proxies.
# Default Inspect sem nome apenas diagnostica o host. Nao presume Android instalado.
[CmdletBinding()]
param(
  [ValidateSet("Inspect", "SwitchToDisk", "RestoreInstaller", "Start", "Console", "Stop")]
  [string]$Action = "Inspect",
  [string]$VMName = "",
  [switch]$InstallationCompleted,
  [switch]$Json
)
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "H2NativeCore.psm1") -Force -ErrorAction Stop

function Write-H2InstalledResult {
  param([Parameter(Mandatory=$true)]$Value)
  if ($Json) { $Value | ConvertTo-Json -Depth 6 }
  else { $Value | Format-List | Out-String | Write-Output }
}
function Get-H2InstalledState {
  param([Parameter(Mandatory=$true)][string]$Name)
  # Em qualquer acao com VM, aplicar ownership antes de acessar qualquer configuracao.
  Assert-H2NativeName $Name
  Assert-H2NativeReady
  $vm = Get-H2NativeOwnedVm $Name
  $diskPath = Get-H2NativeDiskPath $Name
  $manifestPath = Join-Path (Split-Path $diskPath -Parent) "manifest.json"
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop | ConvertFrom-Json
  $mode = [string]$manifest.mode
  if ($mode -cnotin @("ISO_INSTALLER", "DISK_FIRST_BOOT")) {
    throw "Esta VM H2 nao pertence ao fluxo de instalacao ISO. Nenhuma alteracao."
  }
  $disks = @(Get-VMHardDiskDrive -VMName $Name -ErrorAction Stop)
  if ($disks.Count -ne 1) { throw "A VM deve ter exatamente um disco exclusivo do H2." }
  if (![string]::Equals([IO.Path]::GetFullPath([string]$disks[0].Path),
      [IO.Path]::GetFullPath($diskPath), [StringComparison]::OrdinalIgnoreCase)) {
    throw "Caminho do disco divergente do H2. Operacao recusada."
  }
  $diskInfo = Get-VHD -Path $diskPath -ErrorAction Stop
  if ([string]$diskInfo.VhdType -ne "Dynamic" -or [string]$diskInfo.VhdFormat -ne "VHDX") {
    throw "Disco do instalador H2 deve ser VHDX dinamico."
  }
  $dvds = @(Get-VMDvdDrive -VMName $Name -ErrorAction Stop)
  if ($dvds.Count -ne 1) { throw "Esperado exatamente um DVD exclusivo da VM H2." }
  $adapters = @(Get-VMNetworkAdapter -VMName $Name -ErrorAction Stop)
  $connected = @($adapters | Where-Object {
    ![string]::IsNullOrWhiteSpace([string]$_.SwitchName)
  })
  if ($connected.Count -gt 0) {
    throw "VM tem rede conectada. Operacao bloqueada ate validar proxy isolado."
  }
  $isoPath = [string]$manifest.imagePath
  if ([string]::IsNullOrWhiteSpace($isoPath) -or
      [IO.Path]::GetExtension($isoPath) -ine ".iso" -or
      !(Test-H2NativeHash ([string]$manifest.imageSha256))) {
    throw "Manifesto de midia ISO do H2 invalido."
  }
  if ($mode -ceq "ISO_INSTALLER") {
    if (!(Test-Path -LiteralPath $isoPath -PathType Leaf)) {
      throw "ISO de instalacao nao encontrada. Nenhuma modificacao."
    }
    $digest = (Get-FileHash -LiteralPath $isoPath -Algorithm SHA256 -ErrorAction Stop).Hash
    if ($digest -ine [string]$manifest.imageSha256) {
      throw "A ISO mudou desde a preparacao; operacao recusada."
    }
    if ([string]::IsNullOrWhiteSpace([string]$dvds[0].Path) -or
        ![string]::Equals([IO.Path]::GetFullPath([string]$dvds[0].Path),
          [IO.Path]::GetFullPath($isoPath), [StringComparison]::OrdinalIgnoreCase)) {
      throw "DVD da VM nao corresponde a ISO original."
    }
  } else {
    if (![string]::IsNullOrWhiteSpace([string]$dvds[0].Path)) {
      throw "Boot pelo disco exige DVD sem midia. Nenhum comando enviado."
    }
  }
  return [pscustomobject]@{
    VM = $vm
    Manifest = $manifest
    ManifestPath = $manifestPath
    Mode = $mode
    Disk = $disks[0]
    Dvd = $dvds[0]
    IsoPath = $isoPath
    SecureBoot = [string](Get-VMFirmware -VMName $Name -ErrorAction Stop).SecureBoot
  }
}
function Save-H2InstalledManifest {
  param([Parameter(Mandatory=$true)]$Context, [string]$Mode)
  # Atualiza unicamente o manifesto de ownership desta VM; nao altera outros sistemas.
  $manifest = $Context.Manifest
  $manifest.mode = $Mode
  $manifest | Add-Member -NotePropertyName diskPhaseUpdatedUtc -NotePropertyValue ([datetime]::UtcNow.ToString("o")) -Force
  $manifest | ConvertTo-Json -Depth 6 |
    Set-Content -LiteralPath $Context.ManifestPath -Encoding UTF8 -ErrorAction Stop
}
function Get-H2InstalledAudit {
  param([Parameter(Mandatory=$true)]$Context)
  $vm = $Context.VM
  $mode = $Context.Mode
  return [pscustomobject][ordered]@{
    project = "H2 Android Native"
    phase = $mode
    name = $vm.Name
    hostState = [string]$vm.State
    firmwareSecureBoot = $Context.SecureBoot
    isoAttached = ($mode -ceq "ISO_INSTALLER")
    diskPath = [string]$Context.Disk.Path
    networkConnected = $false
    readyForOfflineBootAttempt = $true
    androidBootVerified = $false
    installedAndroidVerified = $false
    playStoreVerified = $false
    proxyVerified = $false
    nextStep = $(if ($mode -ceq "ISO_INSTALLER") {
      "Instale o Android na console; desligue a VM; depois SwitchToDisk com confirmacao."
    } else {
      "Inicie pelo disco H2 e confirme o Android visualmente na console."
    })
  }
}

if ([string]::IsNullOrWhiteSpace($VMName)) {
  if ($Action -ne "Inspect") { throw "Informe -VMName H2N_001 para esta acao." }
  $hostStatus = Get-H2NativeHostStatus
  Write-H2InstalledResult ([pscustomobject]@{
    project = "H2 Android Native"
    action = "Read-only host inspection"
    host = $hostStatus
    androidBootVerified = $false
    nextStep = "Verifique Hyper-V, ISO Android x86_64 UEFI e primeiro boot H2N_001."
  })
  return
}
Assert-H2NativeName $VMName
$ctx = Get-H2InstalledState -Name $VMName

switch ($Action) {
  "Inspect" {
    Write-H2InstalledResult (Get-H2InstalledAudit -Context $ctx)
  }
  "SwitchToDisk" {
    # Confirmacao EXPLICITA: nao ha modo confiavel de detectar o Android instalado pelo host.
    if (!$InstallationCompleted) {
      throw "Requer -InstallationCompleted. Confirme que instalou o Android no disco antes de ejetar a ISO."
    }
    if ($ctx.Mode -cne "ISO_INSTALLER") {
      throw "Esta VM H2 ja esta na etapa de boot pelo disco."
    }
    if ([string]$ctx.VM.State -ne "Off") {
      throw "Desligue a VM antes de mudar o dispositivo de boot."
    }
    $updated = $false
    try {
      # Alterar SOMENTE os dispositivos desta VM H2 (Microsoft Hyper-V).
      Set-VMFirmware -VMName $VMName -FirstBootDevice $ctx.Disk -ErrorAction Stop
      $updated = $true
      Set-VMDvdDrive -VMDvdDrive $ctx.Dvd -Path $null -ErrorAction Stop | Out-Null
      $dvdAfter = @(Get-VMDvdDrive -VMName $VMName -ErrorAction Stop)
      if ($dvdAfter.Count -ne 1 -or
          ![string]::IsNullOrWhiteSpace([string]$dvdAfter[0].Path)) {
        throw "Nao foi possivel confirmar ISO ejetada."
      }
      Save-H2InstalledManifest -Context $ctx -Mode "DISK_FIRST_BOOT"
    } catch {
      $message = $_.Exception.Message
      if ($updated) {
        # Recuperacao para modo instalador sem apagar disco. Se falhar, deixar sinalizado.
        try {
          Set-VMDvdDrive -VMDvdDrive $ctx.Dvd -Path $ctx.IsoPath -ErrorAction Stop | Out-Null
          $dvdRestore = @(Get-VMDvdDrive -VMName $VMName -ErrorAction Stop)
          if ($dvdRestore.Count -ne 1) { throw "DVD de recuperacao ausente." }
          Set-VMFirmware -VMName $VMName -FirstBootDevice $dvdRestore[0] -ErrorAction Stop
        } catch {
          throw "Transicao interrompida; execute Inspect e verifique a VM H2 antes de reiniciar. Erro: $message"
        }
      }
      throw $message
    }
    $ctx = Get-H2InstalledState -Name $VMName
    Write-H2InstalledResult (Get-H2InstalledAudit -Context $ctx)
  }
  "RestoreInstaller" {
    if ($ctx.Mode -cne "DISK_FIRST_BOOT") {
      throw "A VM ja esta no modo instalador; nada a restaurar."
    }
    if ([string]$ctx.VM.State -ne "Off") {
      throw "Desligue a VM antes de reanexar a ISO."
    }
    if (!(Test-Path -LiteralPath $ctx.IsoPath -PathType Leaf)) {
      throw "ISO original ausente; restaure a midia conhecida antes de continuar."
    }
    $digest = (Get-FileHash -LiteralPath $ctx.IsoPath -Algorithm SHA256 -ErrorAction Stop).Hash
    if ($digest -ine [string]$ctx.Manifest.imageSha256) {
      throw "ISO alterada. Recuperacao bloqueada."
    }
    $updated = $false
    try {
      Set-VMDvdDrive -VMDvdDrive $ctx.Dvd -Path $ctx.IsoPath -ErrorAction Stop | Out-Null
      $updated = $true
      $dvdAfter = @(Get-VMDvdDrive -VMName $VMName -ErrorAction Stop)
      if ($dvdAfter.Count -ne 1 -or
          [string]::IsNullOrWhiteSpace([string]$dvdAfter[0].Path)) {
        throw "DVD de recuperacao nao confirmou a ISO."
      }
      Set-VMFirmware -VMName $VMName -FirstBootDevice $dvdAfter[0] -ErrorAction Stop
      Save-H2InstalledManifest -Context $ctx -Mode "ISO_INSTALLER"
    } catch {
      $message = $_.Exception.Message
      if ($updated) {
        try {
          Set-VMFirmware -VMName $VMName -FirstBootDevice $ctx.Disk -ErrorAction Stop
          $dvdRollback = @(Get-VMDvdDrive -VMName $VMName -ErrorAction Stop)
          if ($dvdRollback.Count -ne 1) { throw "DVD de rollback ausente." }
          Set-VMDvdDrive -VMDvdDrive $dvdRollback[0] -Path $null -ErrorAction Stop | Out-Null
        } catch {
          throw "Recuperacao incompleta; execute Inspect e confira a VM antes de tentar iniciar. Erro: $message"
        }
      }
      throw $message
    }
    $ctx = Get-H2InstalledState -Name $VMName
    Write-H2InstalledResult (Get-H2InstalledAudit -Context $ctx)
  }
  "Start" {
    if ($ctx.Mode -cne "DISK_FIRST_BOOT") {
      throw "Instalador ainda anexado. Use H2NativeIsoBootstrap.ps1 para instalar Android."
    }
    Write-H2InstalledResult (Start-H2NativeVm -VMName $VMName)
  }
  "Console" {
    if ($ctx.Mode -cne "DISK_FIRST_BOOT" -or [string]$ctx.VM.State -ne "Running") {
      throw "Primeiro prepare boot pelo disco e inicie esta VM H2."
    }
    $viewer = Join-Path $env:WINDIR "System32\vmconnect.exe"
    if (!(Test-Path -LiteralPath $viewer -PathType Leaf)) {
      throw "VMConnect nativo do Windows indisponivel."
    }
    Start-Process -FilePath $viewer -ArgumentList @("localhost",$VMName) -ErrorAction Stop | Out-Null
    Write-H2InstalledResult ([pscustomobject]@{
      name = $VMName
      console = "Windows Hyper-V VMConnect"
      networkConnected = $false
      androidBootVerified = $false
      note = "Veja na tela se o Android realmente inicia; VM Running nao comprova boot."
    })
  }
  "Stop" {
    Write-H2InstalledResult (Stop-H2NativeVm -VMName $VMName)
  }
}
