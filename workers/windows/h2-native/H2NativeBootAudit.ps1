# H2 Android Native - auditoria do boot. Somente leitura, sem iniciar VMs.
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$VMName,[switch]$Json)
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "H2NativeCore.psm1") -Force -ErrorAction Stop
Assert-H2NativeName $VMName
$hostStatus = Get-H2NativeHostStatus
if (!$hostStatus.ready) { throw $hostStatus.reason }
$vm = Get-H2NativeOwnedVm $VMName
$disk = @(Get-VMHardDiskDrive -VMName $VMName -ErrorAction Stop)
$firmware = Get-VMFirmware -VMName $VMName -ErrorAction Stop
$adapters = @(Get-VMNetworkAdapter -VMName $VMName -ErrorAction Stop)
$networkConnected = @($adapters | Where-Object {
  ![string]::IsNullOrWhiteSpace([string]$_.SwitchName)
}).Count -gt 0
$diskExists = Test-Path -LiteralPath ([string]$disk[0].Path) -PathType Leaf
$diskInfo = $null
if ($diskExists) {
  try { $diskInfo = Get-VHD -Path ([string]$disk[0].Path) -ErrorAction Stop } catch {}
}
$manifestPath = Join-Path (Split-Path ([string]$disk[0].Path) -Parent) "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop | ConvertFrom-Json
$basePath = [string]$manifest.imagePath
$baseExists = ![string]::IsNullOrWhiteSpace($basePath) -and
  (Test-Path -LiteralPath $basePath -PathType Leaf)
$parentPath = if ($null -ne $diskInfo) { [string]$diskInfo.ParentPath } else { "" }
$parentMatches = $false
if ($baseExists -and ![string]::IsNullOrWhiteSpace($parentPath)) {
  $parentMatches = [string]::Equals(
    [IO.Path]::GetFullPath($parentPath),
    [IO.Path]::GetFullPath($basePath),
    [StringComparison]::OrdinalIgnoreCase)
}
$diskConsistent = $diskExists -and $baseExists -and $parentMatches -and
  ($null -ne $diskInfo) -and ([string]$diskInfo.VhdType -eq "Differencing")
$hostOnlyReady = $hostStatus.ready -and $diskConsistent -and !$networkConnected
$warnings = @()
if (!$diskExists) { $warnings += "Disco da VM nao encontrado." }
if (!$baseExists) { $warnings += "Imagem AOSP base nao encontrada no caminho original." }
if (!$parentMatches) { $warnings += "Parent VHDX diferente do manifesto; bloqueie inicializacao." }
if ($networkConnected) { $warnings += "VM conectada a switch; SOCKS5 ainda nao validado." }
if ([string]$vm.State -eq "Running") {
  $warnings += "VM em execucao nao comprova Android inicializado. Verifique console."
}
if ([string]$firmware.SecureBoot -eq "On") {
  $warnings += "Secure Boot ligado exige bootloader AOSP UEFI assinado."
}
$result = [pscustomobject][ordered]@{
  project = "H2 Android Native"
  checkedAtUtc = [datetime]::UtcNow.ToString("o")
  readOnly = $true
  vmName = $VMName
  vmId = $vm.Id.ToString()
  hyperVState = [string]$vm.State
  generation = [int]$vm.Generation
  secureBoot = [string]$firmware.SecureBoot
  networkConnected = [bool]$networkConnected
  diskExists = [bool]$diskExists
  parentDiskPresent = [bool]$baseExists
  parentDiskMatchesManifest = [bool]$parentMatches
  diskConsistent = [bool]$diskConsistent
  safeToAttemptOfflineBoot = [bool]$hostOnlyReady
  androidBootVerified = $false
  playStoreVerified = $false
  socks5Verified = $false
  videoKeyboardVerified = $false
  warnings = @($warnings)
  nextValidation = "Confirmar Android no console Hyper-V; VM Running nao comprova boot."
}
if ($Json) {
  $result | ConvertTo-Json -Depth 5
} else {
  Write-Host "H2 NATIVE - AUDITORIA BOOT (SOMENTE LEITURA)" -ForegroundColor Cyan
  Write-Host ("Instancia: " + $VMName + " | Hyper-V: " + $result.hyperVState)
  Write-Host ("UEFI Secure Boot: " + $result.secureBoot)
  Write-Host ("Disco VHDX consistente: " + $result.diskConsistent)
  Write-Host ("Rede isolada: " + (!$result.networkConnected))
  Write-Host ("Preparado para teste offline: " + $result.safeToAttemptOfflineBoot)
  Write-Host "ANDROID INICIALIZADO: NAO VERIFICADO"
  foreach ($w in $warnings) { Write-Host ("- " + $w) -ForegroundColor Yellow }
  Write-Host "Nenhuma configuracao foi modificada."
}
