# Testes EXCLUSIVOS da instalacao ISO H2. Nao cria VM nem monta ISO.
$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $PSScriptRoot "..\H2NativeIsoBootstrap.ps1"
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $scriptPath).Path, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { throw ($errors | Out-String) }
$code = Get-Content -LiteralPath $scriptPath -Raw
foreach ($required in @(
  'EFI\BOOT\BOOTX64.EFI', 'Get-FileHash', 'Mount-DiskImage', 'Dismount-DiskImage',
  'Get-H2NativeOwnedVm', 'New-VHD', 'Add-VMDvdDrive', 'Disconnect-VMNetworkAdapter',
  'networkConnected = $false', 'androidBootVerified = $false', 'readyForOfflineBootAttempt'
)) {
  if (!$code.Contains($required)) { throw "Controle de instalacao ausente: $required" }
}
foreach ($forbidden in @("Invoke-RestMethod","Invoke-WebRequest","New-VMSwitch","Connect-VMNetworkAdapter","adb.exe","emulator.exe")) {
  if ($code.Contains($forbidden)) { throw "Acao proibida encontrada: $forbidden" }
}
# A ISO deve conter Android real, nao apenas um executavel EFI de outro sistema.
foreach ($required in @(
  'Inspect-H2IsoMediaFiles', 'androidPayloadFound', 'androidLayout',
  'initrd.img', 'system.sfs', 'system.img',
  '$hasKernel -and $hasInitrd -and $hasSystem',
  '$scan.efiBootX64Found -and $scan.androidPayloadFound'
)) {
  if (!$code.Contains($required)) { throw "Guarda de payload Android ausente: $required" }
}
if (!$code.Contains('[string]$Action = "CheckHost"')) { throw "Acao padrao precisa ser somente leitura." }
$report = & $scriptPath -Action CheckHost -Json | ConvertFrom-Json
if (!$report.readOnly -or $report.androidBootVerified) { throw "Diagnostico deve ser somente leitura e nao afirmar boot." }
$bad = $false
try { & $scriptPath -Action Prepare -VMName H2ADS_001 -IsoPath C:\does-not-exist.iso -ExpectedSha256 ("a" * 64) | Out-Null } catch { $bad = $true }
if (!$bad) { throw "Preparacao deveria rejeitar nome de VM nao pertencente ao H2." }
Write-Host "PASS - H2 Native ISO bootstrap checks (sem alterar VMs)" -ForegroundColor Green
