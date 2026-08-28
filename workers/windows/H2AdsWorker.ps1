param(
  [switch]$Install,
  [switch]$Run,
  [switch]$Update,
  [string]$PanelUrl = "https://h2colombiano.com",
  [string]$PairingCode
)

$ErrorActionPreference = "Stop"
$AgentVersion = "1.3.0"
$WorkerDirectory = Join-Path $env:LOCALAPPDATA "H2AdsWorker"
$ConfigPath = Join-Path $WorkerDirectory "worker.json"
$InstalledScriptPath = Join-Path $WorkerDirectory "H2AdsWorker.ps1"
$RunnerPath = Join-Path $WorkerDirectory "browser-runner.mjs"
$SessionRunnerPath = Join-Path $WorkerDirectory "browser-session.mjs"
$ProfilesDirectory = Join-Path $WorkerDirectory "profiles"
$PackagePath = Join-Path $WorkerDirectory "package.json"
$TaskName = "H2 Ads Browser Worker"

function Get-ComputerLabel {
  $name = $env:COMPUTERNAME
  if ([string]::IsNullOrWhiteSpace($name)) { throw "Não foi possível identificar este computador." }
  return $name.Trim()
}

function Read-PairingCode {
  if ([string]::IsNullOrWhiteSpace($PairingCode)) {
    $securePairingCode = Read-Host "Cole o código temporário criado no painel H2 Ads" -AsSecureString
    $credential = [System.Management.Automation.PSCredential]::new("pairing", $securePairingCode)
    $PairingCode = $credential.GetNetworkCredential().Password
  }
  $candidate = $PairingCode.Trim()
  if ($candidate -notmatch '^H2W-[A-Za-z0-9_-]{24}$') {
    throw "Código de pareamento inválido. Crie um novo código no painel e cole somente o código solicitado pelo agente."
  }
  return $candidate
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

function Get-WorkerHeaders([object]$Config) {
  return @{
    Authorization = "Bearer $(Get-WorkerToken $Config)"
    "X-H2ADS-Worker-Key" = $Config.workerKey
    "X-H2ADS-Agent-Version" = $AgentVersion
  }
}

function Invoke-WorkerHeartbeat([object]$Config) {
  $body = @{ computerName = Get-ComputerLabel; agentVersion = $AgentVersion } | ConvertTo-Json -Compress
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/heartbeat" -Headers (Get-WorkerHeaders $Config) -ContentType "application/json" -Body $body | Out-Null
}

function Ensure-BrowserPreparationComponent([object]$Config) {
  if (!(Get-Command node.exe -ErrorAction SilentlyContinue)) { throw "Node.js não está disponível neste Worker." }
  if (!(Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw "npm não está disponível neste Worker." }
  Invoke-WebRequest -UseBasicParsing -Uri "$($Config.panelUrl)/api/h2ads/worker/windows-browser-runner.mjs" -OutFile $RunnerPath
  Invoke-WebRequest -UseBasicParsing -Uri "$($Config.panelUrl)/api/h2ads/worker/windows-browser-session.mjs" -OutFile $SessionRunnerPath
  @{ name = "h2ads-worker-local"; private = $true; type = "module"; dependencies = @{ "proxy-chain" = "3.0.0" } } | ConvertTo-Json -Compress | Set-Content -Path $PackagePath -Encoding UTF8 -NoNewline
  & npm.cmd install --omit=dev --ignore-scripts --no-audit --no-fund --prefix $WorkerDirectory | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Não foi possível preparar o relay local deste Worker." }
}

function Invoke-BrowserSession([object]$Config, [object]$Payload) {
  $profileDirectory = Join-Path $ProfilesDirectory "instance-$($Payload.command.instanceId)"
  if (!(Test-Path (Join-Path $profileDirectory "h2ads-profile.json"))) { throw "Perfil local não preparado." }
  $env:H2ADS_PANEL_URL = $Config.panelUrl
  $env:H2ADS_WORKER_KEY = $Config.workerKey
  $env:H2ADS_WORKER_TOKEN = Get-WorkerToken $Config
  $env:H2ADS_INSTANCE_ID = [string]$Payload.command.instanceId
  $env:H2ADS_COMMAND_ID = [string]$Payload.command.id
  $env:H2ADS_PROXY_JSON = ($Payload.proxy | ConvertTo-Json -Compress)
  $env:H2ADS_PROFILE_DIRECTORY = $profileDirectory
  try {
    Start-Process -FilePath "node.exe" -ArgumentList "`"$SessionRunnerPath`"" -WindowStyle Hidden | Out-Null
  } finally {
    Remove-Item Env:H2ADS_PANEL_URL, Env:H2ADS_WORKER_KEY, Env:H2ADS_WORKER_TOKEN, Env:H2ADS_INSTANCE_ID, Env:H2ADS_COMMAND_ID, Env:H2ADS_PROXY_JSON, Env:H2ADS_PROFILE_DIRECTORY -ErrorAction SilentlyContinue
  }
}

function Close-BrowserSession([object]$Config, [object]$Payload) {
  $profileDirectory = Join-Path $ProfilesDirectory "instance-$($Payload.command.instanceId)"
  $sessionPath = Join-Path $profileDirectory "h2ads-browser-session.json"
  if (Test-Path $sessionPath) {
    $session = Get-Content -Raw -Path $sessionPath | ConvertFrom-Json
    if ($session.nodePid) { & taskkill.exe /PID $session.nodePid /T /F | Out-Null }
    Remove-Item -Force $sessionPath -ErrorAction SilentlyContinue
  }
  $body = @{ command = "close_browser"; state = "closed" } | ConvertTo-Json -Compress
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/commands/$($Payload.command.id)/result" -Headers (Get-WorkerHeaders $Config) -ContentType "application/json" -Body $body | Out-Null
}

function Initialize-InstanceProfile([int]$InstanceId) {
  $profileDirectory = Join-Path $ProfilesDirectory "instance-$InstanceId"
  New-Item -ItemType Directory -Force -Path $profileDirectory | Out-Null
  @{ instanceId = $InstanceId; profileVersion = 1; createdAt = (Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json -Compress | Set-Content -Path (Join-Path $profileDirectory "h2ads-profile.json") -Encoding UTF8 -NoNewline
}

function Invoke-PendingBrowserCommand([object]$Config) {
  $headers = Get-WorkerHeaders $Config
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/commands/next" -Headers $headers
    if ($response.StatusCode -eq 204 -or [string]::IsNullOrWhiteSpace($response.Content)) { return }
    $payload = $response.Content | ConvertFrom-Json
    Ensure-BrowserPreparationComponent $Config
    if ($payload.command.command -eq "prepare_browser") {
      $runnerInput = @{ command = $payload.command.command; proxy = $payload.proxy } | ConvertTo-Json -Depth 5 -Compress
      $runnerOutput = $runnerInput | & node.exe $RunnerPath
      $result = $runnerOutput | ConvertFrom-Json
      if ($result.state -eq "proxy_verified" -and ![string]::IsNullOrWhiteSpace($result.observedIp)) {
        Initialize-InstanceProfile ([int]$payload.command.instanceId)
        $resultBody = @{ command = "prepare_browser"; state = "proxy_verified"; observedIp = $result.observedIp } | ConvertTo-Json -Compress
      } else {
        $resultBody = @{ command = "prepare_browser"; state = "blocked"; errorCategory = "proxy_unavailable" } | ConvertTo-Json -Compress
      }
      Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$($Config.panelUrl)/api/h2ads/worker/commands/$($payload.command.id)/result" -Headers $headers -ContentType "application/json" -Body $resultBody | Out-Null
      return
    }
    if ($payload.command.command -eq "launch_browser") { Invoke-BrowserSession $Config $payload; return }
    if ($payload.command.command -eq "close_browser") { Close-BrowserSession $Config $payload; return }
  } catch {
    # Falhas locais ou da rota não são gravadas no terminal nem reenviadas com detalhes sensíveis.
  }
}

function Stop-ExistingWorkerProcesses {
  try {
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" | Where-Object {
      $_.ProcessId -ne $PID -and
      $_.CommandLine -like "*$InstalledScriptPath*" -and
      $_.CommandLine -match '(?i)(?:^|\s)-Run(?:\s|$)'
    }
    foreach ($process in $processes) {
      Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
  } catch { }
}

function Start-InstalledWorker {
  Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstalledScriptPath`" -Run" -WindowStyle Hidden
}

function Acquire-WorkerMutex([object]$Config) {
  $safeWorkerKey = ([string]$Config.workerKey) -replace '[^A-Za-z0-9_-]', '_'
  $createdNew = $false
  $mutex = New-Object System.Threading.Mutex($true, "Local\H2AdsWorker-$safeWorkerKey", [ref]$createdNew)
  if (!$createdNew) {
    $mutex.Dispose()
    return $null
  }
  return $mutex
}

if ($Install) {
  New-Item -ItemType Directory -Force -Path $WorkerDirectory | Out-Null
  $validatedPairingCode = Read-PairingCode
  $claimBody = @{ pairingCode = $validatedPairingCode; computerName = Get-ComputerLabel; agentVersion = $AgentVersion } | ConvertTo-Json -Compress
  Remove-Variable -Name validatedPairingCode -ErrorAction SilentlyContinue
  $claimed = Invoke-RestMethod -Method Post -Uri "$($PanelUrl.TrimEnd('/'))/api/h2ads/worker/claim" -ContentType "application/json" -Body $claimBody
  Save-WorkerConfig $claimed
  Copy-Item -Path $PSCommandPath -Destination $InstalledScriptPath -Force
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstalledScriptPath`" -Run"
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Description "Presença autenticada e controle local do H2 Ads Browser Worker" -Force | Out-Null
  Stop-ExistingWorkerProcesses
  Start-InstalledWorker
  Write-Output "Worker H2 Ads pareado e iniciado."
  exit 0
}

if ($Update) {
  if (!(Test-Path $ConfigPath)) { throw "Configuração do Worker não encontrada. Faça o pareamento primeiro." }
  $config = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
  $downloadPath = Join-Path $WorkerDirectory "H2AdsWorker.ps1.download"
  Invoke-WebRequest -UseBasicParsing -Uri "$($config.panelUrl)/api/h2ads/worker/windows-agent.ps1" -OutFile $downloadPath
  if (!(Test-Path $downloadPath) -or (Get-Item $downloadPath).Length -lt 1000) { throw "O agente atualizado não foi baixado corretamente." }
  Stop-ExistingWorkerProcesses
  Copy-Item -Path $downloadPath -Destination $InstalledScriptPath -Force
  Remove-Item -Force $downloadPath -ErrorAction SilentlyContinue
  Start-InstalledWorker
  Write-Output "Agente H2 Ads atualizado para a versão publicada e iniciado."
  exit 0
}

if ($Run) {
  if (!(Test-Path $ConfigPath)) { throw "Configuração do Worker não encontrada. Faça o pareamento primeiro." }
  $config = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
  $workerMutex = Acquire-WorkerMutex $config
  if ($null -eq $workerMutex) { exit 0 }
  try {
    while ($true) {
      try { Invoke-WorkerHeartbeat $config } catch { }
      try { Invoke-PendingBrowserCommand $config } catch { }
      Start-Sleep -Seconds 10
    }
  } finally {
    try { $workerMutex.ReleaseMutex() } catch { }
    $workerMutex.Dispose()
  }
}

Write-Output "Use -Install para iniciar o pareamento ou -Update para atualizar um Worker já pareado."
