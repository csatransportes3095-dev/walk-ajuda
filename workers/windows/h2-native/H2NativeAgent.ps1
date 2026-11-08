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
  # Fase 1: validar tudo ANTES de tocar no processo e tarefa existentes.
  $hostReadiness=Get-H2NativeHostStatus
  if(!$hostReadiness.ready){throw ("Hyper-V nao preparado. Agente antigo preservado. "+$hostReadiness.reason)}
  $config=Get-H2AgentConfig
  $token=Get-H2AgentToken
  if($token -cnotmatch '^[a-f0-9]{64}$'){throw "Token antigo invalido. Nenhuma migracao executada."}
  $required=@(
    "H2NativeAgent.ps1","H2NativeControl.ps1","H2NativeCore.psm1",
    "H2NativeReadiness.ps1","H2NativeIsoBootstrap.ps1","H2NativeInstalledBoot.ps1",
    "H2NativeFirstBoot.ps1","H2NativeBootAudit.ps1","H2NativeDoctor.ps1"
  )
  foreach($name in $required){
    $source=Join-Path $PSScriptRoot $name
    if(!(Test-Path -LiteralPath $source -PathType Leaf)){
      throw "Pacote incompleto: $name. Agente antigo preservado."
    }
    # Parser de PS5.1: um arquivo com erro de sintaxe nao substitui o antigo.
    $tokens=$null
    $syntaxErrors=$null
    [Management.Automation.Language.Parser]::ParseFile(
      $source,[ref]$tokens,[ref]$syntaxErrors) | Out-Null
    if($syntaxErrors.Count -gt 0){throw ("Erro de sintaxe em "+$name+". Agente antigo preservado.")}
  }
  $report=Get-H2NativeAgentReport | ConvertTo-Json -Depth 6 -Compress
  $headers=@{Authorization="Bearer $token"}
  try {
    # Somente heartbeat H2 Android. Verifica autenticacao/compatibilidade da nova API.
    Invoke-RestMethod -Method Post -UseBasicParsing -Uri "$PanelUrl/api/h2-android/agent/heartbeat" -Headers $headers -ContentType "application/json" -Body $report -TimeoutSec 20 | Out-Null
  } catch {
    throw "Servidor ADM nao aceitou o agente nativo. Nenhuma substituicao executada."
  }
  New-Item -ItemType Directory -Path $Folder -Force | Out-Null
  foreach($name in $required){
    $source=Join-Path $PSScriptRoot $name
    $target=Join-Path $Folder $name
    if([IO.Path]::GetFullPath($source) -ine [IO.Path]::GetFullPath($target)){
      Copy-Item -LiteralPath $source -Destination $target -Force -ErrorAction Stop
    }
  }
  # Fase 2: guardar tarefa anterior em memoria; substituir SOMENTE H2 Android Agent.
  $oldTask=Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  $oldTaskXml=$null
  if($oldTask){$oldTaskXml=Export-ScheduledTask -TaskName $TaskName -ErrorAction Stop}
  $executable="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$AgentPath+'" -Run'
  $legacyPath=Join-Path $Folder "H2AndroidAgent.ps1"
  $legacyStopped=$false
  $newProcess=$null
  $taskReplaced=$false
  try {
    $action=New-ScheduledTaskAction -Execute $executable -Argument $arguments
    $trigger=New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Highest
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force -ErrorAction Stop | Out-Null
    $taskReplaced=$true

    # Encerrar SOMENTE instancia antiga vinculada ao caminho exato deste agente.
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($legacyPath) -and $_.CommandLine -match ' -Run( |$)' } |
      ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
        $legacyStopped=$true
      }
    $newProcess=Start-Process -FilePath $executable -ArgumentList $arguments -WindowStyle Hidden -PassThru -ErrorAction Stop
    Start-Sleep -Seconds 3
    $newProcess.Refresh()
    if($newProcess.HasExited){throw "Novo agente encerrou imediatamente. Revertendo tarefa antiga."}
  } catch {
    $errorText=$_.Exception.Message
    if($taskReplaced){
      try {
        if($oldTaskXml){
          Register-ScheduledTask -TaskName $TaskName -Xml $oldTaskXml -Force -ErrorAction Stop | Out-Null
        } else {
          Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
        }
      } catch { Write-Warning "Nao foi possivel restaurar a tarefa anterior. Confira Agendador de Tarefas." }
    }
    if($legacyStopped -and (Test-Path -LiteralPath $legacyPath -PathType Leaf)){
      try {
        $legacyArgs='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$legacyPath+'" -Run'
        Start-Process -FilePath $executable -ArgumentList $legacyArgs -WindowStyle Hidden -ErrorAction Stop | Out-Null
      } catch { Write-Warning "Reinicie o agente legado manualmente, se necessario." }
    }
    throw ("Migracao cancelada; agente anterior preservado ou restaurado. "+$errorText)
  }

  # Fase 3: so apagar atalho legado DEPOIS da nova instancia ficar ativa.
  $startup=Join-Path ([Environment]::GetFolderPath("Startup")) "H2 Android Agent.lnk"
  if(Test-Path -LiteralPath $startup -PathType Leaf){
    try {
      $link=(New-Object -ComObject WScript.Shell).CreateShortcut($startup)
      if($link.Arguments -like "*H2AndroidAgent.ps1*"){
        Remove-Item -LiteralPath $startup -Force -ErrorAction Stop
      }
    } catch { Write-Warning ("Atalho legado nao removido: "+$_.Exception.Message) }
  }
  Write-Host "H2 Android Nativo instalado. Pareamento preservado; arquivos do agente antigo mantidos para recuperacao."
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
  $hostReadiness=Get-H2NativeHostStatus
  if(!$hostReadiness.administrator){
    # Apenas o instalador solicita UAC; o agente nunca ativa o Hyper-V sozinho.
    $exe="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $args='-NoProfile -ExecutionPolicy Bypass -File "'+$PSCommandPath+'" -Install'
    $elevated=Start-Process -FilePath $exe -ArgumentList $args -Verb RunAs -Wait -PassThru -ErrorAction Stop
    if($elevated.ExitCode -ne 0){throw "Permissao de administrador nao concedida ou migracao falhou. Agente anterior preservado."}
  }else{
    Install-H2NativeAgent
  }
}elseif($Pair){
  Pair-H2NativeAgent
}elseif($Run){
  Run-H2NativeAgent
}else{
  Write-Host "H2 Android Native $AgentVersion"
  Write-Host "Use -Status, -Install (substituicao segura) ou -Pair (somente sem token)."
}
