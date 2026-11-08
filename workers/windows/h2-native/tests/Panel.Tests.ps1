# Inspecao estatica EXCLUSIVA do H2 Native. Sem iniciar VMs.
$ErrorActionPreference="Stop"
$path=Join-Path $PSScriptRoot "..\H2NativePanel.ps1"
$tokens=$null
$errors=$null
[Management.Automation.Language.Parser]::ParseFile((Resolve-Path $path).Path,[ref]$tokens,[ref]$errors) | Out-Null
if($errors.Count -gt 0){throw ($errors | Out-String)}
$code=Get-Content -LiteralPath $path -Raw
foreach($required in @('System.Windows.Forms','H2NativeDoctor.ps1','H2NativeIsoBootstrap.ps1',
  'H2NativeInstalledBoot.ps1','H2NativeFirstBoot.ps1','Assert-H2NativeName',
  'Get-H2NativeOwnedVm','H2-Confirm','Stop-H2NativeVm','InstallationCompleted',
  'SEM REDE','VERIFICAR WINDOWS. Nenhuma VM foi iniciada.')){
  if(!$code.Contains($required)){throw "Guarda H2 ausente: $required"}
}
foreach($forbidden in @('Invoke-RestMethod','Invoke-WebRequest','New-VMSwitch',
  'Connect-VMNetworkAdapter','Remove-VM','Remove-Item','adb.exe','emulator.exe')){
  if($code.Contains($forbidden)){throw "Operacao proibida: $forbidden"}
}
Write-Host "PASS - H2 Android Native painel local" -ForegroundColor Green
