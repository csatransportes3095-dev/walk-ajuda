# H2 Android Native - primeiro boot isolado com Windows Hyper-V.
# Por padrao apenas diagnostica; nao abre VM, nao muda rede e nao instala apps.
[CmdletBinding()]
param(
  [ValidateSet("Host","List","Create","Audit","Start","Console","Stop")]
  [string]$Action = "Host",
  [string]$VMName = "",
  [string]$ImagePath = "",
  [string]$ImageSha256 = "",
  [switch]$AllowUnsignedBoot,
  [switch]$Json
)
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "H2NativeCore.psm1") -Force -ErrorAction Stop
$auditScript = Join-Path $PSScriptRoot "H2NativeBootAudit.ps1"
$readinessScript = Join-Path $PSScriptRoot "H2NativeReadiness.ps1"

function Write-H2NativeResult {
  param([Parameter(Mandatory=$true)]$Result)
  if ($Json) { $Result | ConvertTo-Json -Depth 7 }
  else { $Result | Format-List | Out-String | Write-Output }
}
function Assert-H2NativeOfflineAudit {
  param([string]$Name)
  Assert-H2NativeName $Name
  $raw = & $auditScript -VMName $Name -Json
  $audit = $raw | ConvertFrom-Json
  if (!$audit.safeToAttemptOfflineBoot -or $audit.networkConnected -or !$audit.diskConsistent) {
    throw "Boot offline recusado: disco, ownership ou rede da VM nao passaram na auditoria."
  }
  return $audit
}

switch ($Action) {
  "Host" {
    # Somente leitura; tambem funciona antes do Hyper-V ser ativado.
    $report = & $readinessScript -Json | ConvertFrom-Json
    Write-H2NativeResult $report
  }
  "List" {
    # Apenas VMs H2 com ownership autenticado por manifesto e VM ID.
    $report = [pscustomobject]@{
      project = "H2 Android Native"
      vms = @(Get-H2NativeInventory)
    }
    Write-H2NativeResult $report
  }
  "Create" {
    Assert-H2NativeName $VMName
    if ([string]::IsNullOrWhiteSpace($ImagePath) -or !(Test-H2NativeHash $ImageSha256)) {
      throw "Informe uma imagem AOSP x86_64 UEFI VHDX e seu SHA-256 valido."
    }
    # Provisionamento offline; nenhum switch/rede e nenhuma imagem baixada.
    $vm = New-H2NativeVm -VMName $VMName -ImagePath $ImagePath -ImageSha256 $ImageSha256 -AllowUnsignedBoot:$AllowUnsignedBoot
    Write-H2NativeResult $vm
  }
  "Audit" {
    Assert-H2NativeName $VMName
    $report = & $auditScript -VMName $VMName -Json | ConvertFrom-Json
    Write-H2NativeResult $report
  }
  "Start" {
    $audit = Assert-H2NativeOfflineAudit -Name $VMName
    # O host so liga VMs que pertencem ao H2 e estao sem adaptador conectado.
    $result = Start-H2NativeVm -VMName $VMName
    Write-H2NativeResult $result
  }
  "Console" {
    Assert-H2NativeOfflineAudit -Name $VMName | Out-Null
    $vm = Get-H2NativeOwnedVm $VMName
    if ([string]$vm.State -ne "Running") {
      throw "A VM precisa estar ligada pelo H2. Use -Action Start antes de abrir o console."
    }
    $connectPath = Join-Path $env:WINDIR "System32\vmconnect.exe"
    if (!(Test-Path -LiteralPath $connectPath -PathType Leaf)) {
      throw "VMConnect do Windows nao foi localizado. Verifique os recursos nativos do Hyper-V."
    }
    # VMConnect.exe e componente nativo do Windows; nao executa Android Studio,
    # ADB, emulador Google, proxy ou comandos remotos.
    Start-Process -FilePath $connectPath -ArgumentList @("localhost", $VMName) -ErrorAction Stop | Out-Null
    Write-H2NativeResult ([pscustomobject]@{
      vmName = $VMName
      console = "Windows VMConnect"
      networkConnected = $false
      androidBootVerified = $false
      note = "Console local aberto. Confirme visualmente o boot do Android AOSP."
    })
  }
  "Stop" {
    Assert-H2NativeName $VMName
    $result = Stop-H2NativeVm -VMName $VMName
    Write-H2NativeResult $result
  }
}
