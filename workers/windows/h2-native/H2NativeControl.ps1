# H2 Android Native - motor de comandos exclusivo Hyper-V (Windows PowerShell 5.1).
# Nao executa Android Studio, SDK, ADB ou motor de H2 ADS.
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot "H2NativeCore.psm1") -Force -ErrorAction Stop
. (Join-Path $PSScriptRoot "H2NativeScreen.ps1")

function ConvertTo-H2NativeVmName {
  param([Parameter(Mandatory=$true)][string]$AvdName)
  if ($AvdName -cnotmatch '^H2Android_([0-9]{2,3})$') { throw "Nome H2 Android invalido." }
  $num = [int]$Matches[1]
  if ($num -lt 1 -or $num -gt 999) { throw "Numero de VM invalido." }
  $vmName = "H2N_" + $num.ToString("000")
  Assert-H2NativeName $vmName
  return $vmName
}
function ConvertTo-H2AndroidName {
  param([string]$VMName)
  Assert-H2NativeName $VMName
  return ("H2Android_" + ([int]$VMName.Substring(4)).ToString("00"))
}
function Get-H2NativeAgentReport {
  $hostInfo = Get-H2NativeHostStatus
  $inventory = @()
  if ($hostInfo.hyperVReady) {
    $inventory = @(Get-H2NativeInventory | Where-Object { $_.state -ne "BLOCKED" -and $_.networkConnected -eq $false })
  }
  $names = @($inventory | ForEach-Object { ConvertTo-H2AndroidName $_.name })
  $running = @($inventory | Where-Object { $_.state -eq "Running" } | ForEach-Object { ConvertTo-H2AndroidName $_.name })
  $computer = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue
  $cpu = Get-CimInstance -ClassName Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
  $ram = if ($null -ne $computer) { [Math]::Round(([double]$computer.TotalPhysicalMemory / 1GB),1) } else { $null }
  $processors = if ($null -ne $computer) { [int]$computer.NumberOfLogicalProcessors } else { $null }
  $virt = if ($null -ne $cpu -and $null -ne $cpu.VirtualizationFirmwareEnabled) { [bool]$cpu.VirtualizationFirmwareEnabled } else { $null }
  $windowsText = [Environment]::OSVersion.VersionString
  $computerName = [Environment]::MachineName
  return @{
    computerName = $computerName.Substring(0,[Math]::Min(80,$computerName.Length))
    windowsVersion = $windowsText.Substring(0,[Math]::Min(100,$windowsText.Length))
    agentVersion = "0.3.7-native-screen"
    sdkDetected = $false
    adbDetected = $false
    emulatorDetected = $false
    avdNames = @($names | Select-Object -First 20)
    emulatorDevices = @()
    runningAvds = @($running | Select-Object -First 10)
    configuredProxies = @{}
    ramGb = $ram
    logicalProcessors = $processors
    virtualizationEnabled = $virt
    hyperVReady = [bool]$hostInfo.hyperVReady
    hyperVReason = ([string]$hostInfo.reason).Substring(0,[Math]::Min(240,([string]$hostInfo.reason).Length))
  }
}

function Invoke-H2NativeControl {
  param([Parameter(Mandatory=$true)]$Command)
  $name = ConvertTo-H2NativeVmName -AvdName ([string]$Command.avdName)
  $action = [string]$Command.action
  if ($action -cnotin @("create","clone","start","stop","tap","key")) {
    throw "Funcao nao disponivel neste motor: $action. Rede, tela e teclas continuam bloqueadas."
  }
  Assert-H2NativeReady
  if ($action -ceq "tap") {
    if ($null -eq $Command.payload) { throw "Coordenadas ausentes." }
    Invoke-H2NativeConsoleTap -VMName $name -X ([int]$Command.payload.x) -Y ([int]$Command.payload.y)
    return "Toque enviado ao console nativo."
  }
  if ($action -ceq "key") {
    if ($null -eq $Command.payload) { throw "Tecla ausente." }
    Invoke-H2NativeConsoleKey -VMName $name -Key ([string]$Command.payload.key)
    return "Tecla enviada ao console nativo."
  }
  if ($action -ceq "create") {
    if ($null -eq $Command.payload) { throw "Imagem Android nao informada no ADM." }
    $iso = [string]$Command.payload.isoPath
    $sha = [string]$Command.payload.isoSha256
    if ($iso.Length -lt 5 -or $iso.Length -gt 400 -or [IO.Path]::GetExtension($iso) -ine ".iso" -or !(Test-H2NativeHash $sha)) {
      throw "Informe uma ISO Android local e o SHA-256 valido no ADM."
    }
    $allowUnsigned = $Command.payload.allowUnsignedBoot -eq $true
    $res = & (Join-Path $PSScriptRoot "H2NativeIsoBootstrap.ps1") -Action Prepare -VMName $name -IsoPath $iso -ExpectedSha256 $sha -AllowUnsignedBoot:$allowUnsigned -Json | ConvertFrom-Json -ErrorAction Stop
    if (!$res.readyForOfflineBootAttempt -or $res.networkConnected) { throw "VM preparada mas auditoria offline nao passou." }
    return "VM H2 preparada OFFLINE. Ainda falta instalar o Android no disco."
  }
  if ($action -ceq "clone") {
    if ($null -eq $Command.payload) { throw "Origem do Android nao informada." }
    $source = ConvertTo-H2NativeVmName -AvdName ([string]$Command.payload.sourceAvdName)
    $result = New-H2NativeClone -VMName $name -SourceVMName $source
    return ("VM H2 criada offline a partir de " + $result.clonedFrom + ". Inicializacao e identidade independente ainda exigem validacao.")
  }
  Get-H2NativeOwnedVm -VMName $name | Out-Null
  if ($action -ceq "stop") {
    $state = Stop-H2NativeVm -VMName $name
    return ("VM H2: " + $state.state)
  }
  $manifestPath = Join-Path (Split-Path (Get-H2NativeDiskPath $name) -Parent) "manifest.json"
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  $mode = [string]$manifest.mode
  if ($mode -ceq "ISO_INSTALLER") {
    $result = & (Join-Path $PSScriptRoot "H2NativeIsoBootstrap.ps1") -Action Start -VMName $name -Json | ConvertFrom-Json -ErrorAction Stop
  } elseif ($mode -ceq "DISK_FIRST_BOOT") {
    $result = & (Join-Path $PSScriptRoot "H2NativeInstalledBoot.ps1") -Action Start -VMName $name -Json | ConvertFrom-Json -ErrorAction Stop
  } else {
    $result = & (Join-Path $PSScriptRoot "H2NativeFirstBoot.ps1") -Action Start -VMName $name -Json | ConvertFrom-Json -ErrorAction Stop
  }
  return ("VM H2: " + [string]$result.state + ". Boot Android ainda nao comprovado.")
}
