param(
  [switch]$Install,
  [switch]$Run,
  [string]$PanelUrl = "https://h2colombiano.com",
  [string]$PairingCode
)

$ErrorActionPreference = "Stop"
$AgentVersion = "1.0.0"
$WorkerDirectory = Join-Path $env:LOCALAPPDATA "H2AdsWorker"
$ConfigPath = Join-Path $WorkerDirectory "worker.json"
$InstalledScriptPath = Join-Path $WorkerDirectory "H2AdsWorker.ps1"
$TaskName = "H2 Ads Browser Worker"

function Get-ComputerLabel {
  $name = $env:COMPUTERNAME
  if ([string]::IsNullOrWhiteSpace($name)) { throw "Não foi possível identificar este computador." }
  return $name.Trim()
}

function Save-WorkerConfig([object]$Claimed) {
  $secureToken = ConvertTo-SecureString -String $Claimed.workerToken -AsPlainText -Force
  $protectedToken = ConvertFrom-SecureString -SecureString $secureToken
  $config = [ordered]@{
    panelUrl = $PanelUrl.TrimEnd("/")
    workerKey = $Claimed.workerKey
    protectedToken = $protectedToken
    workerName = $Claimed.workerName
    capacity = $Claimed.capacity
    agentVersion = $AgentVersion
  }
  $config | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8 -NoNewline
}

function Get-WorkerToken([object]$Config) {
  $secureToken = ConvertTo-SecureString -String $Config.protectedToken
  $credential = [System.Management.Automation.PSCredential]::new("worker", $secureToken)
  return $credential.GetNetworkCredential().Password
}

function Invoke-WorkerHeartbeat([object]$Config) {
  $headers = @{ Authorization = "Bearer $(Get-WorkerToken $Config)"; "X-H2ADS-Worker-Key" = $Config.workerKey }
  $body = @{ computerName = Get-ComputerLabel; agentVersion = $AgentVersion } | ConvertTo-Json -Compress
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/heartbeat" -Headers $headers -ContentType "application/json" -Body $body | Out-Null
}

if ($Install) {
  if ([string]::IsNullOrWhiteSpace($PairingCode)) { throw "Informe o código temporário criado no painel H2 Ads." }
  New-Item -ItemType Directory -Force -Path $WorkerDirectory | Out-Null
  $claimBody = @{ pairingCode = $PairingCode.Trim(); computerName = Get-ComputerLabel; agentVersion = $AgentVersion } | ConvertTo-Json -Compress
  $claimed = Invoke-RestMethod -Method Post -Uri "$($PanelUrl.TrimEnd('/'))/api/h2ads/worker/claim" -ContentType "application/json" -Body $claimBody
  Save-WorkerConfig $claimed
  Copy-Item -Path $PSCommandPath -Destination $InstalledScriptPath -Force
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstalledScriptPath`" -Run"
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Description "Presença autenticada do H2 Ads Browser Worker" -Force | Out-Null
  Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstalledScriptPath`" -Run" -WindowStyle Hidden
  Write-Output "Worker H2 Ads pareado e iniciado. Este agente apenas comunica presença; não abre browsers nesta fase."
  exit 0
}

if ($Run) {
  if (!(Test-Path $ConfigPath)) { throw "Configuração do Worker não encontrada. Faça o pareamento primeiro." }
  $config = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
  while ($true) {
    try { Invoke-WorkerHeartbeat $config } catch { }
    Start-Sleep -Seconds 20
  }
}

Write-Output "Use -Install -PairingCode <código> para parear este Windows com o H2 Ads."
