# H2 Android Native - verificacoes estaticas sem instalar, migrar ou iniciar VM.
$ErrorActionPreference="Stop"
$folder=Join-Path $PSScriptRoot ".."
$paths=@(
  (Join-Path $folder "H2NativeAgent.ps1"),
  (Join-Path $folder "H2NativeControl.ps1"),
  (Join-Path $folder "H2NativeCore.psm1"),
  (Join-Path $folder "H2NativeScreen.ps1"),
  (Join-Path $folder "H2NativeIsoBootstrap.ps1"),
  (Join-Path $folder "H2NativeInstalledBoot.ps1")
)
foreach($path in $paths){
  $tokens=$null
  $parseErrors=$null
  [Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path $path).Path, [ref]$tokens, [ref]$parseErrors) | Out-Null
  if($parseErrors.Count -gt 0){throw ("Erro de sintaxe H2: "+$path+" "+($parseErrors|Out-String))}
}
$agent=Get-Content -LiteralPath (Join-Path $folder "H2NativeAgent.ps1") -Raw
$control=Get-Content -LiteralPath (Join-Path $folder "H2NativeControl.ps1") -Raw
foreach($expected in @("Global\H2AndroidNativeAgentSingleInstanceV1","WaitOne(0)","ReleaseMutex()","0.3.6-native-screen")){
  if(!$agent.Contains($expected)){throw ("Guarda de instancia unica ausente: "+$expected)}
}
foreach($expected in @(
  '$TaskName="H2 Android Agent"', '"agent.json"', 'Get-H2AgentToken',
  'H2NativeHostStatus', 'Parser]::ParseFile', 'Export-ScheduledTask',
  'Register-ScheduledTask', 'Migracao cancelada', '-Verb RunAs'
)){
  if(!$agent.Contains($expected)){throw ("Controle de migracao ausente: "+$expected)}
}
foreach($expected in @(
  'Get-H2NativeOwnedVm', 'hyperVReady', 'Assert-H2NativeReady',
  'H2NativeIsoBootstrap.ps1', '("create","clone","start","stop","tap","key")', 'New-H2NativeClone'
)){
  if(!$control.Contains($expected)){throw ("Controle nativo ausente: "+$expected)}
}
foreach($source in @($agent,$control)){
  foreach($forbidden in @('H2AdsWorker','AndroidStudio.exe','emulator.exe','adb.exe','Connect-VMNetworkAdapter','New-VMSwitch')){
    if($source.Contains($forbidden)){throw ("Motor nativo contem dependencia indevida: "+$forbidden)}
  }
}
$screen=Get-Content -LiteralPath (Join-Path $folder "H2NativeScreen.ps1") -Raw
if(!$screen.Contains('Microsoft:Hyper-V:System:Realized')) {
  throw "Captura nao filtra configuracao corrente pela propriedade VirtualSystemType."
}
if($screen.Contains('$_.SettingType')) {
  throw "Captura ainda usa SettingType, ausente no WMI v2."
}
$screen=Get-Content -LiteralPath (Join-Path $folder "H2NativeScreen.ps1") -Raw
foreach($expected in @("System.Collections.Generic.List[object]",'$size.Width','$size.Height')) {
  if(!$screen.Contains($expected)){throw ("Dimensoes de captura H2 nao tipadas: "+$expected)}
}
if($screen.Contains('$size[0]') -or $screen.Contains('$size[1]')) {
  throw "Conversao numerica ambigua da captura H2 continua presente."
}
Write-Host "PASS - H2 Native Agent, migracao e comandos limitados" -ForegroundColor Green
