# H2 Android Native Agent v0.3.0 - substitui v0.2 sem Google SDK/ADB.
# Mantem token e pareamento EXISTENTES em %LOCALAPPDATA%\H2AndroidAgent\agent.json.
# Executa SOMENTE comandos allowlisted da API autenticada H2 Android.
[CmdletBinding()]
param(
  [switch]$Install,
  [switch]$Run,
  [switch]$Status,
  [switch]$Pair,
  [string]$PairingCode = "",
  [string]$PanelUrl = "https://h2colombiano.com"
)
$ErrorActionPreference="Stop"
$AgentVersion="0.3.0-native"
$Folder=Join-Path $env:LOCALAPPDATA "H2AndroidAgent"
$ConfigPath=Join-Path $Folder "agent.json"
$AgentPath=Join-Path $Folder "H2NativeAgent.ps1"
$ControlPath=Join-Path $Folder "H2NativeControl.ps1"
$TaskName="H2 Android Agent"
if($PanelUrl.TrimEnd("/") -cne "https://h2colombiano.com"){throw "Endereco do painel nao autorizado."}
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
. (Join-Path $PSScriptRoot "H2NativeControl.ps1")

function Get-H2AgentConfig {
  if(!(Test-Path -LiteralPath $ConfigPath -PathType Leaf)){throw "Agente sem pareamento. Gere um codigo no ADM."}
  $config=Get-Content -LiteralPath $ConfigPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  if(!$config.tokenProtected){throw "Token antigo ausente. Use pareamento no ADM."}
  return $config
}
function Get-H2AgentToken {
  $config=Get-H2AgentConfig
  $protected=ConvertTo-SecureString -String ([string]$config.tokenProtected) -ErrorAction Stop
  $creds=New-Object System.Management.Automation.PSCredential("native",$protected)
  return $creds.GetNetworkCredential().Password
}
function Pair-H2NativeAgent {
  if(Test-Path -LiteralPath $ConfigPath){throw "Agente ja pareado: preservando identidade. Nao gerar segundo agente."}
  if(!$Pair){throw "Pareamento somente com -Pair explicito."}
  $code=$PairingCode
  if(!$code){
    $secure=Read-Host "Codigo temporario gerado no ADM" -AsSecureString
    $creds=New-Object System.Management.Automation.PSCredential("pair",$secure)
    $code=$creds.GetNetworkCredential().Password
  }
  $code=($code -replace '[\s-]','').ToUpperInvariant()
  if($code -cnotmatch '^[A-F0-9]{32}$'){throw "Codigo invalido."}
  $body=@{pairingCode=$code;computerName=[Environment]::MachineName}|ConvertTo-Json -Compress
  $response=Invoke-RestMethod -UseBasicParsing -Method Post -Uri "$PanelUrl/api/h2-android/agent/claim" -ContentType "application/json" -Body $body -TimeoutSec 20
  $protected=ConvertTo-SecureString -String ([string]$response.agentToken) -AsPlainText -Force|ConvertFrom-SecureString
  New-Item -ItemType Directory -Path $Folder -Force|Out-Null
  @{baseUrl=$PanelUrl;agentId=$response.agentId;tokenProtected=$protected}|ConvertTo-Json -Compress|
    Set-Content -LiteralPath $ConfigPath -Encoding UTF8
}
function Install-H2NativeAgent {
  # Nenhuma exclusao do agente antigo antes de copiar e validar o NOVO.
  $status=Get-H2NativeHostStatus
  if(!$status.ready){throw ("Hyper-V nao preparado. Agente antigo foi preservado. "+$status.reason)}
  if(!(Test-Path -LiteralPath $ConfigPath -PathType Leaf)){
    throw "Pareamento antigo nao localizado. Utilize -Pair explicitamente antes de instalar."
  }
  Get-H2AgentConfig|Out-Null
  $required=@(
    "H2NativeAgent.ps1","H2NativeControl.ps1","H2NativeCore.psm1",
    "H2NativeReadiness.ps1","H2NativeIsoBootstrap.ps1","H2NativeInstalledBoot.ps1",
    "H2NativeFirstBoot.ps1","H2NativeBootAudit.ps1","H2NativeDoctor.ps1"
  )
  foreach($name in $required){
    if(!(Test-Path -LiteralPath (Join-Path $PSScriptRoot $name) -PathType Leaf)){
      throw "Pacote incompleto: $name. Agente anterior nao foi removido."
    }
  }
  New-Item -ItemType Directory -Path $Folder -Force|Out-Null
  # Atualiza SOMENTE arquivos do novo agente; nao altera H2 Ads ou outros servicos.
  foreach($name in $required){
    $source=Join-Path $PSScriptRoot $name
    $destination=Join-Path $Folder $name
    if([IO.Path]::GetFullPath($source) -ine [IO.Path]::GetFullPath($destination)){
      Copy-Item -LiteralPath $source -Destination $destination -Force -ErrorAction Stop
    }
  }
  # Preservar o token antigo; reusar o mesmo nome de tarefa para evitar duplicidade.
  $arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$AgentPath+'" -Run'
  $action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments
  $trigger=New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Highest
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force -ErrorAction Stop|Out-Null
  # Somente depois do registro correto, para agente antigo sem processo duplicado.
  $legacyPath=Join-Path $Folder "H2AndroidAgent.ps1"
  Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($legacyPath) -and $_.CommandLine -match ' -Run( |$)' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  # Atalho de inicializacao antigo, APENAS se apontar exatamente para H2 Android.
  $startup=Join-Path ([Environment]::GetFolderPath("Startup")) "H2 Android Agent.lnk"
  if(Test-Path -LiteralPath $startup -PathType Leaf){
    try {
      $link=(New-Object -ComObject WScript.Shell).CreateShortcut($startup)
      if($link.Arguments -like "*H2AndroidAgent.ps1*"){
        Remove-Item -LiteralPath $startup -Force -ErrorAction Stop
      }
    } catch { Write-Warning ("Atalho legado nao removido: "+$_.Exception.Message) }
  }
  Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -WindowStyle Hidden|Out-Null
  Write-Host "Agente nativo iniciado com pareamento preservado. Arquivos antigos mantidos como recuperacao."
}
function Run-H2NativeAgent {
  $token=Get-H2AgentToken
  $headers=@{Authorization="Bearer $token"}
  $heartbeat=[datetime]::MinValue
  while($true){
    try{
      if((Get-Date) -ge $heartbeat){
        $report=Get-H2NativeAgentReport|ConvertTo-Json -Depth 6 -Compress
        Invoke-RestMethod -Method Post -UseBasicParsing -Uri "$PanelUrl/api/h2-android/agent/heartbeat" -ContentType "application/json" -Headers $headers -Body $report -TimeoutSec 20|Out-Null
        $heartbeat=(Get-Date).AddSeconds(25)
      }
      $poll=Invoke-RestMethod -Method Post -UseBasicParsing -Uri "$PanelUrl/api/h2-android/agent/pull" -ContentType "application/json" -Headers $headers -Body "{}" -TimeoutSec 20
      if($poll.command){
        $ok=$true
        $message=""
        try{$message=[string](Invoke-H2NativeControl -Command $poll.command)}
        catch{$ok=$false;$message=$_.Exception.Message}
        if($message.Length -gt 300){$message=$message.Substring(0,300)}
        $payload=@{id=[string]$poll.command.id;ok=$ok;message=$message}|ConvertTo-Json -Compress
        Invoke-RestMethod -Method Post -UseBasicParsing -Uri "$PanelUrl/api/h2-android/agent/finish" -ContentType "application/json" -Headers $headers -Body $payload -TimeoutSec 20|Out-Null
        $heartbeat=[datetime]::MinValue
      }
      # Nao publicar frames de tela falsos; Hyper-V ainda nao tem canal grafico remoto autenticado.
    }catch{
      Write-Warning ("H2 Native: "+$_.Exception.Message)
    }
    Start-Sleep -Seconds 4
  }
}
if($Status){
  Get-H2NativeAgentReport|ConvertTo-Json -Depth 6
}elseif($Install){
  Install-H2NativeAgent
}elseif($Pair){
  Pair-H2NativeAgent
}elseif($Run){
  Run-H2NativeAgent
}else{
  Write-Host "H2 Android Native $AgentVersion"
  Write-Host "Use -Status, -Install (substituicao segura) ou -Pair (somente sem token)."
}
