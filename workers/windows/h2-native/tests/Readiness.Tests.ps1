# Guardas do diagnostico: sem instalacao e sem operacao em VMs.
$ErrorActionPreference = "Stop"
$scriptFile = Join-Path $PSScriptRoot "..\H2NativeReadiness.ps1"
$tokens = $null
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path $scriptFile).Path, [ref]$tokens, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count -gt 0) { throw ("Erro de sintaxe: " + ($parseErrors | Out-String)) }
$jsonText = & $scriptFile -Json
$data = $jsonText | ConvertFrom-Json
if (!$data.readOnly) { throw "Diagnostico precisa ser somente leitura." }
if ($data.project -ne "H2 Android Native") { throw "Projeto incorreto." }
if ($data.readyToCreateVm) { throw "Nao aceitar VM sem VHDX AOSP e hash verificado." }
if ($data.androidBootVerified) { throw "Nao prometer boot sem teste real." }
if ($data.socks5IsolationVerified) { throw "Nao prometer SOCKS5 sem validacao." }
if ($data.keyboardAndVideoVerified) { throw "Nao prometer video sem validacao." }
$source = Get-Content -LiteralPath $scriptFile -Raw
foreach ($forbidden in @("Enable-WindowsOptionalFeature","Set-VM","New-VM","Start-VM","Stop-VM","Invoke-RestMethod","emulator.exe","adb.exe")) {
  if ($source.Contains($forbidden)) { throw "Diagnostico contem acao proibida: $forbidden" }
}
Write-Host "PASS - H2 Native readiness is read-only" -ForegroundColor Green
