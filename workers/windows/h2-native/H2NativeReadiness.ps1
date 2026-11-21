# H2 Android Native - diagnostico SOMENTE LEITURA. Windows PowerShell 5.1.
# Nao instala, nao ativa Hyper-V, nao cria VM, nao conecta a rede.
[CmdletBinding()]
param(
  [switch]$Json,
  [string]$ImagePath = "",
  [string]$ExpectedSha256 = ""
)
$ErrorActionPreference = "Stop"
$moduleFile = Join-Path $PSScriptRoot "H2NativeCore.psm1"
Import-Module $moduleFile -Force -ErrorAction Stop

function Read-H2Cim([string]$ClassName) {
  try { return Get-CimInstance -ClassName $ClassName -ErrorAction Stop }
  catch { return $null }
}
function Read-H2Bool($value) {
  if ($null -eq $value) { return $null }
  return [bool]$value
}
function Round-H2GiB($bytes) {
  if ($null -eq $bytes) { return $null }
  return [Math]::Round(([double]$bytes / 1GB), 1)
}

$hostState = Get-H2NativeHostStatus
$cpu = @(Read-H2Cim "Win32_Processor") | Where-Object { $null -ne $_ } | Select-Object -First 1
$os = Read-H2Cim "Win32_OperatingSystem"
$computer = Read-H2Cim "Win32_ComputerSystem"
$virtualizationEnabled = if ($null -ne $cpu) { Read-H2Bool $cpu.VirtualizationFirmwareEnabled } else { $null }
$slat = if ($null -ne $cpu) { Read-H2Bool $cpu.SecondLevelAddressTranslationExtensions } else { $null }
$extensions = if ($null -ne $cpu) { Read-H2Bool $cpu.VMMonitorModeExtensions } else { $null }
$hypervisorPresent = if ($null -ne $computer) { Read-H2Bool $computer.HypervisorPresent } else { $null }
$totalGb = if ($null -ne $computer) { Round-H2GiB $computer.TotalPhysicalMemory } else { $null }
$freeGb = if ($null -ne $os) { Round-H2GiB ([double]$os.FreePhysicalMemory * 1KB) } else { $null }
$diskFreeGb = $null
try {
  $root = [IO.Path]::GetPathRoot((Get-H2NativeRoot))
  $drive = New-Object System.IO.DriveInfo($root)
  if ($drive.IsReady) { $diskFreeGb = Round-H2GiB $drive.AvailableFreeSpace }
} catch {}

$imageState = [ordered]@{
  provided = ![string]::IsNullOrWhiteSpace($ImagePath)
  exists = $false
  format = $null
  checksumVerified = $false
  checksumStatus = "not_provided"
  bootVerified = $false
}
if ($imageState.provided) {
  if (!(Test-Path -LiteralPath $ImagePath -PathType Leaf)) {
    $imageState.checksumStatus = "file_not_found"
  } elseif ([IO.Path]::GetExtension($ImagePath) -ine ".vhdx") {
    $imageState.checksumStatus = "unsupported_file_type"
  } else {
    $imageState.exists = $true
    $imageState.format = "VHDX"
    if ([string]::IsNullOrWhiteSpace($ExpectedSha256)) {
      $imageState.checksumStatus = "expected_sha256_required"
    } elseif (!(Test-H2NativeHash $ExpectedSha256)) {
      $imageState.checksumStatus = "invalid_sha256"
    } else {
      try {
        $actual = (Get-FileHash -LiteralPath $ImagePath -Algorithm SHA256 -ErrorAction Stop).Hash
        $imageState.checksumVerified = [bool]($actual -ieq $ExpectedSha256)
        $imageState.checksumStatus = if ($imageState.checksumVerified) { "match" } else { "mismatch" }
      } catch {
        $imageState.checksumStatus = "read_failed"
      }
    }
  }
}

$flags = @()
if (!$hostState.windows) {
  $flags += "Somente Windows."
} elseif (!$hostState.editionSupported) {
  $flags += "Hyper-V completo nao disponivel nesta edicao. Precisa de Windows Pro/Enterprise/Education compativel."
}
if (!$hostState.administrator) { $flags += "Para criar ou iniciar VMs, execute como administrador." }
if (!$hostState.hyperVModule) { $flags += "Modulo Hyper-V nao detectado. Este diagnostico nao habilita recursos do Windows." }
if ($hostState.hyperVModule -and !$hostState.hyperVReady) { $flags += "API de gerenciamento Hyper-V ainda indisponivel." }
if ($null -ne $slat -and !$slat -and !$hypervisorPresent) { $flags += "CPU nao informou suporte a SLAT." }
if ($null -ne $virtualizationEnabled -and !$virtualizationEnabled -and !$hypervisorPresent) {
  $flags += "Virtualizacao nao aparece habilitada no firmware."
}
if ($null -ne $freeGb -and $freeGb -lt 6) { $flags += "Pouca RAM livre para um Android de 4 GB; revise antes de iniciar." }
if ($null -ne $diskFreeGb -and $diskFreeGb -lt 30) { $flags += "Pouco espaco livre no disco do H2 Native." }
if (!$imageState.provided) { $flags += "Imagem AOSP UEFI VHDX ainda nao fornecida; nenhuma VM sera criada." }
elseif (!$imageState.checksumVerified) { $flags += "Imagem AOSP ainda nao validada pelo SHA-256." }

$result = [pscustomobject][ordered]@{
  project = "H2 Android Native"
  checkedAtUtc = [datetime]::UtcNow.ToString("o")
  readOnly = $true
  engine = "Windows Hyper-V (sem Android Emulator/ADB)"
  host = [ordered]@{
    edition = $hostState.edition
    windows = [bool]$hostState.windows
    editionSupported = [bool]$hostState.editionSupported
    administrator = [bool]$hostState.administrator
    hyperVModule = [bool]$hostState.hyperVModule
    hyperVReady = [bool]$hostState.hyperVReady
    hypervisorPresent = $hypervisorPresent
    virtualizationFirmwareEnabled = $virtualizationEnabled
    slat = $slat
    vmMonitorModeExtensions = $extensions
    totalRamGb = $totalGb
    freeRamGb = $freeGb
    availableDiskGb = $diskFreeGb
  }
  aospImage = $imageState
  readyToCreateVm = [bool]($hostState.ready -and $imageState.checksumVerified)
  androidBootVerified = $false
  socks5IsolationVerified = $false
  keyboardAndVideoVerified = $false
  warnings = @($flags)
}
if ($Json) {
  $result | ConvertTo-Json -Depth 6
} else {
  Write-Host "H2 ANDROID NATIVE - DIAGNOSTICO SOMENTE LEITURA" -ForegroundColor Cyan
  Write-Host ("Windows: " + $result.host.edition)
  Write-Host ("Hyper-V: " + $(if ($result.host.hyperVReady) { "Pronto" } else { "Nao pronto" }))
  Write-Host ("CPU SLAT: " + [string]$result.host.slat)
  Write-Host ("RAM total/livre: " + [string]$totalGb + " / " + [string]$freeGb + " GB")
  Write-Host ("Disco livre: " + [string]$diskFreeGb + " GB")
  Write-Host ("Imagem AOSP: " + $imageState.checksumStatus)
  Write-Host ("Pronto para criar VM: " + [string]$result.readyToCreateVm)
  foreach ($warning in $result.warnings) { Write-Host ("- " + $warning) -ForegroundColor Yellow }
  Write-Host "Nenhuma configuracao foi modificada."
}
