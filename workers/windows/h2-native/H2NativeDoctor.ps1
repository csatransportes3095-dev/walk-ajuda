# H2 Android Native - diagnostico central do primeiro boot (Windows PowerShell 5.1).
# Somente leitura do host e das VMs H2. Nunca instala, inicia, cria ou altera VMs.
# Ao informar -IsoPath, monta a ISO temporariamente em leitura para examinar arquivos.
[CmdletBinding()]
param(
  [string]$VMName = "",
  [string]$IsoPath = "",
  [string]$ExpectedSha256 = "",
  [switch]$Json
)
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "H2NativeCore.psm1") -Force -ErrorAction Stop

function Read-H2JsonScript {
  param([string]$Path, [string[]]$Arguments)
  $raw = & $Path @Arguments
  if ($null -eq $raw) { throw "Diagnostico H2 nao retornou relatorio." }
  return (($raw | Out-String) | ConvertFrom-Json -ErrorAction Stop)
}
function Format-H2Check {
  param([bool]$Ok)
  if ($Ok) { return "OK" }
  return "PENDENTE"
}

$hostData = Read-H2JsonScript -Path (Join-Path $PSScriptRoot "H2NativeReadiness.ps1") -Arguments @("-Json")
$media = $null
$vm = $null
$warnings = @()
$action = "Inspecionar Windows e Hyper-V"

if (!$hostData.host.editionSupported) {
  $warnings += "Este Windows nao informou edicao compativel com Hyper-V completo."
}
if (!$hostData.host.hyperVReady) {
  $warnings += "Hyper-V do computador ainda nao esta pronto para criar ou iniciar VMs."
}
if ($null -ne $hostData.host.freeRamGb -and [double]$hostData.host.freeRamGb -lt 6) {
  $warnings += "RAM livre inferior a 6 GB. Instancia Android configurada com 4 GB."
}
if ($null -ne $hostData.host.availableDiskGb -and [double]$hostData.host.availableDiskGb -lt 12) {
  $warnings += "Disco livre inferior a 12 GB; nova instalacao nao deve comecar."
}

if (![string]::IsNullOrWhiteSpace($IsoPath) -or
    ![string]::IsNullOrWhiteSpace($ExpectedSha256)) {
  if ([string]::IsNullOrWhiteSpace($IsoPath) -or
      [string]::IsNullOrWhiteSpace($ExpectedSha256)) {
    $warnings += "Para validar ISO, informe -IsoPath e -ExpectedSha256 juntos."
  } else {
    try {
      # Esta e a unica verificacao opcional que monta uma ISO; o script de midia
      # desmonta somente imagens montadas por ele, sempre com finally.
      $media = Read-H2JsonScript -Path (Join-Path $PSScriptRoot "H2NativeIsoBootstrap.ps1") -Arguments @(
        "-Action", "CheckMedia", "-IsoPath", $IsoPath,
        "-ExpectedSha256", $ExpectedSha256, "-Json"
      )
      if (!$media.readyForOfflineInstallAttempt) {
        $warnings += "A ISO nao confirmou o boot UEFI e o payload Android-x86."
      }
    } catch {
      $warnings += "ISO nao validada: " + $_.Exception.Message
      $media = [pscustomobject]@{ readyForOfflineInstallAttempt = $false; validationError = $true }
    }
  }
}

if (![string]::IsNullOrWhiteSpace($VMName)) {
  Assert-H2NativeName $VMName
  try {
    # Os scripts chamados validam o identificador/manifesto antes de ler a VM.
    $owned = Get-H2NativeOwnedVm -VMName $VMName
    $manifest = Get-Content -LiteralPath (Join-Path
      (Split-Path (Get-H2NativeDiskPath $VMName) -Parent) "manifest.json") -Raw -ErrorAction Stop |
      ConvertFrom-Json -ErrorAction Stop
    $mode = [string]$manifest.mode
    if ($mode -ceq "ISO_INSTALLER") {
      $vm = Read-H2JsonScript -Path (Join-Path $PSScriptRoot "H2NativeIsoBootstrap.ps1") -Arguments @(
        "-Action", "Audit", "-VMName", $VMName, "-Json"
      )
    } elseif ($mode -ceq "DISK_FIRST_BOOT") {
      $vm = Read-H2JsonScript -Path (Join-Path $PSScriptRoot "H2NativeInstalledBoot.ps1") -Arguments @(
        "-Action", "Inspect", "-VMName", $VMName, "-Json"
      )
    } else {
      $vm = Read-H2JsonScript -Path (Join-Path $PSScriptRoot "H2NativeBootAudit.ps1") -Arguments @(
        "-VMName", $VMName, "-Json"
      )
    }
  } catch {
    $warnings += "A VM H2 selecionada nao passou na auditoria de propriedade, imagem ou rede: " + $_.Exception.Message
    $vm = [pscustomobject]@{ vmName = $VMName; auditPassed = $false }
  }
}

$bootReady = $false
if ($null -ne $vm) {
  $bootReady = [bool]($vm.safeToAttemptOfflineBoot -or $vm.readyForOfflineBootAttempt)
  if (!$bootReady) {
    $warnings += "Primeiro boot bloqueado: verificacao da VM H2 ainda nao passou."
  }
}

if (!$hostData.host.hyperVReady) {
  $action = "Verificar edicao do Windows, virtualizacao de CPU e Hyper-V"
} elseif ([string]::IsNullOrWhiteSpace($VMName)) {
  if ($null -ne $media -and $media.readyForOfflineInstallAttempt) {
    $action = "Confirmar compatibilidade real da imagem no Hyper-V antes de criar uma VM H2"
  } else {
    $action = "Validar uma ISO Android x86_64 UEFI com SHA-256 ou informar -VMName para auditar a VM H2 existente"
  }
} elseif (!$bootReady) {
  $action = "Corrigir a auditoria da VM H2; nao iniciar com rede ou disco inconsistente"
} else {
  $action = "Abrir o console offline da VM H2 e confirmar visualmente se Android inicializa"
}

$result = [pscustomobject][ordered]@{
  project = "H2 Android Native"
  checkedAtUtc = [datetime]::UtcNow.ToString("o")
  readOnly = $true
  windowsModified = $false
  siteRoutesModified = $false
  androidStudioRequired = $false
  androidBootVerified = $false
  proxyIsolationVerified = $false
  host = $hostData.host
  iso = $media
  ownedVm = $vm
  readyToAttemptOfflineBoot = [bool]($hostData.host.hyperVReady -and $bootReady)
  warnings = @($warnings)
  nextStep = $action
}

if ($Json) {
  $result | ConvertTo-Json -Depth 8
} else {
  Write-Host "H2 ANDROID INDEPENDENTE - DIAGNOSTICO" -ForegroundColor Cyan
  Write-Host ("Windows: " + [string]$hostData.host.edition)
  Write-Host ("Hyper-V: " + (Format-H2Check ([bool]$hostData.host.hyperVReady)))
  Write-Host ("RAM total/livre: " + [string]$hostData.host.totalRamGb +
    " / " + [string]$hostData.host.freeRamGb + " GB")
  Write-Host ("Disco livre: " + [string]$hostData.host.availableDiskGb + " GB")
  Write-Host ("ISO Android: " + $(if ($null -eq $media) { "NAO INFORMADA" }
    else { Format-H2Check ([bool]$media.readyForOfflineInstallAttempt) }))
  Write-Host ("VM H2: " + $(if ([string]::IsNullOrWhiteSpace($VMName)) { "NAO INFORMADA" }
    else { $VMName + " / " + (Format-H2Check $bootReady) }))
  Write-Host "Android inicializado: NAO VERIFICADO" -ForegroundColor Yellow
  foreach ($warning in $warnings) { Write-Host ("ATENCAO: " + $warning) -ForegroundColor Yellow }
  Write-Host ("PROXIMO PASSO: " + $action) -ForegroundColor Cyan
  Write-Host "Nenhum arquivo, configuracao, maquina virtual ou rede foi alterado."
}
