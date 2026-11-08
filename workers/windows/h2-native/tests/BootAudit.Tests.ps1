# Static safety test. Does not start a VM.
$ErrorActionPreference = "Stop"
$path = Join-Path $PSScriptRoot "..\H2NativeBootAudit.ps1"
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path $path).Path, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { throw ($errors | Out-String) }
$content = Get-Content -LiteralPath $path -Raw
foreach ($forbidden in @(
  "Start-VM", "Stop-VM", "New-VM", "Set-VM", "Connect-VMNetworkAdapter",
  "Invoke-RestMethod", "Invoke-WebRequest", "emulator.exe", "adb.exe")) {
  if ($content.Contains($forbidden)) { throw "Mutating command: $forbidden" }
}
if (!$content.Contains("Get-H2NativeOwnedVm")) { throw "Ownership guard missing" }
if (!$content.Contains('androidBootVerified = $false')) { throw "Cannot assert boot" }
if (!$content.Contains("networkConnected")) { throw "Network isolation guard missing" }
Write-Host "PASS - H2 Native offline boot audit is read-only" -ForegroundColor Green
