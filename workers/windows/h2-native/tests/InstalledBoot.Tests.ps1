# Etapa 3: testes offline de seguranca. Nao cria/inicia VM nem altera Windows.
$ErrorActionPreference = "Stop"
$path = Join-Path $PSScriptRoot "..\H2NativeInstalledBoot.ps1"
$tokens = $null
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $path).Path,
  [ref]$tokens, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count -gt 0) { throw ($parseErrors | Out-String) }
$source = Get-Content -LiteralPath $path -Raw
foreach ($expected in @(
  'Get-H2NativeOwnedVm', 'Assert-H2NativeName', 'Get-H2NativeDiskPath',
  'Get-VMDvdDrive', 'Get-FileHash', 'Get-VMNetworkAdapter',
  'Set-VMFirmware', 'Set-VMDvdDrive', 'SwitchToDisk',
  'RestoreInstaller', 'InstallationCompleted', 'androidBootVerified = $false',
  'DISK_FIRST_BOOT', 'ISO_INSTALLER'
)) {
  if (!$source.Contains($expected)) { throw "Guarda ausente: $expected" }
}
foreach ($forbidden in @(
  "Invoke-RestMethod", "Invoke-WebRequest", "Connect-VMNetworkAdapter",
  "New-VMSwitch", "emulator.exe", "adb.exe", "Remove-VM", "Remove-VHD"
)) {
  if ($source.Contains($forbidden)) { throw "Acao proibida: $forbidden" }
}
if (!$source.Contains('[string]$Action = "Inspect"')) { throw "Padrao deve ser Inspecionar." }
$info = & $path -Action Inspect -Json | ConvertFrom-Json
if ($info.androidBootVerified -ne $false) { throw "Nao se deve declarar Android inicializado." }
if ($info.project -ne "H2 Android Native") { throw "Projeto incorreto." }
foreach ($action in @("SwitchToDisk", "RestoreInstaller", "Start", "Console", "Stop")) {
  $blocked = $false
  try { & $path -Action $action -VMName "H2ADS_001" -InstallationCompleted | Out-Null }
  catch { $blocked = $true }
  if (!$blocked) { throw "Acao $action aceitou nome externo ao H2." }
}
Write-Host "PASS - H2 Android Native disk boot guards" -ForegroundColor Green
