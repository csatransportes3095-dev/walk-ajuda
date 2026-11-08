# Testes EXCLUSIVOS do diagnostico H2. Sem alterar Windows ou outras VMs.
$ErrorActionPreference = "Stop"
$path = Join-Path $PSScriptRoot "..\H2NativeDoctor.ps1"
$tokens = $null
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path $path).Path, [ref]$tokens, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count -gt 0) { throw ($parseErrors | Out-String) }
$code = Get-Content -LiteralPath $path -Raw
foreach ($required in @(
  'H2NativeReadiness.ps1', 'H2NativeIsoBootstrap.ps1',
  'H2NativeInstalledBoot.ps1', 'H2NativeBootAudit.ps1',
  'Get-H2NativeOwnedVm', 'Assert-H2NativeName',
  'androidBootVerified = $false', 'readOnly = $true',
  'readyToAttemptOfflineBoot', 'siteRoutesModified = $false'
)) {
  if (!$code.Contains($required)) { throw "Controle H2 ausente: $required" }
}
foreach ($forbidden in @(
  'New-VM', 'Start-VM', 'Stop-VM', 'Set-VM', 'Remove-VM',
  'Connect-VMNetworkAdapter', 'New-VMSwitch',
  'Invoke-RestMethod', 'Invoke-WebRequest', 'adb.exe', 'emulator.exe'
)) {
  if ($code.Contains($forbidden)) { throw "Diagnostico incluiu comando proibido: $forbidden" }
}
$data = & $path -Json | ConvertFrom-Json
if (!$data.readOnly -or !$data.siteRoutesModified -eq $false) {
  throw "Diagnostico deve ser read-only e nao modificar outras rotas."
}
if ($data.androidBootVerified -or $data.proxyIsolationVerified) {
  throw "Nao anunciar boot ou isolamento sem testes reais."
}
$rejected = $false
try { & $path -VMName "H2ADS_001" -Json | Out-Null }
catch { $rejected = $true }
if (!$rejected) { throw "Nao rejeitou VM pertencente a outro sistema." }
Write-Host "PASS - H2 Android Native Doctor diagnostics" -ForegroundColor Green
