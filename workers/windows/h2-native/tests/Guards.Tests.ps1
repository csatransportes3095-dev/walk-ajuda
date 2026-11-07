$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\H2NativeCore.psm1") -Force
function Assert-True([bool]$condition,[string]$message) { if (!$condition) { throw "FAIL: $message" } }
Assert-True (Test-H2NativeName "H2N_001") "accept first VM"
Assert-True (Test-H2NativeName "H2N_999") "accept last VM"
foreach ($name in @("H2N_0000","H2N_01","H2Android_01","H2ADS_001","../foo","H2N_123;Remove-Item","")) {
  Assert-True (!(Test-H2NativeName $name)) "reject unsafe name"
}
Assert-True (Test-H2NativeHash ("a" * 64)) "accept SHA256"
foreach ($hash in @("1234",("z" * 64),"")) { Assert-True (!(Test-H2NativeHash $hash)) "reject invalid SHA256" }
$status = Get-H2NativeHostStatus
Assert-True ($status.engine -eq "H2 Native / Windows Hyper-V") "native only"
Assert-True (!$status.installsExternalEmulator) "no external emulator"
Assert-True (!$status.networkEnabledByDefault) "network disabled by default"
Assert-True (!$status.modifiesExistingAndroid) "isolate original system"
$failed = $false
try { Start-H2NativeVm -VMName "H2ADS_001" | Out-Null } catch { $failed = $true }
Assert-True $failed "reject foreign VM before touching host"
Write-Host "PASS - H2 Native guard and diagnostics tests" -ForegroundColor Green
