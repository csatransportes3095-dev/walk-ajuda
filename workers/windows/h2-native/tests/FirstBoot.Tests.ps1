# Testes do primeiro boot H2. Nenhuma VM criada/ligada durante os testes.
$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $PSScriptRoot "..\H2NativeFirstBoot.ps1"
$tokens = $null
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path $scriptPath).Path, [ref]$tokens, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count -gt 0) { throw ($parseErrors | Out-String) }
$code = Get-Content -LiteralPath $scriptPath -Raw
foreach ($forbidden in @("Invoke-RestMethod","Invoke-WebRequest","Connect-VMNetworkAdapter","New-VMSwitch","adb.exe","emulator.exe","Android Studio")) {
  if ($code.Contains($forbidden) -and $forbidden -ne "Android Studio") {
    throw "Operacao/engine proibida detectada: $forbidden"
  }
}
if (!$code.Contains('[string]$Action = "Host"')) { throw "Acao padrao deve ser somente leitura." }
if (!$code.Contains("Assert-H2NativeOfflineAudit")) { throw "Guard de boot offline ausente." }
if (!$code.Contains("Get-H2NativeOwnedVm")) { throw "Guard de ownership do console ausente." }
$hostJson = & $scriptPath -Action Host -Json
$hostReport = $hostJson | ConvertFrom-Json
if (!$hostReport.readOnly) { throw "Diagnostico deve ser somente leitura." }
if ($hostReport.androidBootVerified) { throw "Nunca declarar boot do Android sem guest validado." }
if ($hostReport.socks5IsolationVerified) { throw "Nunca declarar SOCKS5 validado antes do teste real." }
foreach ($action in @("Audit","Start","Console","Stop","Create")) {
  $rejected = $false
  try { & $scriptPath -Action $action -VMName "H2ADS_001" | Out-Null } catch { $rejected = $true }
  if (!$rejected) { throw "Aceitou nome de VM externa na acao $action" }
}
Write-Host "PASS - H2 Android Native first-boot offline safety tests" -ForegroundColor Green
