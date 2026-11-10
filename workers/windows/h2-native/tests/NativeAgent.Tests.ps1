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
foreach($expected in @("Global\H2AndroidNativeAgentSingleInstanceV1","WaitOne(0)","ReleaseMutex()","0.3.8-native-screen")){
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
foreach($expected in @('[int]::TryParse($widthText', '[int]::TryParse($heightText', 'literal "x"')) {
  if(!$screen.Contains($expected)){throw ("Guard de dimensao WMI invalida ausente: "+$expected)}
}
if($screen.Contains('$size[0]') -or $screen.Contains('$size[1]')) {
  throw "Conversao numerica ambigua da captura H2 continua presente."
}
# Execute the diagnostic formatter, not just a static string inspection.
. (Join-Path $folder "H2NativeScreen.ps1")
$formatted = Format-H2NativeScreenDiagnostic -Width 640 -Height 480 -Detail "WMI=32770"
if ($formatted -cne "640x480: WMI=32770") {
  throw "Diagnostico de captura falhou: $formatted"
}
if ($screen.Contains('$width + "x" + $height')) {
  throw "Concatenacao numerica perigosa ainda presente nos erros de captura."
}
# Verify a genuine RGB565 decoder path in PowerShell 5.1, including WALKARTS' four extra bytes.
$w=160; $h=120
$rawPixels=New-Object byte[] ($w*$h*2)
for ($i=0; $i -lt $rawPixels.Length; $i++) { $rawPixels[$i]=[byte](($i*37+11) % 256) }
$extraPixels=New-Object byte[] ($rawPixels.Length+4)
[Array]::Copy($rawPixels,$extraPixels,$rawPixels.Length)
$extraPixels[$rawPixels.Length]=191
$extraPixels[$rawPixels.Length+1]=192
$extraPixels[$rawPixels.Length+2]=193
$extraPixels[$rawPixels.Length+3]=194
$plainPng=Convert-H2NativeRgb565ToPng -ImageData $rawPixels -Width $w -Height $h
$tailPng=Convert-H2NativeRgb565ToPng -ImageData $extraPixels -Width $w -Height $h
if ($plainPng -cne $tailPng) { throw "A captura RGB565 com 4 bytes excedentes alterou os pixels." }
$decodedPng=[Convert]::FromBase64String($tailPng)
$signature=[byte[]]@(137,80,78,71,13,10,26,10)
for($i=0;$i -lt $signature.Length;$i++){
  if($decodedPng[$i] -ne $signature[$i]){throw "Captura nao gerou PNG valido."}
}
$invalidPixels=New-Object byte[] ($rawPixels.Length+2)
[Array]::Copy($rawPixels,$invalidPixels,$rawPixels.Length)
$invalidRejected=$false
try { Convert-H2NativeRgb565ToPng -ImageData $invalidPixels -Width $w -Height $h | Out-Null }
catch { $invalidRejected=$true }
if (!$invalidRejected) { throw "Comprimento RGB565 inesperado foi aceito." }
Write-Host "PASS - H2 Native Agent, migracao e comandos limitados" -ForegroundColor Green
